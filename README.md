# NexaMind

> A production-grade personal AI agent with RAG, memory layer, knowledge graph, and multi-agent orchestration.

## Architecture Overview

NexaMind is a full-stack AI assistant that remembers the user, answers from uploaded documents, searches the web, and reasons across sessions using persistent memory and a knowledge graph.

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│              Next.js 14 (App Router)                 │
│         TypeScript · Tailwind · shadcn/ui            │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │   Auth   │  │   Chat   │  │  Documents/Memory │   │
│  │  Pages   │  │   UI     │  │    Management     │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                      │                               │
│              Next.js API Routes                      │
│          (Gateway + Auth + Session)                   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/SSE
┌──────────────────────┴──────────────────────────────┐
│                   AI Backend                         │
│              FastAPI (Python 3.11)                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │            Agent Orchestrator                   │  │
│  │  ┌─────┐  ┌────────┐  ┌─────┐  ┌──────────┐  │  │
│  │  │ RAG │  │ Memory │  │ Web │  │  Direct  │  │  │
│  │  └──┬──┘  └───┬────┘  └──┬──┘  └──────────┘  │  │
│  └─────┼─────────┼──────────┼────────────────────┘  │
│        │         │          │                        │
│  ┌─────┴───┐ ┌───┴────┐ ┌──┴───┐                   │
│  │ChromaDB │ │MongoDB │ │Tavily│                    │
│  │ Vectors │ │Memories│ │Search│                    │
│  └─────────┘ └────────┘ └──────┘                    │
│        │                                             │
│  ┌─────┴──────────┐                                 │
│  │   NetworkX     │                                  │
│  │Knowledge Graph │                                  │
│  └────────────────┘                                  │
└──────────────────────────────────────────────────────┘
```

## Branch Strategy

| Branch | Tier | Vector Store | Knowledge Graph | LLM |
|--------|------|-------------|-----------------|-----|
| `main` | Free | ChromaDB | NetworkX | Gemini Flash + Groq fallback |
| `paid` | Paid | Pinecone | Neo4j | Gemini Pro |

The `main` branch is the live deployed version using free-tier services. The `paid` branch uses premium services for development and learning.

## Tech Stack

### Frontend + Gateway
- **Next.js 14** — App Router with server/client components
- **TypeScript** — Strict mode, zero `any` types
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Accessible component library
- **iron-session** — Encrypted session cookies
- **TanStack Query v5** — Server state management
- **Zod** — Runtime input validation
- **Axios** — HTTP client with interceptors

### AI Backend
- **FastAPI** — Async Python web framework
- **LangChain** — Agent orchestration framework
- **Gemini 2.5 Flash** — Primary LLM (Google Generative AI)
- **Groq (Llama 3.3 70B)** — Fallback LLM
- **ChromaDB** — Vector store for document embeddings
- **NetworkX** — In-memory knowledge graph
- **text-embedding-004** — Google embedding model

### Databases & Storage
- **MongoDB Atlas** — Users, chats, messages, memories, documents
- **Cloudinary** — File, image, and document storage
- **ChromaDB** — Vector embeddings (local via Docker)

### Authentication
- Email + password (bcrypt 12 rounds)
- Google OAuth 2.0
- 2FA via email OTP (6-digit, 10 min expiry)
- JWT access tokens (15 min) + refresh tokens (7 days)
- Refresh token rotation with blacklisting
- Brute force protection (5 failures = 30 min lockout)

## Prerequisites

- **Node.js** 20+ and npm 10+
- **Python** 3.11+
- **Docker** and Docker Compose (for local MongoDB + ChromaDB)
- **MongoDB Atlas** account (for production)
- **Cloudinary** account (file storage)
- **Google Cloud Console** project (OAuth + Gemini API)
- **Groq** account (fallback LLM)
- **Tavily** account (web search)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <repo-url>
cd AI-Chat\ Application
```

### 2. Configure Environment Variables

#### Frontend
```bash
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local with your values
```

#### Backend
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### 3. Start Local Services (Docker)

```bash
docker-compose up -d
```

This starts:
- MongoDB on `localhost:27017`
- ChromaDB on `localhost:8001`

### 4. Start the Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify: `GET http://localhost:8000/health` should return `{ "status": "ok", "version": "1.0.0" }`

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Frontend URL (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_PYTHON_BACKEND_URL` | Backend URL (e.g., `http://localhost:8000`) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars, different from access) |
| `SESSION_SECRET` | iron-session encryption key (min 32 chars) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `EMAIL_HOST` | SMTP host (e.g., `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (e.g., `587`) |
| `EMAIL_USER` | SMTP email address |
| `EMAIL_PASS` | SMTP app password |
| `EMAIL_FROM` | Sender display (e.g., `NexaMind <email>`) |

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB connection string |
| `PYTHON_BACKEND_PORT` | Backend port (default `8000`) |
| `CLIENT_URL` | Frontend URL for CORS |
| `JWT_ACCESS_SECRET` | Must match frontend secret |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GROQ_API_KEY` | Groq console API key |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CHROMA_PERSIST_DIR` | ChromaDB data directory |
| `TAVILY_API_KEY` | Tavily search API key |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins |

## Project Structure

```
├── frontend/          ← Next.js 14 app (gateway + UI)
├── backend/           ← FastAPI Python app (AI + agents)
├── docker-compose.yml ← Local MongoDB + ChromaDB
├── .gitignore
└── README.md
```

## Completed Features

- [x] Project scaffold and folder structure
- [x] MongoDB models: User, OtpVerification, LoginAttempt, RevokedToken
- [x] Custom auth: register, login, logout, refresh, me
- [x] JWT access token (15 min) + refresh token (7 days, httpOnly cookie)
- [x] Token blacklist on logout (by JTI claim)
- [x] Refresh token rotation with replay-attack protection
- [x] Brute force protection (5 failures = 30 min lockout)
- [x] OTP email via Nodemailer (register + reset + 2FA)
- [x] In-memory rate limiting (register: 5/hr, login: 10/min per IP)
- [x] Google OAuth 2.0 (issues own JWT, links to existing accounts)
- [x] Two-factor authentication via email OTP (enable/disable/confirm)
- [x] Change password with session rotation
- [x] CSRF protection on OAuth state parameter
- [x] Login tracking (loginCount, lastLoginAt)
- [x] GET /api/v1/agent/me — backend JWT verification smoke test

## License

Private project — all rights reserved.
