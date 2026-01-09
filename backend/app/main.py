import os
import json
import asyncio
import base64
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import websockets

from app.services.gemini_service import process_transcript, ProcessingMode

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from parent directory
load_dotenv(dotenv_path="../.env")

ELEVENLABS_API_KEY = os.getenv("eleven_labs")

app = FastAPI(title="Voice Prompt Studio API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "elevenlabs_configured": bool(ELEVENLABS_API_KEY),
        "gemini_configured": bool(os.getenv("gemini_api"))
    }


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    WebSocket endpoint for real-time transcription with Gemini processing.
    """
    await websocket.accept()
    logger.info(f"Client connected. ElevenLabs: {bool(ELEVENLABS_API_KEY)}, Gemini: {bool(os.getenv('gemini_api'))}")

    if not ELEVENLABS_API_KEY:
        try:
            await websocket.send_json({
                "type": "error",
                "message": "ElevenLabs API key not configured"
            })
            await websocket.close()
        except:
            pass
        return

    elevenlabs_ws = None
    should_stop = False
    client_connected = True
    current_mode = ProcessingMode.BALANCED
    accumulated_transcript = ""  # Accumulate transcript for processing

    async def safe_send(data: dict):
        """Safely send JSON to client, handling disconnection."""
        nonlocal client_connected
        if not client_connected:
            return False
        try:
            await websocket.send_json(data)
            return True
        except Exception as e:
            logger.warning(f"Failed to send to client: {e}")
            client_connected = False
            return False

    try:
        # ElevenLabs Scribe v2 Realtime WebSocket URL
        elevenlabs_url = (
            "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
            "?model_id=scribe_v2_realtime"
            "&audio_format=pcm_16000"
            "&include_language_detection=true"
            "&commit_strategy=vad"
            "&vad_silence_threshold_secs=1.0"
        )

        headers = {"xi-api-key": ELEVENLABS_API_KEY}

        logger.info("Connecting to ElevenLabs...")
        elevenlabs_ws = await websockets.connect(
            elevenlabs_url,
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=20
        )
        logger.info("Connected to ElevenLabs!")

        if not await safe_send({"type": "connected", "message": "Connected to ElevenLabs STT"}):
            logger.info("Client disconnected during setup")
            return

        async def process_with_gemini(transcript: str):
            """Process transcript with Gemini and send result."""
            if not transcript.strip() or not client_connected:
                return

            logger.info(f"Processing with Gemini: {transcript[:50]}...")

            await safe_send({
                "type": "processing",
                "message": "Processing with Gemini..."
            })

            result = await process_transcript(transcript, current_mode)

            await safe_send({
                "type": "gemini_result",
                "raw_transcript": result.get("raw_transcript", transcript),
                "cleaned_meaning": result.get("cleaned_english_meaning", transcript),
                "prompt_ready": result.get("prompt_ready_english", transcript),
                "detected_languages": result.get("detected_languages", []),
                "risk_level": result.get("meaning_change_risk", "unknown"),
                "entities": result.get("entities", []),
                "confidence": result.get("confidence_score", 0),
                "error": result.get("error")
            })

            logger.info(f"Gemini result sent: {result.get('cleaned_english_meaning', '')[:50]}...")

        async def receive_from_elevenlabs():
            """Receive transcriptions from ElevenLabs."""
            nonlocal should_stop, accumulated_transcript, client_connected
            try:
                async for message in elevenlabs_ws:
                    if should_stop or not client_connected:
                        break

                    try:
                        data = json.loads(message)
                        msg_type = data.get("message_type", "")

                        if msg_type == "session_started":
                            logger.info(f"Session: {data.get('session_id')}")
                            await safe_send({
                                "type": "session_started",
                                "session_id": data.get("session_id")
                            })

                        elif msg_type == "partial_transcript":
                            text = data.get("text", "")
                            if text:
                                await safe_send({
                                    "type": "transcript",
                                    "text": text,
                                    "is_final": False
                                })

                        elif msg_type in ["committed_transcript", "committed_transcript_with_timestamps"]:
                            text = data.get("text", "").strip()
                            if text:
                                # Send final transcript
                                await safe_send({
                                    "type": "transcript",
                                    "text": text,
                                    "is_final": True,
                                    "language": data.get("language_code", "en")
                                })

                                # Accumulate for Gemini processing
                                accumulated_transcript += " " + text

                                # Process with Gemini immediately for each committed segment
                                if client_connected:
                                    asyncio.create_task(process_with_gemini(text))

                        elif "error" in msg_type:
                            await safe_send({
                                "type": "error",
                                "message": data.get("error", "Unknown error")
                            })

                    except json.JSONDecodeError:
                        logger.warning(f"Non-JSON: {message[:50]}")

            except websockets.exceptions.ConnectionClosed as e:
                logger.info(f"ElevenLabs closed: {e}")
            except Exception as e:
                logger.error(f"ElevenLabs error: {e}")

        async def receive_from_client():
            """Receive audio and control messages from client."""
            nonlocal should_stop, current_mode, accumulated_transcript, client_connected
            chunk_count = 0
            try:
                while not should_stop and client_connected:
                    try:
                        message = await asyncio.wait_for(
                            websocket.receive(),
                            timeout=30.0
                        )
                    except asyncio.TimeoutError:
                        continue

                    # Check for disconnect message
                    if message.get("type") == "websocket.disconnect":
                        logger.info("Client sent disconnect")
                        client_connected = False
                        should_stop = True
                        break

                    if "bytes" in message:
                        audio_data = message["bytes"]
                        audio_base64 = base64.b64encode(audio_data).decode('utf-8')

                        chunk_message = {
                            "message_type": "input_audio_chunk",
                            "audio_base_64": audio_base64
                        }

                        await elevenlabs_ws.send(json.dumps(chunk_message))
                        chunk_count += 1
                        if chunk_count % 10 == 0:
                            logger.info(f"Sent {chunk_count} audio chunks")

                    elif "text" in message:
                        try:
                            data = json.loads(message["text"])
                            logger.info(f"Client msg: {data}")

                            if data.get("type") == "stop":
                                # Commit the transcript
                                commit_msg = {
                                    "message_type": "input_audio_chunk",
                                    "audio_base_64": "",
                                    "commit": True
                                }
                                await elevenlabs_ws.send(json.dumps(commit_msg))
                                logger.info("Sent commit")

                            elif data.get("type") == "set_mode":
                                mode = data.get("mode", "balanced")
                                current_mode = ProcessingMode.STRICT if mode == "strict" else ProcessingMode.BALANCED
                                logger.info(f"Mode set to: {current_mode}")

                            elif data.get("type") == "clear":
                                accumulated_transcript = ""
                                logger.info("Cleared accumulated transcript")

                        except json.JSONDecodeError:
                            pass

            except WebSocketDisconnect:
                logger.info("Client disconnected")
                client_connected = False
                should_stop = True
            except Exception as e:
                logger.error(f"Client error: {e}")
                client_connected = False
                should_stop = True

        # Run both tasks
        logger.info("Starting receive tasks...")
        await asyncio.gather(
            receive_from_elevenlabs(),
            receive_from_client(),
            return_exceptions=True
        )
        logger.info("Tasks completed")

    except websockets.exceptions.InvalidStatusCode as e:
        error_msg = f"ElevenLabs HTTP {e.status_code}"
        logger.error(error_msg)
        try:
            await websocket.send_json({"type": "error", "message": error_msg})
        except:
            pass

    except Exception as e:
        logger.error(f"Error: {type(e).__name__}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass

    finally:
        should_stop = True
        if elevenlabs_ws:
            await elevenlabs_ws.close()
        logger.info("Cleanup done")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
