from contextlib import asynccontextmanager
import logging
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.api.error_handling import register_exception_handlers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("co-constructive_interfaces_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for application startup and shutdown tasks."""
    # Verify critical environment variables on startup
    required_keys = ["OPENAI_API_KEY"]
    missing_keys = [key for key in required_keys if not os.getenv(key)]
    present_keys = [key for key in required_keys if os.getenv(key)]

    if missing_keys:
        logger.warning(
            "Missing API Keys: %s. The application may not function correctly.",", ".join(missing_keys)
        )
    else:
        logger.info("Initialized with API keys: %s", ", ".join(present_keys))

    yield
    logger.info("Shutting down Co-constructive Interfaces API...")


app = FastAPI(
    title="Co-constructive Interfaces API",
    description="Backend service for co-building diagrams from LLM outputs.",
    version="1.0.0",
    lifespan=lifespan,
)

# Parse CORS origins from environment variable, fallback to default local Vite dev ports
default_origins = "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", default_origins).split(",")
    if origin.strip()
]

register_exception_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API endpoints
app.include_router(api_router, prefix="/api")


@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint to verify backend operational state."""
    return {
        "status": "ok",
        "service": app.title,
        "version": app.version,
    }