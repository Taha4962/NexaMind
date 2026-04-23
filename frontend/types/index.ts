/**
 * NexaMind Frontend — TypeScript Interfaces and Types
 *
 * All shared type definitions used across the application.
 * Defines interfaces for users, chats, messages, memories,
 * documents, and API response structures.
 */

// ══════════════════════════════════════════
// Agent Types
// ══════════════════════════════════════════

/** Agent type that handled a message */
export type AgentType = "rag" | "memory" | "web" | "direct";

// ══════════════════════════════════════════
// User Types
// ══════════════════════════════════════════

/** User authentication provider */
export type AuthProvider = "email" | "google";

/** User role */
export type UserRole = "user" | "admin";

/** User profile data */
export interface User {
  /** User ID from MongoDB */
  id: string;
  /** Display name */
  name: string;
  /** Email address */
  email: string;
  /** User role */
  role: UserRole;
  /** Authentication provider used */
  authProvider: AuthProvider;
  /** Whether email is verified */
  isVerified: boolean;
  /** Avatar image URL */
  avatarUrl: string | null;
  /** Whether 2FA is enabled */
  twoFactorEnabled: boolean;
  /** Account creation timestamp */
  createdAt: string;
}

// ══════════════════════════════════════════
// Chat & Message Types
// ══════════════════════════════════════════

/** Source attribution for RAG responses */
export interface Source {
  /** Source document ID */
  docId: string;
  /** Original filename */
  filename: string;
  /** Page number in source document */
  pageNumber: number | null;
  /** Relevant text chunk from the source */
  chunkText: string;
}

/** Message role in a conversation */
export type MessageRole = "user" | "assistant";

/** Individual message in a chat */
export interface Message {
  /** Message ID */
  id: string;
  /** Message author role */
  role: MessageRole;
  /** Message text content */
  content: string;
  /** Source attributions (RAG responses only) */
  sources: Source[];
  /** Agent that handled this message */
  agentType: AgentType | null;
  /** Message creation timestamp */
  createdAt: string;
}

/** Chat session */
export interface Chat {
  /** Chat ID */
  id: string;
  /** Chat title */
  title: string;
  /** Number of messages */
  messageCount: number;
  /** Last message timestamp */
  lastMessageAt: string | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/** Chat session with full message history */
export interface ChatWithMessages extends Chat {
  /** Ordered list of messages */
  messages: Message[];
}

// ══════════════════════════════════════════
// Memory Types
// ══════════════════════════════════════════

/** Memory classification type */
export type MemoryType = "fact" | "preference" | "experience" | "instruction";

/** Memory importance level */
export type MemoryImportance = "low" | "medium" | "high" | "critical";

/** User memory */
export interface Memory {
  /** Memory ID */
  id: string;
  /** Memory content text */
  content: string;
  /** Memory classification */
  memoryType: MemoryType;
  /** Importance level */
  importance: MemoryImportance;
  /** Tags for categorization */
  tags: string[];
  /** Number of times accessed */
  accessCount: number;
  /** Whether memory is active */
  isActive: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

// ══════════════════════════════════════════
// Document Types
// ══════════════════════════════════════════

/** Document processing status */
export type DocumentStatus = "pending" | "processing" | "completed" | "failed";

/** Supported document file types */
export type DocumentType = "pdf" | "docx" | "txt" | "md";

/** Uploaded document */
export interface Document {
  /** Document ID */
  id: string;
  /** Original filename */
  filename: string;
  /** File type */
  documentType: DocumentType;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of pages (PDFs only) */
  pageCount: number | null;
  /** Number of text chunks */
  chunkCount: number;
  /** Processing status */
  status: DocumentStatus;
  /** Error message if processing failed */
  errorMessage: string | null;
  /** Upload timestamp */
  createdAt: string;
  /** Processing completion timestamp */
  processedAt: string | null;
}

// ══════════════════════════════════════════
// Auth State
// ══════════════════════════════════════════

/** Client-side authentication state */
export interface AuthState {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is loading */
  isLoading: boolean;
  /** Current user data */
  user: User | null;
  /** JWT access token (in memory only) */
  accessToken: string | null;
}

// ══════════════════════════════════════════
// API Response Types
// ══════════════════════════════════════════

/**
 * Generic API response wrapper.
 *
 * All API routes return this structure for consistent
 * error handling and data access.
 */
export interface ApiResponse<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** Response data (present on success) */
  data?: T;
  /** Error code (present on failure) */
  error?: string;
}

// ══════════════════════════════════════════
// JWT Token Types
// ══════════════════════════════════════════

/** Decoded JWT token payload */
export interface TokenPayload {
  /** User ID from MongoDB */
  userId: string;
  /** User email */
  email: string;
  /** User role */
  role: string;
  /** Token expiration timestamp */
  exp?: number;
  /** Token issued-at timestamp */
  iat?: number;
}

// ══════════════════════════════════════════
// Request Types
// ══════════════════════════════════════════

/** Agent chat request */
export interface AgentChatRequest {
  /** User message */
  message: string;
  /** Existing chat ID to continue */
  chatId?: string;
}

/** Agent chat response */
export interface AgentChatResponse {
  /** Assistant's response */
  message: Message;
  /** Chat ID (existing or newly created) */
  chatId: string;
}
