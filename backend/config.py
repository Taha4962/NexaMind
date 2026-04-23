"""
NexaMind Backend — Application Configuration

Pydantic Settings class that loads and validates all environment variables
at startup. The application will fail fast with a clear error message if
any required variable is missing or invalid.
"""

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator


class DatabaseConfig(BaseSettings):
    """MongoDB connection configuration."""

    mongo_url: str = Field(
        ...,
        description="MongoDB Atlas connection string",
        json_schema_extra={"env": "MONGO_URL"},
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


class AIConfig(BaseSettings):
    """AI service API keys and configuration."""

    gemini_api_key: str = Field(
        ...,
        description="Google AI Studio API key for Gemini models",
        json_schema_extra={"env": "GEMINI_API_KEY"},
    )
    groq_api_key: str = Field(
        ...,
        description="Groq Console API key for Llama fallback models",
        json_schema_extra={"env": "GROQ_API_KEY"},
    )
    tavily_api_key: str = Field(
        ...,
        description="Tavily API key for web search",
        json_schema_extra={"env": "TAVILY_API_KEY"},
    )
    chroma_persist_dir: str = Field(
        default="./chroma_data",
        description="ChromaDB persistent storage directory",
        json_schema_extra={"env": "CHROMA_PERSIST_DIR"},
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


class AuthConfig(BaseSettings):
    """Authentication and JWT configuration."""

    jwt_access_secret: str = Field(
        ...,
        min_length=32,
        description="JWT access token signing secret (minimum 32 characters)",
        json_schema_extra={"env": "JWT_ACCESS_SECRET"},
    )

    @field_validator("jwt_access_secret")
    @classmethod
    def validate_jwt_secret_length(cls, v: str) -> str:
        """Ensure JWT secret meets minimum length requirement."""
        if len(v) < 32:
            raise ValueError("JWT_ACCESS_SECRET must be at least 32 characters long")
        return v

    class Config:
        env_file = ".env"
        extra = "ignore"


class CloudinaryConfig(BaseSettings):
    """Cloudinary file storage configuration."""

    cloudinary_cloud_name: str = Field(
        ...,
        description="Cloudinary cloud name",
        json_schema_extra={"env": "CLOUDINARY_CLOUD_NAME"},
    )
    cloudinary_api_key: str = Field(
        ...,
        description="Cloudinary API key",
        json_schema_extra={"env": "CLOUDINARY_API_KEY"},
    )
    cloudinary_api_secret: str = Field(
        ...,
        description="Cloudinary API secret",
        json_schema_extra={"env": "CLOUDINARY_API_SECRET"},
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


class Settings(BaseSettings):
    """
    Main application settings.

    Aggregates all configuration sections and validates environment
    variables at startup. The app will crash with a descriptive error
    if any required variable is missing.
    """

    # ── Server ──
    python_backend_port: int = Field(
        default=8000,
        description="FastAPI server port",
        json_schema_extra={"env": "PYTHON_BACKEND_PORT"},
    )
    client_url: str = Field(
        default="http://localhost:3000",
        description="Frontend URL for CORS",
        json_schema_extra={"env": "CLIENT_URL"},
    )
    allowed_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated allowed CORS origins",
        json_schema_extra={"env": "ALLOWED_ORIGINS"},
    )

    # ── Database ──
    mongo_url: str = Field(
        ...,
        description="MongoDB Atlas connection string",
        json_schema_extra={"env": "MONGO_URL"},
    )

    # ── Auth ──
    jwt_access_secret: str = Field(
        ...,
        min_length=32,
        description="JWT access token signing secret",
        json_schema_extra={"env": "JWT_ACCESS_SECRET"},
    )

    # ── AI Services ──
    gemini_api_key: str = Field(
        ...,
        description="Google Gemini API key",
        json_schema_extra={"env": "GEMINI_API_KEY"},
    )
    groq_api_key: str = Field(
        ...,
        description="Groq API key",
        json_schema_extra={"env": "GROQ_API_KEY"},
    )
    tavily_api_key: str = Field(
        ...,
        description="Tavily search API key",
        json_schema_extra={"env": "TAVILY_API_KEY"},
    )
    chroma_persist_dir: str = Field(
        default="./chroma_data",
        description="ChromaDB persistent storage path",
        json_schema_extra={"env": "CHROMA_PERSIST_DIR"},
    )

    # ── Cloudinary ──
    cloudinary_cloud_name: str = Field(
        ...,
        description="Cloudinary cloud name",
        json_schema_extra={"env": "CLOUDINARY_CLOUD_NAME"},
    )
    cloudinary_api_key: str = Field(
        ...,
        description="Cloudinary API key",
        json_schema_extra={"env": "CLOUDINARY_API_KEY"},
    )
    cloudinary_api_secret: str = Field(
        ...,
        description="Cloudinary API secret",
        json_schema_extra={"env": "CLOUDINARY_API_SECRET"},
    )

    @field_validator("jwt_access_secret")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        """Ensure JWT secret meets minimum security requirements."""
        if len(v) < 32:
            raise ValueError("JWT_ACCESS_SECRET must be at least 32 characters")
        return v

    def get_allowed_origins(self) -> list[str]:
        """Parse comma-separated ALLOWED_ORIGINS into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"
        case_sensitive = False


def get_settings() -> Settings:
    """
    Create and return a validated Settings instance.

    Raises:
        ValidationError: If any required environment variable is missing or invalid.
            The error message will clearly indicate which variables need to be set.
    """
    return Settings()  # type: ignore[call-arg]
