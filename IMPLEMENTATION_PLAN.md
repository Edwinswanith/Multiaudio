# Voice Prompt Studio - Implementation Plan

## Executive Summary

Voice Prompt Studio is a real-time voice-to-prompt application that transforms spoken input (English, Tamil, Hindi, and Tunglish) into clean, structured prompts ready for LLM use. This plan details the complete implementation strategy.

---

## 1. Architecture Deep Dive

### 1.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React + TypeScript)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   WebAudio   │  │  WebSocket   │  │    State     │  │     UI       │     │
│  │   Recorder   │  │    Client    │  │  Management  │  │  Components  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  └──────────────┘     │
│         │                 │                                                  │
└─────────┼─────────────────┼──────────────────────────────────────────────────┘
          │                 │
          │    Audio Chunks │ Transcript Events
          │                 │
┌─────────▼─────────────────▼──────────────────────────────────────────────────┐
│                           BACKEND (FastAPI + Python)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        WebSocket Manager                              │   │
│  │  • Connection pool management                                         │   │
│  │  • Audio chunk routing                                                │   │
│  │  • Transcript event broadcasting                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   STT Service   │  │   LLM Service   │  │ Memory Service  │              │
│  │  (ElevenLabs)   │  │    (Gemini)     │  │                 │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
└───────────┼────────────────────┼────────────────────┼────────────────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│   ElevenLabs API  │  │    Gemini API     │  │   SQLite/Postgres │
│  Scribe v2 RT     │  │  Structured Out   │  │                   │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

### 1.2 Data Flow Sequence

```
┌──────┐    ┌─────────┐    ┌──────────────┐    ┌────────────┐    ┌────────┐
│ User │    │ Browser │    │   Backend    │    │ ElevenLabs │    │ Gemini │
└──┬───┘    └────┬────┘    └──────┬───────┘    └─────┬──────┘    └───┬────┘
   │             │                │                   │               │
   │ Press Mic   │                │                   │               │
   │────────────>│                │                   │               │
   │             │ Start Recording│                   │               │
   │             │───────────────>│                   │               │
   │             │                │ Open WS to 11Labs │               │
   │             │                │──────────────────>│               │
   │ Speak       │                │                   │               │
   │────────────>│                │                   │               │
   │             │ Audio Chunks   │                   │               │
   │             │───────────────>│ Stream Audio      │               │
   │             │                │──────────────────>│               │
   │             │                │   Partial Text    │               │
   │             │ Partial Text   │<──────────────────│               │
   │<────────────│<───────────────│                   │               │
   │             │                │   Final Segment   │               │
   │             │                │<──────────────────│               │
   │ Release Mic │                │                   │               │
   │────────────>│                │                   │               │
   │             │ Stop Recording │                   │               │
   │             │───────────────>│ Close WS          │               │
   │             │                │──────────────────>│               │
   │             │                │                   │               │
   │             │                │ Cleanup Request   │               │
   │             │                │  + Memory Packet  │               │
   │             │                │──────────────────────────────────>│
   │             │                │     Structured JSON Response      │
   │             │                │<──────────────────────────────────│
   │             │ Final Output   │                   │               │
   │<────────────│<───────────────│                   │               │
   │             │                │                   │               │
```

---

## 2. Technology Stack Details

### 2.1 Frontend Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | React 18 + TypeScript | Type safety, mature ecosystem |
| Build Tool | Vite | Fast HMR, modern bundling |
| State | Zustand | Lightweight, no boilerplate |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development, consistent design |
| Audio | WebAudio API | Native browser support, low latency |
| WebSocket | Native WebSocket | No library overhead |
| Icons | Lucide React | Consistent, lightweight |

### 2.2 Backend Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | FastAPI | Async-native, WebSocket support, auto-docs |
| Server | Uvicorn | ASGI server, production-ready |
| Database | SQLite (MVP) → Postgres | Simple start, easy migration |
| ORM | SQLAlchemy 2.0 | Async support, mature |
| Validation | Pydantic v2 | Fast, integrates with FastAPI |
| HTTP Client | httpx | Async HTTP for API calls |
| WebSocket Client | websockets | ElevenLabs connection |

### 2.3 External Services

| Service | Purpose | API Type |
|---------|---------|----------|
| ElevenLabs Scribe v2 Realtime | Speech-to-text | WebSocket streaming |
| Google Gemini 1.5 Pro | Cleanup, translation, prompt composition | REST with structured outputs |

---

## 3. Project Structure

### 3.1 Root Directory Structure

```
voice-prompt-studio/
├── frontend/                    # React application
├── backend/                     # FastAPI application
├── shared/                      # Shared types (optional)
├── docs/                        # Documentation
├── scripts/                     # Utility scripts
├── .env                         # Environment variables
├── .env.example                 # Environment template
├── docker-compose.yml           # Development setup
├── Makefile                     # Common commands
└── README.md
```

### 3.2 Frontend Structure

```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Root component
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toggle.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── ...
│   │   │
│   │   ├── recording/
│   │   │   ├── RecordButton.tsx       # Push-to-talk button
│   │   │   ├── WaveformIndicator.tsx  # Audio visualizer
│   │   │   └── RecordingStatus.tsx    # Status display
│   │   │
│   │   ├── transcript/
│   │   │   ├── TranscriptStream.tsx   # Live transcript display
│   │   │   ├── PartialText.tsx        # Streaming partial text
│   │   │   └── CommittedSegment.tsx   # Final segments
│   │   │
│   │   ├── output/
│   │   │   ├── OutputPane.tsx         # Tabbed output container
│   │   │   ├── CleanedMeaning.tsx     # Cleaned English tab
│   │   │   ├── PromptReady.tsx        # Prompt-ready tab
│   │   │   ├── RiskBanner.tsx         # Meaning change warning
│   │   │   └── DiffView.tsx           # Before/after comparison
│   │   │
│   │   ├── session/
│   │   │   ├── SessionTimeline.tsx    # Left panel timeline
│   │   │   ├── UtteranceCard.tsx      # Individual utterance
│   │   │   └── StatusChip.tsx         # Status indicators
│   │   │
│   │   ├── layout/
│   │   │   ├── Header.tsx             # App header
│   │   │   ├── MainLayout.tsx         # Three-panel layout
│   │   │   └── SettingsSheet.tsx      # Settings drawer
│   │   │
│   │   └── feedback/
│   │       ├── ThumbsRating.tsx       # Thumbs up/down
│   │       └── EditFeedback.tsx       # "Edited a lot" checkbox
│   │
│   ├── hooks/
│   │   ├── useAudioRecorder.ts        # WebAudio recording
│   │   ├── useWebSocket.ts            # WebSocket connection
│   │   ├── useTranscript.ts           # Transcript state
│   │   └── useSession.ts              # Session management
│   │
│   ├── stores/
│   │   ├── sessionStore.ts            # Session state (Zustand)
│   │   ├── settingsStore.ts           # User settings
│   │   └── websocketStore.ts          # Connection state
│   │
│   ├── services/
│   │   ├── websocketClient.ts         # WS connection manager
│   │   ├── apiClient.ts               # REST API client
│   │   └── audioProcessor.ts          # Audio chunk processing
│   │
│   ├── types/
│   │   ├── session.ts                 # Session types
│   │   ├── utterance.ts               # Utterance types
│   │   ├── websocket.ts               # WS message types
│   │   └── api.ts                     # API response types
│   │
│   ├── utils/
│   │   ├── audioHelpers.ts            # Audio utilities
│   │   ├── formatters.ts              # Time/text formatting
│   │   └── constants.ts               # App constants
│   │
│   └── styles/
│       └── globals.css                # Global styles + Tailwind
│
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── components.json                    # shadcn/ui config
```

### 3.3 Backend Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                        # FastAPI app entry
│   ├── config.py                      # Configuration
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py                    # Dependency injection
│   │   │
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── sessions.py            # Session CRUD
│   │   │   ├── utterances.py          # Utterance endpoints
│   │   │   ├── feedback.py            # Feedback submission
│   │   │   └── health.py              # Health checks
│   │   │
│   │   └── websockets/
│   │       ├── __init__.py
│   │       ├── audio_handler.py       # Audio streaming WS
│   │       └── connection_manager.py  # WS pool management
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── stt_service.py             # ElevenLabs integration
│   │   ├── llm_service.py             # Gemini integration
│   │   ├── memory_service.py          # Session memory
│   │   └── transcript_assembler.py    # Segment assembly
│   │
│   ├── domain/
│   │   ├── __init__.py
│   │   ├── models.py                  # SQLAlchemy models
│   │   ├── schemas.py                 # Pydantic schemas
│   │   └── enums.py                   # Status enums
│   │
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── database.py                # DB connection
│   │   └── repositories/
│   │       ├── __init__.py
│   │       ├── session_repo.py
│   │       ├── utterance_repo.py
│   │       └── feedback_repo.py
│   │
│   └── utils/
│       ├── __init__.py
│       ├── logging.py                 # Structured logging
│       ├── metrics.py                 # Performance metrics
│       └── audio_utils.py             # Audio processing
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py                    # Pytest fixtures
│   ├── test_stt_service.py
│   ├── test_llm_service.py
│   └── test_api/
│       └── ...
│
├── alembic/                           # DB migrations
│   ├── versions/
│   └── env.py
│
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml
├── alembic.ini
└── Dockerfile
```

---

## 4. Database Schema

### 4.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           sessions                               │
├─────────────────────────────────────────────────────────────────┤
│ id              UUID PRIMARY KEY                                 │
│ created_at      TIMESTAMP NOT NULL DEFAULT NOW()                │
│ updated_at      TIMESTAMP NOT NULL DEFAULT NOW()                │
│ memory_enabled  BOOLEAN NOT NULL DEFAULT true                   │
│ mode            VARCHAR(20) NOT NULL DEFAULT 'balanced'         │
│ summary         TEXT                                             │
│ is_active       BOOLEAN NOT NULL DEFAULT true                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 1:N
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          utterances                              │
├─────────────────────────────────────────────────────────────────┤
│ id              UUID PRIMARY KEY                                 │
│ session_id      UUID NOT NULL REFERENCES sessions(id)           │
│ sequence_num    INTEGER NOT NULL                                 │
│ created_at      TIMESTAMP NOT NULL DEFAULT NOW()                │
│ status          VARCHAR(20) NOT NULL DEFAULT 'transcribing'     │
│ raw_transcript  TEXT                                             │
│ cleaned_meaning TEXT                                             │
│ prompt_ready    TEXT                                             │
│ detected_langs  JSONB                                            │
│ entities        JSONB                                            │
│ risk_level      VARCHAR(10)                                      │
│ audio_duration  FLOAT                                            │
│ processing_ms   INTEGER                                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 1:1
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           feedback                               │
├─────────────────────────────────────────────────────────────────┤
│ id              UUID PRIMARY KEY                                 │
│ utterance_id    UUID NOT NULL REFERENCES utterances(id) UNIQUE  │
│ created_at      TIMESTAMP NOT NULL DEFAULT NOW()                │
│ rating          INTEGER CHECK (rating IN (-1, 0, 1))            │
│ edited_heavily  BOOLEAN NOT NULL DEFAULT false                  │
│ copied          BOOLEAN NOT NULL DEFAULT false                  │
│ notes           TEXT                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 SQLAlchemy Models

```python
# backend/app/domain/models.py

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import relationship
from app.storage.database import Base


class UtteranceStatus(str, Enum):
    TRANSCRIBING = "transcribing"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ProcessingMode(str, Enum):
    STRICT = "strict"
    BALANCED = "balanced"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    memory_enabled = Column(Boolean, nullable=False, default=True)
    mode = Column(String(20), nullable=False, default=ProcessingMode.BALANCED.value)
    summary = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    utterances = relationship("Utterance", back_populates="session", cascade="all, delete-orphan")


class Utterance(Base):
    __tablename__ = "utterances"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    sequence_num = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    status = Column(String(20), nullable=False, default=UtteranceStatus.TRANSCRIBING.value)
    raw_transcript = Column(Text, nullable=True)
    cleaned_meaning = Column(Text, nullable=True)
    prompt_ready = Column(Text, nullable=True)
    detected_langs = Column(JSONB, nullable=True)
    entities = Column(JSONB, nullable=True)
    risk_level = Column(String(10), nullable=True)
    audio_duration = Column(Float, nullable=True)
    processing_ms = Column(Integer, nullable=True)

    session = relationship("Session", back_populates="utterances")
    feedback = relationship("Feedback", back_populates="utterance", uselist=False, cascade="all, delete-orphan")


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    utterance_id = Column(PGUUID(as_uuid=True), ForeignKey("utterances.id"), nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    rating = Column(Integer, nullable=True)  # -1, 0, 1
    edited_heavily = Column(Boolean, nullable=False, default=False)
    copied = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)

    utterance = relationship("Utterance", back_populates="feedback")
```

---

## 5. API Contracts

### 5.1 REST API Endpoints

#### Sessions

```yaml
POST /api/sessions
  Description: Create new session
  Request Body:
    memory_enabled: boolean (default: true)
    mode: "strict" | "balanced" (default: "balanced")
  Response: 201
    id: uuid
    created_at: datetime
    memory_enabled: boolean
    mode: string

GET /api/sessions
  Description: List all sessions
  Query Params:
    limit: int (default: 20, max: 100)
    offset: int (default: 0)
    active_only: boolean (default: true)
  Response: 200
    sessions: Session[]
    total: int
    has_more: boolean

GET /api/sessions/{session_id}
  Description: Get session details with utterances
  Response: 200
    id: uuid
    created_at: datetime
    memory_enabled: boolean
    mode: string
    summary: string | null
    utterances: Utterance[]

PATCH /api/sessions/{session_id}
  Description: Update session settings
  Request Body:
    memory_enabled?: boolean
    mode?: "strict" | "balanced"
  Response: 200
    # Updated session

DELETE /api/sessions/{session_id}
  Description: Delete session and all utterances
  Response: 204

POST /api/sessions/{session_id}/reset-memory
  Description: Clear memory but keep session
  Response: 200
    message: "Memory cleared"
```

#### Utterances

```yaml
GET /api/sessions/{session_id}/utterances
  Description: List utterances for session
  Response: 200
    utterances: Utterance[]

GET /api/utterances/{utterance_id}
  Description: Get single utterance
  Response: 200
    id: uuid
    session_id: uuid
    sequence_num: int
    status: "transcribing" | "processing" | "ready" | "error"
    raw_transcript: string | null
    cleaned_meaning: string | null
    prompt_ready: string | null
    detected_langs: string[]
    entities: string[]
    risk_level: "low" | "medium" | "high" | null
    audio_duration: float | null
    processing_ms: int | null
    created_at: datetime

POST /api/utterances/{utterance_id}/regenerate
  Description: Regenerate output with different mode
  Request Body:
    mode: "strict" | "balanced"
  Response: 200
    # Updated utterance

PATCH /api/utterances/{utterance_id}/transcript
  Description: Update raw transcript (for corrections)
  Request Body:
    raw_transcript: string
  Response: 200
    # Triggers reprocessing, returns updated utterance
```

#### Feedback

```yaml
POST /api/utterances/{utterance_id}/feedback
  Description: Submit feedback for utterance
  Request Body:
    rating: -1 | 0 | 1
    edited_heavily: boolean
    copied: boolean
    notes?: string
  Response: 201
    # Created feedback

GET /api/metrics/quality
  Description: Get quality metrics summary
  Query Params:
    days: int (default: 7)
  Response: 200
    copy_ready_rate: float
    avg_rating: float
    high_risk_rate: float
    language_distribution: object
```

### 5.2 WebSocket Protocol

#### Connection

```
WS /ws/audio/{session_id}

# Connection established
→ Server sends: {"type": "connected", "session_id": "uuid"}
```

#### Client Messages

```typescript
// Start recording
{
  "type": "start_recording"
}

// Audio chunk (binary frame follows)
{
  "type": "audio_chunk",
  "sequence": number,
  "timestamp": number
}
// Followed by binary frame with audio data

// Stop recording
{
  "type": "stop_recording"
}

// Cancel current recording
{
  "type": "cancel"
}
```

#### Server Messages

```typescript
// Partial transcript (streaming)
{
  "type": "partial_transcript",
  "text": string,
  "is_final": false
}

// Final transcript segment
{
  "type": "final_transcript",
  "text": string,
  "is_final": true,
  "utterance_id": string
}

// Processing started
{
  "type": "processing_started",
  "utterance_id": string
}

// Processing complete
{
  "type": "processing_complete",
  "utterance_id": string,
  "result": {
    "raw_transcript": string,
    "cleaned_meaning": string,
    "prompt_ready": string,
    "detected_langs": string[],
    "entities": string[],
    "risk_level": "low" | "medium" | "high"
  }
}

// Error
{
  "type": "error",
  "code": string,
  "message": string,
  "utterance_id"?: string
}

// Session summary updated
{
  "type": "summary_updated",
  "summary": string
}
```

---

## 6. Gemini Integration Details

### 6.1 Structured Output Schema

```json
{
  "type": "object",
  "properties": {
    "detected_languages": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["english", "tamil", "hindi", "tunglish", "unknown"]
      },
      "description": "Languages detected in the input"
    },
    "raw_transcript": {
      "type": "string",
      "description": "Original transcript exactly as transcribed"
    },
    "cleaned_english_meaning": {
      "type": "string",
      "description": "Cleaned English preserving exact meaning with minimal edits"
    },
    "prompt_ready_english": {
      "type": "string",
      "description": "Structured English formatted for LLM prompt use"
    },
    "removed_fillers": {
      "type": "boolean",
      "description": "Whether filler words were removed"
    },
    "preserved_critical_elements": {
      "type": "boolean",
      "description": "Whether numbers, URLs, code, names were preserved exactly"
    },
    "meaning_change_risk": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "description": "Risk that cleaning altered the intended meaning"
    },
    "entities": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "type": { "type": "string", "enum": ["name", "number", "url", "code", "filename", "other"] }
        }
      },
      "description": "Key entities that must not be changed"
    },
    "confidence_score": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Confidence in the translation/cleanup accuracy"
    }
  },
  "required": [
    "detected_languages",
    "raw_transcript",
    "cleaned_english_meaning",
    "prompt_ready_english",
    "meaning_change_risk",
    "entities"
  ]
}
```

### 6.2 System Prompts

#### Strict Mode System Prompt

```text
You are a transcription cleaner and prompt composer. Your job is to:
1. Clean speech transcriptions while STRICTLY preserving meaning
2. Translate Tamil/Hindi/Tunglish to English without losing ANY nuance
3. Convert the cleaned text into a structured prompt format

STRICT RULES - NEVER VIOLATE:
- NEVER change numbers (42 stays 42, not "forty-two" or "around forty")
- NEVER change URLs, file paths, or code tokens
- NEVER change proper nouns, names, or technical terms
- NEVER add information that wasn't in the original
- NEVER remove information that was clearly intentional
- Only remove: "um", "uh", "like", "you know", hesitations, false starts, repetitions

If translation is ambiguous, set meaning_change_risk to "high" and provide the most literal interpretation.

Output format: Respond ONLY with valid JSON matching the provided schema.
```

#### Balanced Mode System Prompt

```text
You are a transcription cleaner and prompt composer. Your job is to:
1. Clean speech transcriptions while preserving core meaning
2. Translate Tamil/Hindi/Tunglish to clear, natural English
3. Convert the cleaned text into a well-structured prompt format

RULES:
- NEVER change numbers, URLs, file paths, code tokens, proper nouns
- Remove fillers, hesitations, false starts, repetitions
- Improve clarity and structure while keeping the intent
- For prompts: add appropriate structure (bullet points, sections) if it improves clarity

Balance natural expression with faithfulness to the original intent.

Output format: Respond ONLY with valid JSON matching the provided schema.
```

### 6.3 Memory Packet Structure

```python
def build_memory_packet(
    session_summary: str | None,
    recent_utterances: list[dict],  # Last N (default 8)
    current_raw_transcript: str,
    mode: str
) -> list[dict]:
    """Build the messages array for Gemini request."""

    messages = []

    # System instruction
    system_prompt = STRICT_SYSTEM_PROMPT if mode == "strict" else BALANCED_SYSTEM_PROMPT
    messages.append({
        "role": "user",
        "parts": [{"text": system_prompt}]
    })
    messages.append({
        "role": "model",
        "parts": [{"text": "I understand. I will clean transcriptions following your rules and output valid JSON."}]
    })

    # Session summary (if exists)
    if session_summary:
        messages.append({
            "role": "user",
            "parts": [{"text": f"SESSION CONTEXT:\n{session_summary}"}]
        })
        messages.append({
            "role": "model",
            "parts": [{"text": "I understand the context and will maintain consistency."}]
        })

    # Recent utterances for continuity
    for utt in recent_utterances:
        messages.append({
            "role": "user",
            "parts": [{"text": f"Previous input: {utt['raw_transcript']}"}]
        })
        messages.append({
            "role": "model",
            "parts": [{"text": json.dumps(utt['output'])}]
        })

    # Current request
    messages.append({
        "role": "user",
        "parts": [{"text": f"Clean and process this transcript:\n\n{current_raw_transcript}"}]
    })

    return messages
```

---

## 7. ElevenLabs Integration Details

### 7.1 WebSocket Connection

```python
# backend/app/services/stt_service.py

import asyncio
import json
from websockets import connect
from typing import AsyncGenerator

ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/stream"

class ElevenLabsSTTService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.ws = None

    async def connect(self) -> None:
        """Establish WebSocket connection to ElevenLabs."""
        self.ws = await connect(
            ELEVENLABS_WS_URL,
            extra_headers={"xi-api-key": self.api_key}
        )

        # Send configuration
        config = {
            "type": "config",
            "language_detection": True,
            "languages": ["en", "ta", "hi"],  # English, Tamil, Hindi
            "encoding": "pcm_16000",  # 16kHz PCM
            "sample_rate": 16000
        }
        await self.ws.send(json.dumps(config))

    async def stream_audio(
        self,
        audio_chunks: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[dict, None]:
        """
        Stream audio chunks and yield transcript events.

        Yields:
            {"type": "partial", "text": "...", "is_final": False}
            {"type": "final", "text": "...", "is_final": True, "language": "en"}
        """
        if not self.ws:
            raise RuntimeError("Not connected")

        async def send_audio():
            async for chunk in audio_chunks:
                await self.ws.send(chunk)
            # Signal end of audio
            await self.ws.send(json.dumps({"type": "end_of_stream"}))

        async def receive_transcripts():
            async for message in self.ws:
                data = json.loads(message)

                if data.get("type") == "partial":
                    yield {
                        "type": "partial",
                        "text": data["text"],
                        "is_final": False
                    }
                elif data.get("type") == "final":
                    yield {
                        "type": "final",
                        "text": data["text"],
                        "is_final": True,
                        "language": data.get("language", "unknown")
                    }
                elif data.get("type") == "end_of_transcript":
                    break

        # Run send and receive concurrently
        send_task = asyncio.create_task(send_audio())

        try:
            async for transcript in receive_transcripts():
                yield transcript
        finally:
            await send_task

    async def close(self) -> None:
        """Close WebSocket connection."""
        if self.ws:
            await self.ws.close()
            self.ws = None
```

### 7.2 Audio Format Requirements

| Parameter | Value | Notes |
|-----------|-------|-------|
| Format | PCM | Raw audio, no container |
| Sample Rate | 16000 Hz | Required by Scribe v2 |
| Bit Depth | 16-bit | Signed integers |
| Channels | Mono | Single channel |
| Chunk Size | ~100ms | ~3200 bytes per chunk |

---

## 8. Memory Service Design

### 8.1 Memory Strategy

```python
# backend/app/services/memory_service.py

from dataclasses import dataclass
from typing import Optional
import json

@dataclass
class MemoryConfig:
    buffer_size: int = 8           # Last N utterances to include
    summary_refresh_interval: int = 5  # Update summary every N utterances
    max_summary_length: int = 500   # Characters in summary


class MemoryService:
    def __init__(self, llm_service: 'LLMService', config: MemoryConfig = None):
        self.llm = llm_service
        self.config = config or MemoryConfig()

    async def get_memory_packet(
        self,
        session: 'Session',
        current_utterance_num: int
    ) -> dict:
        """
        Build memory packet for Gemini request.

        Returns:
            {
                "summary": str | None,
                "recent_utterances": [
                    {"raw_transcript": str, "output": dict},
                    ...
                ]
            }
        """
        if not session.memory_enabled:
            return {"summary": None, "recent_utterances": []}

        # Get recent utterances (excluding current)
        recent = [
            u for u in session.utterances
            if u.sequence_num < current_utterance_num
            and u.status == "ready"
        ][-self.config.buffer_size:]

        recent_data = [
            {
                "raw_transcript": u.raw_transcript,
                "output": {
                    "cleaned_english_meaning": u.cleaned_meaning,
                    "prompt_ready_english": u.prompt_ready,
                    "entities": u.entities
                }
            }
            for u in recent
        ]

        # Check if summary needs refresh
        summary = session.summary
        if self._should_refresh_summary(session, current_utterance_num):
            summary = await self._generate_summary(session, recent)

        return {
            "summary": summary,
            "recent_utterances": recent_data
        }

    def _should_refresh_summary(
        self,
        session: 'Session',
        current_num: int
    ) -> bool:
        """Check if summary should be regenerated."""
        if not session.summary:
            return current_num >= self.config.summary_refresh_interval
        return current_num % self.config.summary_refresh_interval == 0

    async def _generate_summary(
        self,
        session: 'Session',
        recent_utterances: list
    ) -> str:
        """Generate concise session summary using Gemini."""
        if not recent_utterances:
            return None

        prompt = f"""
        Summarize what the user is trying to accomplish based on these utterances.
        Be concise (max {self.config.max_summary_length} chars).
        Focus on: goals, constraints, key terms, project context.

        Utterances:
        {json.dumps([u['raw_transcript'] for u in recent_utterances], indent=2)}

        Current summary (if any): {session.summary or 'None'}
        """

        summary = await self.llm.generate_summary(prompt)
        return summary[:self.config.max_summary_length]
```

### 8.2 Memory Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Session Memory                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Session Summary                           │ │
│  │  "User is building a voice prompt app. Key terms: React,    │ │
│  │   FastAPI, ElevenLabs. Focus on real-time transcription."   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              │ Updated every 5 utterances         │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Recent Buffer (N=8)                       │ │
│  │                                                              │ │
│  │  [Utt 3] "Add a button for..."  →  "Add recording button"  │ │
│  │  [Utt 4] "It should have..."    →  "Include waveform..."   │ │
│  │  [Utt 5] "Also memory..."       →  "Enable session memory"  │ │
│  │  ...                                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                 Current Utterance Input                      │ │
│  │  "Intha screen-la oru toggle button venum for the mode"    │ │
│  │  (Tunglish: "I need a toggle button on this screen...")    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Gemini Processing                         │ │
│  │  • Understands "screen" refers to Settings from context     │ │
│  │  • Knows "mode" means Strict/Balanced from summary          │ │
│  │  • Maintains consistent terminology                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. Frontend State Management

### 9.1 Zustand Store Structure

```typescript
// frontend/src/stores/sessionStore.ts

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface Utterance {
  id: string;
  sequenceNum: number;
  status: 'transcribing' | 'processing' | 'ready' | 'error';
  rawTranscript: string | null;
  cleanedMeaning: string | null;
  promptReady: string | null;
  detectedLangs: string[];
  entities: string[];
  riskLevel: 'low' | 'medium' | 'high' | null;
  createdAt: Date;
}

interface Session {
  id: string;
  memoryEnabled: boolean;
  mode: 'strict' | 'balanced';
  summary: string | null;
  utterances: Utterance[];
  createdAt: Date;
}

interface SessionState {
  // State
  currentSession: Session | null;
  sessions: Session[];
  activeUtteranceId: string | null;
  partialTranscript: string;
  isRecording: boolean;
  isConnected: boolean;

  // Actions
  createSession: (memoryEnabled: boolean, mode: string) => Promise<Session>;
  setCurrentSession: (session: Session) => void;
  updateUtterance: (id: string, updates: Partial<Utterance>) => void;
  addUtterance: (utterance: Utterance) => void;
  setPartialTranscript: (text: string) => void;
  setRecording: (isRecording: boolean) => void;
  setConnected: (isConnected: boolean) => void;
  toggleMemory: () => void;
  setMode: (mode: 'strict' | 'balanced') => void;
  resetMemory: () => Promise<void>;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        currentSession: null,
        sessions: [],
        activeUtteranceId: null,
        partialTranscript: '',
        isRecording: false,
        isConnected: false,

        // Actions
        createSession: async (memoryEnabled, mode) => {
          const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memory_enabled: memoryEnabled, mode })
          });
          const session = await response.json();
          set({ currentSession: session });
          return session;
        },

        setCurrentSession: (session) => set({ currentSession: session }),

        updateUtterance: (id, updates) => set((state) => ({
          currentSession: state.currentSession ? {
            ...state.currentSession,
            utterances: state.currentSession.utterances.map(u =>
              u.id === id ? { ...u, ...updates } : u
            )
          } : null
        })),

        addUtterance: (utterance) => set((state) => ({
          currentSession: state.currentSession ? {
            ...state.currentSession,
            utterances: [...state.currentSession.utterances, utterance]
          } : null,
          activeUtteranceId: utterance.id
        })),

        setPartialTranscript: (text) => set({ partialTranscript: text }),
        setRecording: (isRecording) => set({ isRecording }),
        setConnected: (isConnected) => set({ isConnected }),

        toggleMemory: () => set((state) => ({
          currentSession: state.currentSession ? {
            ...state.currentSession,
            memoryEnabled: !state.currentSession.memoryEnabled
          } : null
        })),

        setMode: (mode) => set((state) => ({
          currentSession: state.currentSession ? {
            ...state.currentSession,
            mode
          } : null
        })),

        resetMemory: async () => {
          const session = get().currentSession;
          if (session) {
            await fetch(`/api/sessions/${session.id}/reset-memory`, { method: 'POST' });
            set((state) => ({
              currentSession: state.currentSession ? {
                ...state.currentSession,
                summary: null
              } : null
            }));
          }
        },

        clearSession: () => set({
          currentSession: null,
          partialTranscript: '',
          activeUtteranceId: null
        })
      }),
      {
        name: 'voice-prompt-session',
        partialize: (state) => ({ sessions: state.sessions })
      }
    )
  )
);
```

### 9.2 WebSocket Hook

```typescript
// frontend/src/hooks/useWebSocket.ts

import { useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';

interface WSMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(sessionId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const {
    setConnected,
    setPartialTranscript,
    updateUtterance,
    addUtterance
  } = useSessionStore();

  const connect = useCallback(() => {
    if (!sessionId || ws.current?.readyState === WebSocket.OPEN) return;

    ws.current = new WebSocket(`ws://localhost:8000/ws/audio/${sessionId}`);

    ws.current.onopen = () => {
      setConnected(true);
    };

    ws.current.onclose = () => {
      setConnected(false);
    };

    ws.current.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'partial_transcript':
          setPartialTranscript(data.text);
          break;

        case 'final_transcript':
          setPartialTranscript('');
          addUtterance({
            id: data.utterance_id,
            sequenceNum: data.sequence_num,
            status: 'processing',
            rawTranscript: data.text,
            cleanedMeaning: null,
            promptReady: null,
            detectedLangs: [],
            entities: [],
            riskLevel: null,
            createdAt: new Date()
          });
          break;

        case 'processing_complete':
          updateUtterance(data.utterance_id, {
            status: 'ready',
            cleanedMeaning: data.result.cleaned_meaning,
            promptReady: data.result.prompt_ready,
            detectedLangs: data.result.detected_langs,
            entities: data.result.entities,
            riskLevel: data.result.risk_level
          });
          break;

        case 'error':
          if (data.utterance_id) {
            updateUtterance(data.utterance_id, { status: 'error' });
          }
          console.error('WebSocket error:', data.message);
          break;
      }
    };
  }, [sessionId, setConnected, setPartialTranscript, updateUtterance, addUtterance]);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'audio_chunk' }));
      ws.current.send(audioData);
    }
  }, []);

  const startRecording = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'start_recording' }));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'stop_recording' }));
    }
  }, []);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connect, disconnect, sendAudio, startRecording, stopRecording };
}
```

---

## 10. Performance Optimization

### 10.1 Latency Targets

| Stage | Target P50 | Target P95 |
|-------|-----------|-----------|
| Audio capture → Backend | <50ms | <100ms |
| Backend → ElevenLabs | <100ms | <200ms |
| First partial transcript | <300ms | <500ms |
| Final transcript | <500ms | <1000ms |
| Gemini processing | <2000ms | <4000ms |
| **End-to-end** | <3000ms | <5000ms |

### 10.2 Optimization Strategies

1. **Audio Streaming**
   - Use small chunks (~100ms) for low latency
   - Implement adaptive buffering based on network conditions
   - Pre-establish WebSocket connection before recording

2. **Parallel Processing**
   - Start Gemini call immediately when final transcript arrives
   - Don't wait for ElevenLabs connection to close

3. **Caching**
   - Cache Gemini responses by (transcript_hash + mode + memory_hash)
   - Avoid re-processing on "Regenerate" if inputs unchanged

4. **Frontend**
   - Virtual scrolling for long session lists
   - Debounce partial transcript updates (16ms)
   - Lazy load historical sessions

### 10.3 Error Handling & Resilience

```python
# backend/app/services/stt_service.py

class STTServiceWithRetry(ElevenLabsSTTService):
    def __init__(self, api_key: str, max_retries: int = 3):
        super().__init__(api_key)
        self.max_retries = max_retries

    async def connect_with_retry(self) -> None:
        """Connect with exponential backoff."""
        for attempt in range(self.max_retries):
            try:
                await self.connect()
                return
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise
                wait_time = 2 ** attempt  # 1s, 2s, 4s
                await asyncio.sleep(wait_time)

    async def stream_audio_resilient(
        self,
        audio_chunks: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[dict, None]:
        """Stream with automatic reconnection on failure."""
        buffer = []

        async for chunk in audio_chunks:
            buffer.append(chunk)

            try:
                # Try to send chunk
                async for transcript in self.stream_audio(iter([chunk])):
                    yield transcript
            except websockets.ConnectionClosed:
                # Reconnect and replay buffer
                await self.connect_with_retry()
                async for transcript in self.stream_audio(iter(buffer)):
                    yield transcript
                buffer.clear()
```

---

## 11. Security Considerations

### 11.1 Secret Detection

```python
# backend/app/utils/security.py

import re
from typing import Tuple

SECRET_PATTERNS = [
    (r'[A-Za-z0-9]{32,}', 'api_key'),  # Generic long alphanumeric
    (r'sk-[A-Za-z0-9]{48}', 'openai_key'),
    (r'ghp_[A-Za-z0-9]{36}', 'github_pat'),
    (r'AIza[A-Za-z0-9_-]{35}', 'google_api_key'),
    (r'password["\']?\s*[:=]\s*["\'][^"\']+["\']', 'password'),
    (r'[a-zA-Z0-9+/]{40,}={0,2}', 'base64_secret'),
]

def detect_and_redact_secrets(text: str) -> Tuple[str, list[dict]]:
    """
    Detect potential secrets in text and redact them.

    Returns:
        (redacted_text, list of detected secrets with positions)
    """
    detected = []
    redacted = text

    for pattern, secret_type in SECRET_PATTERNS:
        for match in re.finditer(pattern, text):
            detected.append({
                'type': secret_type,
                'start': match.start(),
                'end': match.end(),
                'sample': match.group()[:8] + '...'  # First 8 chars only
            })
            redacted = redacted.replace(match.group(), f'[REDACTED_{secret_type.upper()}]')

    return redacted, detected


def sanitize_for_storage(
    utterance_data: dict,
    store_raw: bool = True
) -> dict:
    """Sanitize utterance data before storage."""
    if not store_raw:
        # Only store cleaned output
        return {
            'cleaned_meaning': utterance_data.get('cleaned_meaning'),
            'prompt_ready': utterance_data.get('prompt_ready'),
            # Don't store raw_transcript
        }

    # Redact secrets from raw transcript
    if utterance_data.get('raw_transcript'):
        redacted, secrets = detect_and_redact_secrets(utterance_data['raw_transcript'])
        if secrets:
            utterance_data['raw_transcript'] = redacted
            utterance_data['secrets_redacted'] = True

    return utterance_data
```

### 11.2 Input Validation

```python
# backend/app/api/deps.py

from fastapi import HTTPException
from pydantic import BaseModel, validator

class AudioChunkValidator(BaseModel):
    max_chunk_size: int = 32000  # ~1 second of 16kHz PCM
    max_duration_seconds: int = 300  # 5 minutes max per utterance

    @staticmethod
    def validate_chunk(data: bytes) -> bytes:
        if len(data) > 32000:
            raise HTTPException(400, "Audio chunk too large")
        if len(data) < 100:
            raise HTTPException(400, "Audio chunk too small")
        return data


class TranscriptValidator(BaseModel):
    raw_transcript: str

    @validator('raw_transcript')
    def validate_length(cls, v):
        if len(v) > 10000:
            raise ValueError("Transcript too long (max 10000 chars)")
        return v
```

---

## 12. Testing Strategy

### 12.1 Test Categories

```
tests/
├── unit/
│   ├── test_memory_service.py
│   ├── test_transcript_assembler.py
│   ├── test_secret_detection.py
│   └── test_audio_utils.py
│
├── integration/
│   ├── test_stt_service.py          # With mock ElevenLabs
│   ├── test_llm_service.py          # With mock Gemini
│   ├── test_websocket_flow.py       # Full WS flow
│   └── test_api_endpoints.py        # REST API tests
│
├── e2e/
│   ├── test_recording_flow.py       # Browser automation
│   └── test_copy_workflow.py
│
└── fixtures/
    ├── audio_samples/
    │   ├── english_clean.wav
    │   ├── tamil_pure.wav
    │   ├── hindi_pure.wav
    │   ├── tunglish_mixed.wav
    │   └── noisy_background.wav
    │
    └── expected_outputs/
        └── transcripts.json
```

### 12.2 Key Test Cases

```python
# tests/integration/test_llm_service.py

import pytest
from app.services.llm_service import GeminiService

class TestGeminiService:

    @pytest.mark.asyncio
    async def test_preserves_numbers(self, gemini_service):
        """Numbers must never be changed."""
        input_text = "I need 42 items costing $99.99 each"
        result = await gemini_service.process(input_text, mode="strict")

        assert "42" in result.cleaned_english_meaning
        assert "99.99" in result.cleaned_english_meaning

    @pytest.mark.asyncio
    async def test_preserves_urls(self, gemini_service):
        """URLs must never be modified."""
        input_text = "Check out https://example.com/path?query=123"
        result = await gemini_service.process(input_text, mode="strict")

        assert "https://example.com/path?query=123" in result.prompt_ready

    @pytest.mark.asyncio
    async def test_removes_fillers(self, gemini_service):
        """Filler words should be removed."""
        input_text = "Um, like, I need, you know, a button"
        result = await gemini_service.process(input_text, mode="strict")

        assert "um" not in result.cleaned_english_meaning.lower()
        assert "like" not in result.cleaned_english_meaning.lower()
        assert "you know" not in result.cleaned_english_meaning.lower()

    @pytest.mark.asyncio
    async def test_tunglish_translation(self, gemini_service):
        """Tunglish should be correctly translated."""
        input_text = "Intha button-a click pannuna next page-ku poganum"
        result = await gemini_service.process(input_text, mode="balanced")

        assert result.detected_languages == ["tunglish"]
        assert "click" in result.cleaned_english_meaning.lower()
        assert "button" in result.cleaned_english_meaning.lower()
        assert "page" in result.cleaned_english_meaning.lower()

    @pytest.mark.asyncio
    async def test_high_risk_flagging(self, gemini_service):
        """Ambiguous translations should flag high risk."""
        # Ambiguous Tamil phrase
        input_text = "Avan sonnadhu correct-a?"
        result = await gemini_service.process(input_text, mode="strict")

        assert result.meaning_change_risk in ["medium", "high"]

    @pytest.mark.asyncio
    async def test_memory_context_continuity(self, gemini_service):
        """Memory should provide context for pronouns."""
        memory_packet = {
            "summary": "User is building a React dashboard",
            "recent_utterances": [
                {"raw_transcript": "I'm adding charts", "output": {"cleaned_english_meaning": "Adding charts"}}
            ]
        }

        input_text = "Make them interactive"  # "them" refers to charts
        result = await gemini_service.process(
            input_text,
            mode="balanced",
            memory=memory_packet
        )

        # Should understand "them" refers to charts from context
        assert "chart" in result.cleaned_english_meaning.lower() or "interactive" in result.cleaned_english_meaning.lower()
```

---

## 13. Deployment Configuration

### 13.1 Docker Compose (Development)

```yaml
# docker-compose.yml

version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=sqlite:///./data/app.db
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - ./backend:/app
      - ./data:/app/data
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8000
      - VITE_WS_URL=ws://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev -- --host

volumes:
  data:
```

### 13.2 Environment Variables

```bash
# .env.example

# Backend
DATABASE_URL=sqlite:///./data/app.db
ELEVENLABS_API_KEY=your_eleven_labs_key
GEMINI_API_KEY=your_gemini_key

# Optional
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173
MAX_SESSION_DURATION_SECONDS=3600
MEMORY_BUFFER_SIZE=8
SUMMARY_REFRESH_INTERVAL=5

# Frontend (Vite)
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## 14. Implementation Milestones (Detailed)

### Milestone 1: Foundation (Days 1-3)
- [ ] Initialize React + Vite + TypeScript project
- [ ] Set up shadcn/ui components
- [ ] Create basic three-panel layout
- [ ] Initialize FastAPI backend
- [ ] Set up SQLite database + migrations
- [ ] Implement session CRUD endpoints
- [ ] Basic REST API client in frontend

### Milestone 2: Audio Capture (Days 4-6)
- [ ] Implement WebAudio recorder hook
- [ ] Create RecordButton component (hold to record)
- [ ] Add waveform visualizer
- [ ] Set up WebSocket connection (client)
- [ ] Set up WebSocket endpoint (backend)
- [ ] Stream audio chunks from browser to backend

### Milestone 3: Transcription (Days 7-10)
- [ ] Integrate ElevenLabs Scribe v2 Realtime
- [ ] Implement transcript assembler service
- [ ] Handle partial vs final transcripts
- [ ] Display streaming transcript in UI
- [ ] Show status chips (Transcribing, Processing, etc.)
- [ ] Error handling for STT failures

### Milestone 4: LLM Processing (Days 11-14)
- [ ] Implement Gemini service with structured outputs
- [ ] Create strict and balanced mode prompts
- [ ] Build output pane (Cleaned + Prompt-ready tabs)
- [ ] Implement risk banner for high-risk changes
- [ ] Add copy button functionality
- [ ] Add regenerate with different mode

### Milestone 5: Memory System (Days 15-18)
- [ ] Implement memory service
- [ ] Build memory packet for Gemini
- [ ] Add session summary generation
- [ ] Create memory toggle in UI
- [ ] Add "Reset memory" functionality
- [ ] Test multi-turn context preservation

### Milestone 6: Polish & Metrics (Days 19-21)
- [ ] Add thumbs up/down feedback
- [ ] Add "edited heavily" checkbox
- [ ] Track copy events
- [ ] Implement latency metrics
- [ ] Add settings panel
- [ ] Session history list
- [ ] Export session as JSON

---

## 15. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| ElevenLabs latency spikes | High | Implement timeout + fallback message |
| Gemini over-cleans text | High | Strict mode, diff view, user confirmation |
| Memory pollution | Medium | Bounded buffer, periodic summarization |
| WebSocket disconnections | Medium | Auto-reconnect with exponential backoff |
| Large audio files | Low | Client-side validation, max duration limit |
| API rate limits | Medium | Request queuing, graceful degradation |

---

## Next Steps

1. **Review this plan** - Ensure alignment with your vision
2. **Set up development environment** - Docker, Node.js, Python
3. **Start Milestone 1** - Foundation sprint
4. **Create UI mockups** - Use the frontend skill for detailed designs

Would you like me to proceed with the frontend UI design using the frontend skill?
