"""
Gemini Service for transcript cleanup, translation, and prompt generation.

Uses Google's Gemini API with structured outputs for reliable JSON responses.
"""

import os
import json
import logging
import httpx
from typing import Optional
from pydantic import BaseModel, Field
from enum import Enum
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables - find .env relative to this file
# Path: backend/app/services/gemini_service.py -> go up 4 levels to audio/.env
_this_file = Path(__file__).resolve()
_env_path = _this_file.parent.parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger(__name__)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


def get_gemini_api_key() -> str | None:
    """Get Gemini API key, checking environment each time."""
    return os.getenv("gemini_api")


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ProcessingMode(str, Enum):
    STRICT = "strict"
    BALANCED = "balanced"


class Entity(BaseModel):
    text: str
    type: str  # name, number, url, code, filename, other


class TranscriptOutput(BaseModel):
    """Structured output from Gemini processing."""
    detected_languages: list[str] = Field(description="Languages detected: english, tamil, hindi, tunglish")
    raw_transcript: str = Field(description="Original transcript")
    cleaned_english_meaning: str = Field(description="Cleaned English preserving exact meaning")
    prompt_ready_english: str = Field(description="Structured English for LLM prompt use")
    removed_fillers: bool = Field(description="Whether filler words were removed")
    meaning_change_risk: RiskLevel = Field(description="Risk that cleaning altered meaning")
    entities: list[Entity] = Field(description="Key entities that must not be changed")
    confidence_score: float = Field(description="Confidence in translation accuracy 0-1")


# System prompts for different modes
STRICT_SYSTEM_PROMPT = """You are a transcription cleaner and prompt composer. Your job is to:
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

For Tunglish (Tamil-English mix): Translate the Tamil parts to English while keeping English parts intact.
For pure Tamil/Hindi: Translate to natural English while preserving the exact meaning.

If translation is ambiguous, set meaning_change_risk to "high" and provide the most literal interpretation.

IMPORTANT: Respond ONLY with valid JSON matching the schema provided. No markdown, no extra text."""

BALANCED_SYSTEM_PROMPT = """You are a transcription cleaner and prompt composer. Your job is to:
1. Clean speech transcriptions while preserving core meaning
2. Translate Tamil/Hindi/Tunglish to clear, natural English
3. Convert the cleaned text into a well-structured prompt format

RULES:
- NEVER change numbers, URLs, file paths, code tokens, proper nouns
- Remove fillers, hesitations, false starts, repetitions
- Improve clarity and structure while keeping the intent
- For prompts: add appropriate structure (bullet points, sections) if it improves clarity

For Tunglish (Tamil-English mix): Translate naturally, combining Tamil and English parts into fluent English.
For pure Tamil/Hindi: Translate to natural, idiomatic English.

Balance natural expression with faithfulness to the original intent.

IMPORTANT: Respond ONLY with valid JSON matching the schema provided. No markdown, no extra text."""


def get_json_schema() -> dict:
    """Get the JSON schema for structured output."""
    return {
        "type": "object",
        "properties": {
            "detected_languages": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Languages detected in input (english, tamil, hindi, tunglish)"
            },
            "raw_transcript": {
                "type": "string",
                "description": "Original transcript exactly as provided"
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
                        "text": {"type": "string"},
                        "type": {"type": "string"}
                    },
                    "required": ["text", "type"]
                },
                "description": "Key entities (names, numbers, URLs, code) that must not be changed"
            },
            "confidence_score": {
                "type": "number",
                "description": "Confidence in translation/cleanup accuracy (0-1)"
            }
        },
        "required": [
            "detected_languages",
            "raw_transcript",
            "cleaned_english_meaning",
            "prompt_ready_english",
            "meaning_change_risk",
            "entities",
            "confidence_score"
        ]
    }


async def process_transcript(
    raw_transcript: str,
    mode: ProcessingMode = ProcessingMode.BALANCED,
    context: Optional[str] = None,
    previous_turns: Optional[list[dict]] = None
) -> dict:
    """
    Process a transcript through Gemini for cleanup and translation.

    Args:
        raw_transcript: The raw STT output
        mode: Processing mode (strict or balanced)
        context: Optional session context/summary
        previous_turns: Optional list of previous utterances for continuity

    Returns:
        Structured output with cleaned and prompt-ready text
    """
    api_key = get_gemini_api_key()
    if not api_key:
        logger.error("Gemini API key not configured")
        return {
            "error": "Gemini API key not configured",
            "raw_transcript": raw_transcript,
            "cleaned_english_meaning": raw_transcript,
            "prompt_ready_english": raw_transcript,
            "detected_languages": ["unknown"],
            "meaning_change_risk": "high",
            "entities": [],
            "confidence_score": 0.0
        }

    # Select system prompt based on mode
    system_prompt = STRICT_SYSTEM_PROMPT if mode == ProcessingMode.STRICT else BALANCED_SYSTEM_PROMPT

    # Build the prompt
    user_prompt = f"Process this transcript and return JSON:\n\n{raw_transcript}"

    # Add context if provided
    if context:
        user_prompt = f"Session context: {context}\n\n{user_prompt}"

    # Add previous turns for continuity
    if previous_turns:
        turns_text = "\n".join([
            f"Previous: {t.get('raw', '')} → {t.get('cleaned', '')}"
            for t in previous_turns[-3:]  # Last 3 turns
        ])
        user_prompt = f"Previous utterances:\n{turns_text}\n\n{user_prompt}"

    # Prepare request payload
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": system_prompt},
                    {"text": user_prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "topK": 40,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseSchema": get_json_schema()
        }
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={api_key}",
                json=payload,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code != 200:
                logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                return create_fallback_response(raw_transcript, f"API error: {response.status_code}")

            result = response.json()

            # Extract the generated content
            candidates = result.get("candidates", [])
            if not candidates:
                logger.error("No candidates in Gemini response")
                return create_fallback_response(raw_transcript, "No response from Gemini")

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                logger.error("No parts in Gemini response")
                return create_fallback_response(raw_transcript, "Empty response from Gemini")

            text = parts[0].get("text", "")

            # Parse the JSON response
            try:
                output = json.loads(text)
                output["raw_transcript"] = raw_transcript  # Ensure original is preserved
                logger.info(f"Gemini processed: {raw_transcript[:50]}... → {output.get('cleaned_english_meaning', '')[:50]}...")
                return output
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini JSON: {e}\nResponse: {text[:500]}")
                return create_fallback_response(raw_transcript, "Invalid JSON from Gemini")

    except httpx.TimeoutException:
        logger.error("Gemini API timeout")
        return create_fallback_response(raw_transcript, "API timeout")
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return create_fallback_response(raw_transcript, str(e))


def create_fallback_response(raw_transcript: str, error: str) -> dict:
    """Create a fallback response when Gemini fails."""
    return {
        "error": error,
        "detected_languages": ["unknown"],
        "raw_transcript": raw_transcript,
        "cleaned_english_meaning": raw_transcript,
        "prompt_ready_english": raw_transcript,
        "removed_fillers": False,
        "meaning_change_risk": "high",
        "entities": [],
        "confidence_score": 0.0
    }


# Simple test function
async def test_gemini():
    """Test the Gemini service."""
    test_cases = [
        "Um, I want to like, add a button, you know, for the login page",
        "நான் ஒரு புதிய feature add பண்ணணும்",
        "Intha app-la oru dark mode toggle venum, right side corner-la",
    ]

    for transcript in test_cases:
        print(f"\n--- Testing: {transcript[:50]}... ---")
        result = await process_transcript(transcript, ProcessingMode.BALANCED)
        print(f"Languages: {result.get('detected_languages')}")
        print(f"Cleaned: {result.get('cleaned_english_meaning')}")
        print(f"Prompt: {result.get('prompt_ready_english')}")
        print(f"Risk: {result.get('meaning_change_risk')}")


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv(dotenv_path="../../.env")
    asyncio.run(test_gemini())
