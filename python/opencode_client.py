"""
opencode serve API 客户端示例
API 基础地址: http://127.0.0.1:58468

关键发现：
- POST /session  创建会话时需指定 agent="build"，否则 AI 不响应
- POST /session/{id}/message  发消息时必须在 body 里显式传 model，
  否则服务端会回退到 glm-4.6（不存在）导致 session.error
"""

import json
import time
import threading
import requests

BASE_URL = "http://127.0.0.1:60272"

# 默认使用 glm-5.1
DEFAULT_MODEL = {"providerID": "zhipuai-coding-plan", "modelID": "glm-5.1"}


# ─── 1. 列出所有会话 ───────────────────────────────────────────────────────────

def list_sessions() -> list[dict]:
    resp = requests.get(f"{BASE_URL}/session")
    resp.raise_for_status()
    return resp.json()


# ─── 2. 创建新会话 ─────────────────────────────────────────────────────────────

def create_session(project_id: str = "global") -> dict:
    """创建会话。agent="build" 是必须的，否则消息不会触发 AI 响应。"""
    resp = requests.post(
        f"{BASE_URL}/session",
        json={
            "projectID": project_id,
            "agent": "build",
            "model": {"id": DEFAULT_MODEL["modelID"], "providerID": DEFAULT_MODEL["providerID"]},
        },
    )
    resp.raise_for_status()
    return resp.json()


# ─── 3. 向会话发送消息 ─────────────────────────────────────────────────────────

def send_message(session_id: str, text: str) -> None:
    """发送消息。model 必须显式传入，否则服务端回退到 glm-4.6 报错。"""
    resp = requests.post(
        f"{BASE_URL}/session/{session_id}/message",
        json={
            "parts": [{"type": "text", "text": text}],
            "model": DEFAULT_MODEL,
        },
    )
    resp.raise_for_status()


# ─── 4. 获取会话中的所有消息 ───────────────────────────────────────────────────

def get_messages(session_id: str) -> list[dict]:
    resp = requests.get(f"{BASE_URL}/session/{session_id}/message")
    resp.raise_for_status()
    return resp.json()


# ─── 5. 轮询等待 AI 回复 ──────────────────────────────────────────────────────

def wait_for_reply(session_id: str, timeout: int = 90) -> str | None:
    """轮询直到 assistant 消息 finish=="stop"，返回文本内容。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        messages = get_messages(session_id)
        for msg in reversed(messages):
            info = msg.get("info", {})
            if info.get("role") == "assistant" and info.get("finish") == "stop":
                for part in msg.get("parts", []):
                    if part.get("type") == "text":
                        return part["text"]
        time.sleep(2)
    return None


# ─── 6. 监听全局 SSE 事件流（实时 token 流） ──────────────────────────────────

def stream_reply(session_id: str, send_fn, timeout: int = 90) -> str:
    """
    用独立线程监听 SSE /event 流，主线程等连接就绪后发消息。
    两者并行，不会因发消息阻塞而丢失 delta 事件。
    """
    full_text: dict[str, str] = {}
    done = threading.Event()
    connected = threading.Event()

    def _listen():
        try:
            with requests.get(f"{BASE_URL}/event", stream=True) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if done.is_set():
                        break
                    # 收到任意一行说明连接已建立
                    connected.set()

                    if not line or not line.startswith(b"data: "):
                        continue
                    event = json.loads(line[6:])
                    etype = event.get("type")
                    props = event.get("properties", {})

                    if props.get("sessionID") != session_id:
                        continue

                    if etype == "message.part.delta":
                        pid = props["partID"]
                        full_text[pid] = full_text.get(pid, "") + props.get("delta", "")
                        print(props.get("delta", ""), end="", flush=True)

                    elif etype == "session.idle":
                        print()
                        done.set()
                        break
        except requests.exceptions.ChunkedEncodingError:
            print()
        finally:
            done.set()

    t = threading.Thread(target=_listen, daemon=True)
    t.start()

    # 等 SSE 连接真正建立后再发消息
    connected.wait(timeout=10)
    send_fn()

    done.wait(timeout=timeout)
    return "".join(full_text.values())


# ─── 完整演示 ──────────────────────────────────────────────────────────────────

def main():
    # 1. 列出现有会话
    sessions = list_sessions()
    print(f"[1] 现有会话数: {len(sessions)}")

    # 2. 创建新会话
    session = create_session()
    sid = session["id"]
    print(f"[2] 新建会话: {sid}")

    # 3+4. 先开 SSE 流，连接建立后再发消息，确保不丢 delta 事件
    question = "这个项目提供了哪些 REST 接口？"
    print(f"[3] 发送: {question}")
    print("[4] glm-5.1 实时回复:")
    reply = stream_reply(
        sid,
        send_fn=lambda: send_message(sid, question),
        timeout=90,
    )

    if not reply:
        print("（流式未收到内容，改用轮询）")
        reply = wait_for_reply(sid, timeout=30) or "未收到回复"
        print(reply)


if __name__ == "__main__":
    main()
