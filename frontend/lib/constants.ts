/**
 * NexaMind Frontend — Application Constants
 *
 * Centralized constants for route paths, API endpoints,
 * token configuration, and application metadata.
 */

// ══════════════════════════════════════════
// Application Metadata
// ══════════════════════════════════════════

/** Application display name */
export const APP_NAME = "NexaMind" as const;

/** Application description for SEO */
export const APP_DESCRIPTION =
  "Personal AI agent with RAG, memory, knowledge graph, and multi-agent orchestration" as const;

/** Current application version */
export const APP_VERSION = "1.0.0" as const;

// ══════════════════════════════════════════
// Route Paths
// ══════════════════════════════════════════

/** Public route paths */
export const ROUTES = {
  HOME: "/",
  SIGN_IN: "/sign-in",
  SIGN_UP: "/sign-up",
  VERIFY_OTP: "/verify-otp",
  FORGOT_PASSWORD: "/forgot-password",
  DASHBOARD: "/dashboard",
  CHAT: "/dashboard/chat",
  DOCUMENTS: "/dashboard/documents",
  MEMORY: "/dashboard/memory",
} as const;

/** Routes that don't require authentication */
export const PUBLIC_ROUTES: readonly string[] = [
  ROUTES.HOME,
  ROUTES.SIGN_IN,
  ROUTES.SIGN_UP,
  ROUTES.VERIFY_OTP,
  ROUTES.FORGOT_PASSWORD,
] as const;

/** Route prefix that requires authentication */
export const PROTECTED_ROUTE_PREFIX = "/dashboard" as const;

// ══════════════════════════════════════════
// API Endpoints
// ══════════════════════════════════════════

/** Next.js API route endpoints (frontend gateway) */
export const API_ROUTES = {
  AUTH: {
    REGISTER: "/api/auth/register",
    LOGIN: "/api/auth/login",
    LOGOUT: "/api/auth/logout",
    REFRESH: "/api/auth/refresh",
    VERIFY_OTP: "/api/auth/verify-otp",
    FORGOT_PASSWORD: "/api/auth/forgot-password",
    RESET_PASSWORD: "/api/auth/reset-password",
    GOOGLE: "/api/auth/google",
    SESSION: "/api/auth/session",
  },
  AGENT: {
    CHAT: "/api/agent/chat",
  },
  DOCUMENTS: {
    LIST: "/api/documents",
    UPLOAD: "/api/documents/upload",
    DELETE: (id: string) => `/api/documents/${id}`,
    GET: (id: string) => `/api/documents/${id}`,
  },
  MEMORY: {
    LIST: "/api/memory",
    CREATE: "/api/memory",
    UPDATE: (id: string) => `/api/memory/${id}`,
    DELETE: (id: string) => `/api/memory/${id}`,
    GET: (id: string) => `/api/memory/${id}`,
  },
  CHATS: {
    LIST: "/api/chats",
    GET: (id: string) => `/api/chats/${id}`,
    DELETE: (id: string) => `/api/chats/${id}`,
  },
} as const;

/** Python backend API endpoints (called from Next.js API routes) */
export const BACKEND_ENDPOINTS = {
  AGENT_CHAT: "/api/v1/agent/chat",
  DOCUMENTS: "/api/v1/documents",
  DOCUMENTS_UPLOAD: "/api/v1/documents/upload",
  MEMORY: "/api/v1/memory",
  HEALTH: "/health",
} as const;

// ══════════════════════════════════════════
// Token Configuration
// ══════════════════════════════════════════

/** JWT access token expiry in seconds (15 minutes) */
export const ACCESS_TOKEN_EXPIRY = 15 * 60;

/** JWT refresh token expiry in seconds (7 days) */
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60;

/** OTP expiry in seconds (10 minutes) */
export const OTP_EXPIRY = 10 * 60;

/** OTP length in digits */
export const OTP_LENGTH = 6;

// ══════════════════════════════════════════
// Security Configuration
// ══════════════════════════════════════════

/** Bcrypt hash rounds for password hashing */
export const BCRYPT_ROUNDS = 12;

/** Maximum login attempts before lockout */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Lockout duration in seconds (30 minutes) */
export const LOCKOUT_DURATION = 30 * 60;

// ══════════════════════════════════════════
// Upload Configuration
// ══════════════════════════════════════════

/** Maximum file upload size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed document MIME types */
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

/** Allowed file extensions */
export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

// ══════════════════════════════════════════
// UI Configuration
// ══════════════════════════════════════════

/** Maximum chat message length */
export const MAX_MESSAGE_LENGTH = 10000;

/** Number of messages to load per page */
export const MESSAGES_PER_PAGE = 50;

/** Number of chats to show in sidebar */
export const CHATS_PER_PAGE = 20;
