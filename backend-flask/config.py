import os

# Database Config
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "qwen")
POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")

# LLM Config
# OLLAMA = "http://ollama:11434/api/generate"

# ✅ MODEL ROUTING FIX: Switched endpoint to /api/chat to let LLM engine manage ChatML/Gemma templates natively
# MODEL_CHAT_URL = os.getenv("OLLAMA_CHAT_URL", "http://ollama:11434/api/chat")
# MODEL_NAME = os.getenv("OLLAMA_QWEN_NAME", "qwen3.5:9b")
MODEL_CHAT_URL = os.getenv("VLLM_CHAT_URL", "http://vllm:10000/v1/chat/completions")
MODEL_NAME = os.getenv("VLLM_QWEN_NAME", "Qwen/Qwen3.5-9B")
MAX_CONTEXT_MESSAGES = 20

# SSE (Server-Sent Events) Config
SSE_PREFIX = os.getenv("SSE_PREFIX", "data: ")
SSE_DELIMITER = os.getenv("SSE_DELIMITER", "\n\n\n\n")
SSE_CHUNK = os.getenv("SSE_CHUNK", "chunk")
SSE_DONE = os.getenv("SSE_DONE", "done")
SSE_IDS = os.getenv("SSE_IDS", "message_ids")
SSE_ERR = os.getenv("SSE_ERR", "error")
SSE_META = os.getenv("SSE_META", "meta")