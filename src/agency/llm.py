"""The one place model choice lives. Every tool calls `ask()`."""

from __future__ import annotations

from functools import lru_cache

import anthropic

from agency import config

MODELS: dict[str, str] = {
    "opus": "claude-opus-5-5",  # hard reasoning / long documents (sparingly)
    "sonnet": "claude-sonnet-5-5",  # default for writing and agent logic
    "haiku": "claude-haiku-5-5",  # high-volume short tasks: scoring, first lines
}


@lru_cache(maxsize=1)
def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=config.require("ANTHROPIC_API_KEY"))


def resolve_model(model: str) -> str:
    """Accept a short alias (opus/sonnet/haiku) or a full model ID."""
    return MODELS.get(model, model)


def ask(
    prompt: str,
    model: str = "sonnet",
    system: str | None = None,
    max_tokens: int = 1500,
) -> str:
    """Send one user message and return the text reply."""
    kwargs: dict = {
        "model": resolve_model(model),
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    response = client().messages.create(**kwargs)
    return "".join(block.text for block in response.content if block.type == "text").strip()
