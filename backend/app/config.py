"""Central settings, read from the environment (backend/.env)."""
import os

from langchain_openai import ChatOpenAI

LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "60"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "2"))

def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    """The single place a chat model is configured: model, timeout and retries."""
    return ChatOpenAI(model=LLM_MODEL, temperature=temperature, timeout=LLM_TIMEOUT_S, max_retries=MAX_RETRIES)
