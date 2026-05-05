"""端到端验证：完整跑一次多轮对话。"""
import asyncio
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from opencode_agent_sdk import AssistantMessage, TextBlock, ResultMessage, SystemMessage, ToolUseBlock
from opencode_client_v2 import OpencodeClient, BASE_URL, PROVIDER_ID, MODEL_ID


async def ask(client: OpencodeClient, question: str) -> str:
    await client.query(question)
    full = []
    async for msg in client.receive_response():
        if isinstance(msg, AssistantMessage):
            for b in msg.content:
                if isinstance(b, TextBlock) and b.text:
                    full.append(b.text)
                elif isinstance(b, ToolUseBlock):
                    print(f"  [tool] {b.name}", flush=True)
        elif isinstance(msg, SystemMessage) and msg.subtype == "tool_result":
            print(f"  [result] {msg.data.get('tool_name','')} ✓", flush=True)
    return "".join(full)


async def main():
    client = OpencodeClient(BASE_URL, PROVIDER_ID, MODEL_ID)
    await client.connect()
    print(f"会话: {client.session_id}\n")

    # 第一轮
    print("Q1: 这个项目提供了哪些 REST 接口？用一句话回答。")
    a1 = await ask(client, "这个项目提供了哪些 REST 接口？用一句话回答。")
    print(f"A1: {a1}\n")

    # 第二轮（多轮上下文）
    print("Q2: 其中哪个接口支持关键词搜索？")
    a2 = await ask(client, "其中哪个接口支持关键词搜索？")
    print(f"A2: {a2}\n")

    await client.disconnect()
    print("完成。")

asyncio.run(main())
