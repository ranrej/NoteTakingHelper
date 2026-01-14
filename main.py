# from fastapi import FastAPI

# app = FastAPI()

# @app.get("/")
# def root():
#     return {"message": "Hello World"}

# def main():
#     print("Hello from notetakinghelper!")


# if __name__ == "__main__":
#     main()


from typing import Union
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import pyaudio
import websocket
import json
import threading
import time
import asyncio
from urllib.parse import urlencode
from datetime import datetime

# Initialize FastAPI app
app = FastAPI()

# Serve static files
app.mount("/", StaticFiles(directory=".", html=True), name="static")

# AssemblyAI Configuration
API_KEY = "2f846e460d994f7cb87ce353e20f0da9"
CONNECTION_PARAMS = {
    "sample_rate": 16000,
    "format_turns": True
}
API_ENDPOINT_BASE_URL = "wss://streaming.assemblyai.com/v3/ws"
API_ENDPOINT = f"{API_ENDPOINT_BASE_URL}?{urlencode(CONNECTION_PARAMS)}"

# Audio Configuration
FRAMES_PER_BUFFER = 800
SAMPLE_RATE = CONNECTION_PARAMS["sample_rate"]

# Global variables for active transcription sessions
active_sessions = {}


class TranscriptionSession:
    def __init__(self, client_ws):
        self.client_ws = client_ws
        self.ws_app = None
        self.stop_event = threading.Event()
        self.ws_thread = None
        self.transcript = ""
        self.lock = threading.Lock()

    async def start(self):
        """Start AssemblyAI WebSocket connection"""
        self.ws_app = websocket.WebSocketApp(
            API_ENDPOINT,
            header={"Authorization": API_KEY},
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
        )
        self.ws_thread = threading.Thread(target=self.ws_app.run_forever)
        self.ws_thread.daemon = True
        self.ws_thread.start()

    def on_open(self, ws):
        """Called when AssemblyAI connection opens"""
        print("Connected to AssemblyAI")

    def on_message(self, ws, message):
        """Handle messages from AssemblyAI"""
        try:
            data = json.loads(message)
            msg_type = data.get('type')

            if msg_type == "Turn":
                transcript = data.get('transcript', '')
                formatted = data.get('turn_is_formatted', False)

                with self.lock:
                    if formatted:
                        self.transcript = transcript
                    else:
                        self.transcript += transcript

                # Send to client
                asyncio.create_task(self.client_ws.send_json({
                    "type": "transcript",
                    "text": self.transcript,
                    "final": formatted
                }))
        except Exception as e:
            print(f"Error handling AssemblyAI message: {e}")

    def on_error(self, ws, error):
        """Handle errors from AssemblyAI"""
        print(f"AssemblyAI Error: {error}")
        self.stop_event.set()

    def on_close(self, ws, close_status_code, close_msg):
        """Handle AssemblyAI connection close"""
        print(f"AssemblyAI connection closed")
        self.stop_event.set()

    async def send_audio(self, audio_data):
        """Send audio data to AssemblyAI"""
        if self.ws_app and self.ws_app.sock:
            try:
                self.ws_app.send(audio_data, websocket.ABNF.OPCODE_BINARY)
            except Exception as e:
                print(f"Error sending audio: {e}")

    async def stop(self):
        """Stop the transcription session"""
        self.stop_event.set()
        if self.ws_app:
            try:
                terminate_message = {"type": "Terminate"}
                self.ws_app.send(json.dumps(terminate_message))
                time.sleep(1)
            except Exception as e:
                print(f"Error sending termination: {e}")
            self.ws_app.close()
        if self.ws_thread and self.ws_thread.is_alive():
            self.ws_thread.join(timeout=2.0)


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """WebSocket endpoint for live transcription"""
    await websocket.accept()
    session_id = str(time.time())
    session = TranscriptionSession(websocket)
    active_sessions[session_id] = session

    try:
        # Start AssemblyAI connection
        await session.start()
        
        # Wait for audio data from client
        while True:
            try:
                data = await websocket.receive_bytes()
                await session.send_audio(data)
            except WebSocketDisconnect:
                break
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await session.stop()
        del active_sessions[session_id]


@app.get("/")
def read_root():
    return {"message": "Note Taking Helper is running"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: Union[str, None] = None):
    return {"item_id": item_id, "q": q}