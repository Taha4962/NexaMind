"""
NexaMind Backend — FastAPI Application Entry Point

Configures the FastAPI application with:
- Lifespan context manager for MongoDB connection lifecycle
- CORS middleware with allowed origins from config
- Router mounting under /api/v1 prefix
- Global exception handling for unhandled errors
- Request logging middleware
- Health check endpoint
"""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from db.mongo import MongoDB
from db.vector_store import ChromaVectorStore
from routes.agent import router as agent_router
from routes.documents import router as documents_router
from routes.memory import router as memory_router

# ── Logging Configuration ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("nexamind")

# ── Application Version ──
APP_VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan context manager.

    On startup:
      1. Connects to MongoDB and creates all indexes.
      2. Initializes the ChromaDB persistent client.
    On shutdown:
      1. Closes the MongoDB connection gracefully.
    """
    logger.info("Starting NexaMind Backend v%s", APP_VERSION)

    # ── Startup: MongoDB ──────────────────────────────────────────────────────
    try:
        await MongoDB.connect()
        await MongoDB.create_indexes()
        logger.info("MongoDB ready")
    except Exception as e:
        logger.error("Failed to connect to MongoDB: %s", str(e))
        raise

    # ── Startup: ChromaDB ─────────────────────────────────────────────────────
    try:
        await ChromaVectorStore.get_instance()
        logger.info("ChromaDB vector store ready")
    except Exception as e:
        # Non-fatal: app can still serve requests without vector search
        logger.warning("ChromaDB initialization failed (non-fatal): %s", str(e))

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    try:
        await MongoDB.disconnect()
        logger.info("MongoDB connection closed")
    except Exception as e:
        logger.error("Error disconnecting from MongoDB: %s", str(e))

    logger.info("NexaMind Backend shutdown complete")


# ── FastAPI Application ──
app = FastAPI(
    title="NexaMind API",
    description="Personal AI agent with RAG, memory layer, knowledge graph, and multi-agent orchestration",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS Middleware ──
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# ── Request Logging Middleware ──
@app.middleware("http")
async def log_requests(request: Request, call_next) -> JSONResponse:  # type: ignore[no-untyped-def]
    """Log all incoming requests with method, path, and response time."""
    start_time = time.time()
    request_id = f"{int(start_time * 1000)}"

    logger.info(
        "REQ %s | %s %s",
        request_id,
        request.method,
        request.url.path,
    )

    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(
            "REQ %s | Unhandled error: %s",
            request_id,
            str(exc),
        )
        raise

    duration_ms = (time.time() - start_time) * 1000
    logger.info(
        "RES %s | %d | %.1fms",
        request_id,
        response.status_code,
        duration_ms,
    )

    response.headers["X-Request-ID"] = request_id
    return response


# ── Global Exception Handler ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all handler for unhandled exceptions.

    Logs the full error and returns a sanitized 500 response
    to avoid leaking internal details to the client.
    """
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An internal server error occurred",
            "error": "INTERNAL_SERVER_ERROR",
        },
    )


# ── Route Mounting ──
app.include_router(agent_router, prefix="/api/v1/agent", tags=["Agent"])
app.include_router(documents_router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(memory_router, prefix="/api/v1/memory", tags=["Memory"])


# ── Health Check ──
@app.get(
    "/health",
    tags=["System"],
    summary="Health check endpoint",
    response_description="Returns application health status",
)
async def health_check() -> dict[str, str]:
    """
    Health check endpoint.

    Returns the application status, current timestamp, and version.
    Used by load balancers and monitoring services.
    """
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": APP_VERSION,
    }
