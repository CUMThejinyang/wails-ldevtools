# -*- coding: utf-8 -*-
import asyncio
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from opencode_client_v2 import OpencodeClient, BASE_URL, PROVIDER_ID, MODEL_ID

MESSAGE = "这个项目提供了哪些 REST 接口？请列举并简要说明。"

from opencode_agent_sdk import (
    SDKClient,
    AgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    SystemMessage,
)


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
        self._transport = self._patched
        self._http_mode = True
        await self._patched.connect()

    async def connect_existing(self, session_id: str) -> None:
        self._transport = self._patched
        self._http_mode = True
        await self._patched.connect_existing(session_id)

    @property
    def session_id(self) -> str:
        return self._patched.session_id


async def main():
    client = OpencodeClient(BASE_URL, PROVIDER_ID, MODEL_ID)
    await client.connect()
    print(f"会话: {client.session_id}")
    print(f"问: {MESSAGE}\n")
    print("答: ", end="", flush=True)

    await client.query(MESSAGE)

    async for msg in client.receive_response():
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock) and block.text:
                    print(block.text, end="", flush=True)
                elif isinstance(block, ToolUseBlock):
                    print(f"\n  [工具调用] {block}", end="", flush=True)
        elif isinstance(msg, SystemMessage) and msg.subtype == "tool_result":
            print(f" ✓", end="", flush=True)

    print()
    await client.disconnect()


asyncio.run(main())
