# -*- coding: utf-8 -*-
"""
opencode_client_v2.py  —  基于 opencode-agent-sdk 的交互式多轮对话客户端

用法：
    python opencode_client_v2.py              # 新建会话
    python opencode_client_v2.py --list       # 选择已有会话
    python opencode_client_v2.py --session ID # 接入指定会话
"""

import sys
import io
import asyncio
import argparse
import json
from typing import Any, AsyncIterator

import httpx

from opencode_agent_sdk import (
    SDKClient,
    AgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    ResultMessage,
    SystemMessage,
)
from opencode_agent_sdk._internal.http_transport import HTTPTransport

BASE_URL    = "http://127.0.0.1:60272"
PROVIDER_ID = "zhipuai-coding-plan"
MODEL_ID    = "glm-5.1"

RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
DIM    = "\033[2m"
RED    = "\033[31m"


# ══════════════════════════════════════════════════════════════════════════════
# 修复 HTTPTransport：
#   1. connect() 带上 agent="build" 和正确的 model 字段
#   2. chat_stream() 把 model 包成嵌套对象 {"model":{"providerID","modelID"}}
# ══════════════════════════════════════════════════════════════════════════════

class PatchedHTTPTransport(HTTPTransport):
    """修复 opencode serve 的会话创建和消息格式。"""

    def __init__(self, base_url: str, provider_id: str, model_id: str, **kw):
        super().__init__(base_url, **kw)
        self._provider_id = provider_id
        self._model_id    = model_id

    async def connect(self, cwd: str | None = None) -> None:
        """创建会话时加入 agent="build" 和 model，否则 AI 不响应。"""
        resp = await self._client.post(
            "/session",
            json={
                "agent": "build",
                "model": {
                    "id":         self._model_id,
                    "providerID": self._provider_id,
                },
            },
        )
        resp.raise_for_status()
        self._session_id = resp.json()["id"]

    async def connect_existing(self, session_id: str) -> None:
        """接入一个已有会话，不创建新会话。"""
        self._session_id = session_id

    async def chat_stream(
        self,
        parts: list[dict[str, Any]],
        model_id: str = "",
        provider_id: str = "",
    ) -> AsyncIterator[SystemMessage | AssistantMessage | ResultMessage]:
        """覆盖父类：把 model 包成服务端期望的嵌套格式。"""
        if not self._session_id:
            raise RuntimeError("No session.")

        body: dict[str, Any] = {
            "parts": parts,
            "model": {
                "providerID": provider_id or self._provider_id,
                "modelID":    model_id    or self._model_id,
            },
        }

        seen_text: dict[str, str] = {}
        tool_states: dict[str, str] = {}
        session_id = self._session_id

        async with httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(None, connect=10.0),
        ) as sse_client:
            async with sse_client.stream(
                "GET", "/event",
                headers={"Accept": "text/event-stream"},
            ) as sse_response:
                send_task = asyncio.create_task(
                    self._client.post(
                        f"/session/{self._session_id}/message",
                        json=body,
                    )
                )
                try:
                    async for event in self._parse_sse(sse_response):
                        etype = event.get("type", "")
                        props = event.get("properties", {})

                        if etype == "message.part.updated":
                            part = props.get("part", {})
                            if part.get("sessionID") != session_id:
                                continue
                            msg = self._translate_sse_part(
                                part, seen_text, tool_states
                            )
                            if msg is not None:
                                yield msg

                        elif etype == "session.idle":
                            if props.get("sessionID") == session_id:
                                break

                        elif etype == "session.error":
                            if props.get("sessionID") == session_id:
                                err = props.get("error", {})
                                msg = err.get("data", {}).get("message", str(err))
                                raise RuntimeError(f"Session error: {msg}")
                finally:
                    if not send_task.done():
                        send_task.cancel()
                    try:
                        await send_task
                    except Exception:
                        pass


# ══════════════════════════════════════════════════════════════════════════════
# SDKClient 子类：注入 PatchedHTTPTransport
# ══════════════════════════════════════════════════════════════════════════════

class OpencodeClient(SDKClient):
    """用 PatchedHTTPTransport 替换默认的 HTTPTransport。"""

    def __init__(self, server_url: str, provider_id: str, model_id: str):
        super().__init__(
            options=AgentOptions(
                server_url=server_url,
                model=model_id,
                provider_id=provider_id,
            )
        )
        self._patched = PatchedHTTPTransport(
            base_url=server_url,
            provider_id=provider_id,
            model_id=model_id,
        )

    async def connect(self) -> None:
        self._transport   = self._patched
        self._http_mode   = True
        await self._patched.connect()

    async def connect_existing(self, session_id: str) -> None:
        self._transport   = self._patched
        self._http_mode   = True
        await self._patched.connect_existing(session_id)

    @property
    def session_id(self) -> str:
        return self._patched.session_id


# ══════════════════════════════════════════════════════════════════════════════
# 会话管理（直接调 REST，不走 SDK）
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_sessions(base_url: str) -> list[dict]:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{base_url}/session")
        r.raise_for_status()
        return r.json()


async def choose_session(base_url: str) -> str | None:
    """打印已有会话列表，返回选中的 session_id，None 表示新建。"""
    sessions = await fetch_sessions(base_url)
    if not sessions:
        return None

    print(f"\n{BOLD}已有会话:{RESET}")
    for i, s in enumerate(sessions):
        model = (s.get("model") or {}).get("id", "?")
        title = s.get("title", "无标题")
        print(
            f"  [{i}] {title:<32} "
            f"{DIM}{model:<12}{RESET}  "
            f"{DIM}{s['id']}{RESET}"
        )
    print(f"  [n] 新建会话")

    choice = input("\n选择编号（默认新建）: ").strip()
    if not choice or choice.lower() == "n":
        return None
    try:
        return sessions[int(choice)]["id"]
    except (ValueError, IndexError):
        print("输入无效，自动新建。")
        return None


# ══════════════════════════════════════════════════════════════════════════════
# 交互式 REPL
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_result(msg: ResultMessage) -> str:
    u = msg.usage
    return (
        f"{DIM}[tokens in={u.input_tokens} out={u.output_tokens} "
        f"cost=${msg.total_cost_usd:.4f}]{RESET}"
    )


async def repl(client: OpencodeClient) -> None:
    sid = client.session_id
    print(f"\n{BOLD}{CYAN}━━━ opencode 客户端 v2 (SDK) ━━━{RESET}")
    print(f"{DIM}会话: {sid}{RESET}")
    print(f"{DIM}模型: {PROVIDER_ID}/{MODEL_ID}{RESET}")
    print(f"{DIM}命令: /quit  /session  /help{RESET}\n")

    loop = asyncio.get_event_loop()

    while True:
        # 使用 run_in_executor 避免 input() 阻塞事件循环
        try:
            user_input = await loop.run_in_executor(
                None,
                lambda: input(f"{GREEN}{BOLD}你:{RESET} "),
            )
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        user_input = user_input.strip()
        if not user_input:
            continue

        if user_input == "/quit":
            print("再见！")
            break
        if user_input == "/session":
            print(json.dumps({"id": sid, "model": f"{PROVIDER_ID}/{MODEL_ID}"}, ensure_ascii=False))
            continue
        if user_input == "/help":
            print(f"{DIM}/quit  退出    /session  会话信息{RESET}")
            continue

        # ── 发消息 + 流式接收 ─────────────────────────────────────────────
        await client.query(user_input)

        print(f"{CYAN}{BOLD}AI:{RESET} ", end="", flush=True)
        last_result: ResultMessage | None = None
        in_tool = False   # 是否正处于工具调用过程中

        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock) and block.text:
                        if in_tool:
                            # 工具完成后恢复正文，换一行
                            print(f"\n{CYAN}{BOLD}AI:{RESET} ", end="", flush=True)
                            in_tool = False
                        print(block.text, end="", flush=True)
                    elif isinstance(block, ToolUseBlock):
                        print(
                            f"\n{DIM}  → 调用 {block.name}({json.dumps(block.input, ensure_ascii=False)[:60]}){RESET}",
                            end="",
                            flush=True,
                        )
                        in_tool = True

            elif isinstance(message, SystemMessage):
                if message.subtype == "tool_result":
                    d = message.data
                    title = d.get("title") or d.get("tool_name", "")
                    print(f" {DIM}✓ {title}{RESET}", end="", flush=True)
                elif message.subtype == "tool_error":
                    d = message.data
                    print(f"\n{YELLOW}  [工具错误] {d.get('error','')}{RESET}", end="", flush=True)
                # init / step_start / step_finish 静默忽略

            elif isinstance(message, ResultMessage):
                last_result = message  # 累积，只取最后一次

        print()  # AI 回复换行
        if last_result and not last_result.is_error:
            u = last_result.usage
            print(
                f"{DIM}  [tokens in={u.input_tokens} out={u.output_tokens} "
                f"cost=${last_result.total_cost_usd:.4f}]{RESET}"
            )
        elif last_result and last_result.is_error:
            print(f"{RED}  [错误] 请求失败{RESET}")
        print()


# ══════════════════════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════════════════════

async def main() -> None:
    parser = argparse.ArgumentParser(description="opencode 交互式客户端 v2 (SDK)")
    parser.add_argument("--list",    action="store_true", help="列出已有会话并选择")
    parser.add_argument("--session", metavar="ID",        help="接入指定会话 ID")
    args = parser.parse_args()

    client = OpencodeClient(
        server_url=BASE_URL,
        provider_id=PROVIDER_ID,
        model_id=MODEL_ID,
    )

    if args.session:
        await client.connect_existing(args.session)
        print(f"已接入会话: {args.session}")
    elif args.list:
        sid = await choose_session(BASE_URL)
        if sid:
            await client.connect_existing(sid)
        else:
            await client.connect()
    else:
        await client.connect()
        print(f"已新建会话: {client.session_id}")

    try:
        await repl(client)
    finally:
        await client.disconnect()


if __name__ == "__main__":
    # 修复 Windows 终端 UTF-8 输出（仅直接运行时生效）
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    asyncio.run(main())
