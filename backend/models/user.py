"""
NexaMind Backend — User Pydantic Models

Defines all user-related data models for request validation,
response serialization, and database document representation.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    """User role enumeration."""

    USER = "user"
    ADMIN = "admin"


class AuthProvider(str, Enum):
    """Authentication provider enumeration."""

    EMAIL = "email"
    GOOGLE = "google"


class UserBase(BaseModel):
    """Base user model with shared fields."""

    name: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="User display name",
    )
    email: EmailStr = Field(
        ...,
        description="User email address",
    )


class UserCreate(UserBase):
    """Model for user registration requests."""

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password (min 8 chars, 1 upper, 1 lower, 1 digit, 1 special)",
    )


class UserLogin(BaseModel):
    """Model for user login requests."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserInDB(UserBase):
    """Complete user document as stored in MongoDB."""

    id: str = Field(..., alias="_id", description="MongoDB document ID")
    hashed_password: str = Field(..., description="Bcrypt hashed password")
    role: UserRole = Field(default=UserRole.USER, description="User role")
    auth_provider: AuthProvider = Field(
        default=AuthProvider.EMAIL,
        description="Authentication provider used for registration",
    )
    is_verified: bool = Field(default=False, description="Email verification status")
    is_active: bool = Field(default=True, description="Account active status")
    avatar_url: Optional[str] = Field(
        default=None,
        description="URL to user avatar image on Cloudinary",
    )
    two_factor_enabled: bool = Field(
        default=False,
        description="Whether 2FA is enabled",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Account creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Last update timestamp",
    )

    class Config:
        populate_by_name = True


class UserResponse(UserBase):
    """User data returned in API responses (no sensitive fields)."""

    id: str = Field(..., description="User ID")
    role: UserRole = Field(description="User role")
    auth_provider: AuthProvider = Field(description="Authentication provider")
    is_verified: bool = Field(description="Email verification status")
    avatar_url: Optional[str] = Field(default=None, description="Avatar URL")
    two_factor_enabled: bool = Field(description="2FA status")
    created_at: datetime = Field(description="Account creation timestamp")


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    user_id: str = Field(..., description="User ID from MongoDB")
    email: str = Field(..., description="User email")
    role: UserRole = Field(..., description="User role")
    exp: Optional[int] = Field(default=None, description="Token expiration timestamp")
    iat: Optional[int] = Field(default=None, description="Token issued-at timestamp")


class OTPVerify(BaseModel):
    """Model for OTP verification requests."""

    email: EmailStr = Field(..., description="User email address")
    otp: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit OTP code",
    )


class PasswordReset(BaseModel):
    """Model for password reset requests."""

    email: EmailStr = Field(..., description="User email address")
    otp: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        description="6-digit OTP code",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password",
    )
