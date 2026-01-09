# Voice Prompt Studio

A real-time voice-to-prompt web application that transcribes speech, cleans it up, translates multiple languages to English, and generates LLM-ready prompts.

![Voice Prompt Studio](https://img.shields.io/badge/Voice-Prompt%20Studio-14B8A6?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)

## Features

- **Real-time Speech-to-Text**: Powered by ElevenLabs Scribe v2 Realtime API
- **Multi-language Support**: English, Tamil, Hindi, and Tunglish (Tamil-English mix)
- **AI-Powered Cleanup**: Google Gemini 2.0 Flash processes and translates transcripts
- **Three-Pane Output**:
  - Raw Transcript (original speech with language detection)
  - Cleaned English (filler words removed, translated to English)
  - Prompt Ready (structured for LLM use)
- **Processing Modes**:
  - **Strict**: Preserves exact meaning, minimal changes
  - **Balanced**: Improves clarity while maintaining intent
- **Risk Indicators**: Shows confidence level for meaning changes
- **Copy to Clipboard**: One-click copy for prompt-ready output

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Raw Transcript│  │Cleaned English│  │ Prompt Ready │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │         WebSocket Connection (Audio + JSON)      │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                          │
│  ┌─────────────────────────────────────────────────┐           │
│  │              WebSocket Handler                   │           │
│  │  - Receives audio chunks (PCM 16kHz)            │           │
│  │  - Forwards to ElevenLabs                       │           │
│  │  - Processes with Gemini                        │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌──────────────────┐              ┌──────────────────────┐
│   ElevenLabs     │              │    Google Gemini     │
│   Scribe v2      │              │    2.0 Flash         │
│   Realtime API   │              │                      │
│                  │              │  - Cleanup           │
│  - STT           │              │  - Translation       │
│  - Language      │              │  - Prompt formatting │
│    Detection     │              │  - Risk assessment   │
└──────────────────┘              └──────────────────────┘
```

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **WebSocket API** for real-time communication
- **Web Audio API** for audio capture (PCM 16kHz)

### Backend
- **FastAPI** (Python)
- **websockets** library for ElevenLabs connection
- **httpx** for Gemini API calls
- **Pydantic** for data validation

### External APIs
- **ElevenLabs Scribe v2 Realtime** - Speech-to-text with language detection
- **Google Gemini 2.0 Flash** - Transcript cleanup and translation

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- ElevenLabs API key (with Scribe access)
- Google Gemini API key

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Edwinswanith/Multiaudio.git
cd Multiaudio
```

### 2. Set up environment variables

Create a `.env` file in the root directory:

```env
eleven_labs=your_elevenlabs_api_key_here
gemini_api=your_gemini_api_key_here
```

### 3. Install Backend Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
```

## Running the Application

### Start the Backend Server

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Start the Frontend Development Server

```bash
cd frontend
npm run dev
```

Open http://localhost:5174 in your browser.

## Usage

1. **Connect**: The app automatically connects to the backend WebSocket
2. **Record**: Click the microphone button to start recording
3. **Speak**: Talk in English, Tamil, Hindi, or Tunglish
4. **View Results**:
   - Left pane: Raw transcript with language badges
   - Center pane: Cleaned English with risk indicators
   - Right pane: Prompt-ready output
5. **Copy**: Click "Copy" on any result or use "Copy Latest Prompt"
6. **Modes**: Toggle between Strict and Balanced processing modes

## API Endpoints

### Health Check
```
GET /health
```
Returns API configuration status.

### WebSocket Transcription
```
WebSocket /ws/transcribe
```

**Client → Server Messages:**
- Binary: Audio data (PCM 16-bit, 16kHz, mono)
- JSON: `{ "type": "stop" }` - Commit transcript
- JSON: `{ "type": "set_mode", "mode": "strict" | "balanced" }` - Change mode
- JSON: `{ "type": "clear" }` - Clear accumulated transcript

**Server → Client Messages:**
- `{ "type": "connected" }` - Connection established
- `{ "type": "transcript", "text": "...", "is_final": bool, "language": "en" }` - Transcript
- `{ "type": "processing" }` - Gemini processing started
- `{ "type": "gemini_result", ... }` - Processed result
- `{ "type": "error", "message": "..." }` - Error message

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app & WebSocket handler
│   │   └── services/
│   │       └── gemini_service.py # Gemini API integration
│   ├── requirements.txt
│   └── venv/
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main React component
│   │   ├── main.tsx             # Entry point
│   │   └── styles/
│   │       └── globals.css      # Global styles
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── .env                         # Environment variables (not in repo)
├── .gitignore
└── README.md
```

## Configuration

### Processing Modes

| Mode | Description |
|------|-------------|
| **Strict** | Preserves exact meaning, minimal edits. Only removes fillers. Never changes numbers, names, or technical terms. |
| **Balanced** | Improves clarity and structure while maintaining intent. May add formatting for better prompt structure. |

### Risk Levels

| Level | Meaning |
|-------|---------|
| **Low** | High confidence, minimal changes made |
| **Medium** | Some interpretation required |
| **High** | Ambiguous translation, review recommended |

## Supported Languages

| Language | Code | Example |
|----------|------|---------|
| English | EN | "Add a button to the login page" |
| Tamil | TA | "லாக்இன் பேஜ்ல ஒரு பட்டன் சேர்" |
| Hindi | HI | "लॉगिन पेज में एक बटन जोड़ें" |
| Tunglish | TU | "Login page-la oru button add pannunga" |

## Troubleshooting

### WebSocket Connection Error
- Ensure the backend is running on port 8000
- Check that CORS is properly configured
- Verify your ElevenLabs API key has Scribe access

### Gemini API Error
- Verify your Gemini API key is valid
- Check that you're using `gemini-2.0-flash` model
- Ensure the `.env` file is in the root directory

### Audio Not Working
- Allow microphone access in your browser
- Ensure you're using HTTPS or localhost
- Check browser console for WebAudio errors

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- [ElevenLabs](https://elevenlabs.io/) for the Scribe v2 Realtime API
- [Google Gemini](https://ai.google.dev/) for the language model
- [Tailwind CSS](https://tailwindcss.com/) for the styling framework
- [Framer Motion](https://www.framer.com/motion/) for animations
