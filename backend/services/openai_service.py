"""
OpenAI Service
Wrapper around the OpenAI API for chat completions.
"""

from openai import AsyncOpenAI
from config import OPENAI_API_KEY, OPENAI_MODEL

# Lazy-initialize client to avoid import-time errors
_client = None

def get_client():
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _client


async def chat_completion(
    system_prompt: str,
    user_message: str,
    temperature: float = 0.3,
    max_tokens: int = 4000,
) -> str:
    """
    Send a chat completion request to OpenAI asynchronously.
    Uses low temperature for factual/clinical accuracy.
    """
    try:
        client = get_client()
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise Exception(f"OpenAI API error: {str(e)}")


async def chat_completion_with_history(
    system_prompt: str,
    messages: list[dict],
    temperature: float = 0.3,
    max_tokens: int = 4000,
) -> str:
    """
    Send a chat completion request with conversation history asynchronously.
    Used for the document chat feature.
    """
    try:
        client = get_client()
        all_messages = [{"role": "system", "content": system_prompt}]
        all_messages.extend(messages)

        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=all_messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise Exception(f"OpenAI API error: {str(e)}")
