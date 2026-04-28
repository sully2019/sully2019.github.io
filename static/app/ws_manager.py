import json
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # session_id -> {participant_id: websocket}
        self.connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, session_id: str, participant_id: str, ws: WebSocket):
        await ws.accept()
        if session_id not in self.connections:
            self.connections[session_id] = {}
        self.connections[session_id][participant_id] = ws

    def disconnect(self, session_id: str, participant_id: str):
        if session_id in self.connections:
            self.connections[session_id].pop(participant_id, None)
            if not self.connections[session_id]:
                del self.connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        if session_id not in self.connections:
            return
        data = json.dumps(message)
        dead = []
        for pid, ws in self.connections[session_id].items():
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(pid)
        for pid in dead:
            self.connections[session_id].pop(pid, None)

    async def send_personal(self, ws: WebSocket, message: dict):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass

    def get_connected_count(self, session_id: str) -> int:
        return len(self.connections.get(session_id, {}))

    def get_connected_participant_ids(self, session_id: str) -> set[str]:
        return set(self.connections.get(session_id, {}).keys())


manager = ConnectionManager()
