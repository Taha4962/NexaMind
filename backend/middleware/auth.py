"""
NexaMind Backend — JWT Authentication Middleware

FastAPI dependency that verifies JWT access tokens on protected routes.
Checks token validity, expiration, and revocation status against MongoDB.
"""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from jose import JWTError, jwt

from config import get_settings
from db.mongo import get_db
from models.user import TokenPayload, UserRole

logger = logging.getLogger("nexamind.middleware.auth")

# ── Security Scheme ──
security = HTTPBearer(
    scheme_name="JWT Access Token",
    description="JWT access token obtained from the authentication endpoint",
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenPayload:
    """
    FastAPI dependency that extracts and validates the JWT access token.

    Reads the Authorization: Bearer <token> header, verifies the JWT
    signature and expiration, checks the token is not revoked, and
    returns the decoded user payload.

    Args:
        credentials: HTTP Bearer token credentials extracted by FastAPI.

    Returns:
        TokenPayload containing userId, email, and role.

    Raises:
        HTTPException 401: If the token is missing, expired, invalid, or revoked.
    """
    token = credentials.credentials
    settings = get_settings()

    # ── Decode and Verify JWT ──
    try:
        payload = jwt.decode(
            token,
            settings.jwt_access_secret,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except JWTError as e:
        logger.warning("JWT verification failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    # ── Extract Required Fields ──
    user_id = payload.get("user_id")
    email = payload.get("email")
    role = payload.get("role")

    if not user_id or not email:
        logger.warning("JWT payload missing required fields: %s", payload)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: missing user_id or email",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Check Token Revocation ──
    try:
        db = get_db()
        revoked = await db.revoked_tokens.find_one({"token": token})
        if revoked is not None:
            logger.warning("Revoked token used by user: %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error checking token revocation: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error",
        ) from e

    # ── Build Token Payload ──
    try:
        token_data = TokenPayload(
            user_id=user_id,
            email=email,
            role=UserRole(role) if role else UserRole.USER,
            exp=payload.get("exp"),
            iat=payload.get("iat"),
        )
    except ValueError as e:
        logger.warning("Invalid role in JWT payload: %s", role)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    return token_data
