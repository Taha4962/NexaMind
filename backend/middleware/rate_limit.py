"""
NexaMind Backend — Rate Limiting Middleware

Configures slowapi rate limiter for protecting API endpoints
from abuse. Uses client IP address for rate limit tracking.
"""

import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("nexamind.middleware.rate_limit")

# ── Rate Limiter Instance ──
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri="memory://",
    strategy="fixed-window",
)


def get_limiter() -> Limiter:
    """
    Get the configured rate limiter instance.

    Returns:
        The slowapi Limiter instance configured with default rate limits.
    """
    return limiter
