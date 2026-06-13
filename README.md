# Local ChatGPT-class System
```
Version    : 0.55
Model      : Qwen3.5-9B + vLLM + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- Mainstream Chat UI style (Dark Theme)
- Conversation Pin/Unpin
- Conversation Rename
```
Version    : 0.52
Model      : Qwen3.5-9B + vLLM + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- Thread-safe Database Connection Pooling
- Bcrypt Migration for password hashing
- Real Message IDs for conversation renaming, searching, pinning, archiving and better sorting
- Streaming Cancellation in cases of pressing Stop button, reloading or closing page, and switching conversation
```
Version    : 0.51
Model      : Qwen3.5-9B + vLLM + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- Stop button to implement request and streaming cancellation, which can also be triggered by reloading or closing Chat UI
- LaTex/KaTeX and code block syntax highlighting
- Virtualization for long chats
- Streaming optimization by accumulating and flushing chunks 
- Streaming cursor animation
```
Version    : 0.5
Model      : Qwen3.5-9B + vLLM + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- Milestone: Adapts to both vLLM and Ollama
```
Version    : 0.4
Model      : Qwen3.5-9B + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- System prompts
- Switched from the legacy /api/generate string endpoint to the standardized /api/chat payload structure for ollama to handle engine compatibility without changing backend logic
```
Version    : 0.3
Model      : Qwen3.5-9B + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- Streaming responses
- Better chat rendering with markdowns and basic styling
- Conversations titles by the first prompt and no entry for empty conversation on the sidebar
- Auto-create first conversation on login → removes need for clicking "New Chat"
```
Version    : 0.2
Model      : Qwen3.5-9B + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
Updates:
- Implement multiple chats with sidebar switching and persistent per-chat history
- Load history automatically into each request 
- Persist chat messages in PostgreSQL
- Assign ports in .env
- Set maximum VRAM for a single model
```
Version    : 0.1
Model      : Qwen3.5-9B + Ollama
Environment: Intel Core Ultra 9 275HX + NVIDIA GeForce RTX 5090/24GB + 64GB DDR5 6400MHz + 2TB SSD
```
## Request flow

1. Receive input
2. Query vector DB → relevant past conversations
3. Query PostgreSQL → known facts
4. Build prompt:
   - system instructions
   - user facts
   - relevant memory
   - recent chat
5. Send to Qwen (Ollama)
6. Return response
7. Store new memory

## High-level architecture
```
React UI
   ↓
Node.js API (gateway)
   ↓
Flask AI service
   ↓
 ┌───────────────┐
 │ Memory Layer  │
 │               │
 │ Vector DB     │ (Chroma / FAISS)
 │ + PostgreSQL  │ (structured data)
 └───────────────┘
   ↓
Ollama (Qwen model)
```
## Project Directory Structure
```
qwen-local-chatgpt/
│
├── docker-compose.yml
├── .env
├── setup.sh
│
├── backend-flask/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py
│   ├── auth.py
│   └── memory.py
│
├── backend-node/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── Login.jsx
│       └── MemoryPanel.jsx
│
├── db/
│   └── init.sql
│
└── memory/
    └── chroma/
```
# Roadmap

## Phase 0 — Completed Foundation

### Core Chat

- ✅ User registration
- ✅ User login
- ✅ PostgreSQL persistence
- ✅ Conversation threads
- ✅ Chat history loading
- ✅ System prompts
- ✅ Streaming SSE responses

### Rendering

- ✅ Markdown
- ✅ GitHub Flavored Markdown (GFM)
- ✅ KaTeX math rendering
- ✅ Syntax highlighting
- ✅ Streaming cursor animation

### Performance

- ✅ vLLM backend
- ✅ Stop generation
- ✅ Virtualized chat list (react-virtuoso)
- ✅ Streaming chunk batching
- ✅ Auto-scroll during streaming
- ✅ Scroll preservation while reading history
- ✅ Streaming cancellation

### Database
- ✅ PostgreSQL connection pooling
- ✅ Thread-safe connection pool
- ✅ Cursor lifecycle management
- ✅ Safe streaming database writes

### Infrastructure

- ✅ Docker Compose deployment
- ✅ Container health checks
- ✅ vLLM OpenAI-compatible API integration
- ✅ Backend/frontend container separation

### Security Foundation

- ✅ JWT authentication
- ✅ Password hashing (bcrypt)

---

# Phase 1 — Data Model Cleanup

## 1. Real Message IDs

### Current

```javascript
id: generateId()
```

### Target

```sql
messages
---------
id BIGSERIAL PRIMARY KEY
conversation_id BIGINT
role TEXT
content TEXT
created_at TIMESTAMP
```

Frontend:

```javascript
id: m.id
```

### Enables

- Edit message
- Regenerate response
- Delete message
- Diff rendering
- Citations
- Memory linkage

---

## 2. Conversation Metadata

### Current

```sql
conversations
-------------
id
user_id
title
```

### Target

```sql
conversations
-------------
id
user_id
title
created_at
updated_at
archived
pinned
```

### Enables

- Search
- Pinning
- Archiving
- Better sorting

---

# Phase 2 — Chat UX

## 3. Conversation Rename

Add manual title editing.

Example:

```text
✏ Rename Conversation
```

---

## 4. Conversation Search

Search across:

- Conversation title
- User messages
- Assistant messages

Example:

```text
docker
postgres
memory
```

---

## 5. Conversation Delete / Archive

Features:

```text
Delete
Archive
Restore
```

---

## 6. Conversation Pinning

Features:

```text
📌 Pin Conversation
```

Stored in database.

---

## 7. Conversation Export

Supported formats:

```text
Markdown
JSON
HTML
PDF
```

---

# Phase 3 — Rendering Engine

## 8. Incremental Markdown Rendering

### Current

Every chunk:

```text
append text
reparse markdown
rerender markdown
```

### Target

```text
stable content
+
streaming tail
```

Only the streaming tail is reparsed.

### Benefits

- Faster rendering
- Smoother code blocks
- Better tables
- Better math rendering

Priority: High

---

## 9. Diff Rendering

Show edits visually.

Example:

```diff
- old content
+ new content
```

### Use Cases

- Message editing
- Response regeneration
- Tool updates
- Memory updates

Priority: Medium

---

## 10. Edit User Message

ChatGPT-style:

```text
User Message
└ Edit
```

### Options

```text
Fork Conversation
Replace Branch
```

Requires real message IDs.

---

## 11. Regenerate Assistant Response

```text
↻ Regenerate
```

Requires real message IDs.

---

# Phase 4 — Scalability

## 12. Async Queue

### Current

```text
Browser
  ↓
Flask
  ↓
vLLM
```

### Target

```text
Browser
  ↓
Queue
  ↓
Worker
  ↓
vLLM
```

### Candidate Technologies

- Redis
- Dramatiq
- Celery
- RQ

### Recommended

```text
Redis + Dramatiq
```

---

## 13. Database Connection Pooling

### Current

```python
conn = psycopg2.connect(...)
```

### Target

```python
from psycopg2.pool import ThreadedConnectionPool
```

Benefits:

- Better concurrency
- Faster requests
- Lower connection overhead

---

## 14. Streaming Metrics

Track:

```text
Tokens/sec
First token latency
Total latency
Queue depth
```

---

## 15. Admin Dashboard

Display:

```text
GPU utilization
VRAM usage
Active chats
Request queue
Token throughput
```

---

# Phase 5 — Memory & RAG

## 16. Basic Memory

Store:

```text
Facts
Preferences
Projects
```

---

## 17. Memory UI

Features:

```text
View memories
Edit memories
Delete memories
Pin
```

---

## 18. Conversation Intelligence

Auto-generate:

```text
Title
Summary
Tags
System Prompt
```

Examples:

```text
User is building a Dockerized React application.

Prefer production-ready code examples.
```

This becomes the foundation for memory.

---

## 19. Vector Database

Recommended:

```text
PostgreSQL + pgvector
```

Reason:

```text
Already using PostgreSQL
Simple deployment
Excellent single-node performance
```

---

## 20. Retrieval Pipeline

Prompt assembly:

```text
Conversation History
        +
Conversation Summary
        +
Relevant Memories
        +
Relevant Documents
        +
User Query
```

---

## 21. RAG (Retrieval-Augmented Generation)

Sources:

```text
Conversation Memory
User Memory
Uploaded Files
Knowledge Base
```

Retrieval:

```text
Embedding Search
Hybrid Search
Metadata Filtering
```

---

## 22. Memory Intelligence

Automatic:

```text
Extract
Merge
Summarize
Deduplicate
Forget
Update
```

Examples:

```text
User uses Docker
User owns RTX 5090
User prefers complete code
```

This is where memory becomes self-maintaining.

---

# Phase 6 — Tools

## 23. Tool Framework

OpenAI-compatible tool schema.

Example:

```json
{
  "name": "search",
  "description": "Search the web"
}
```

---

## 24. Built-in Tools

Planned:

```text
Web Search
Calculator
Python
Filesystem
Database
```

---

## 25. Tool Streaming

Display intermediate steps:

```text
Thinking...
Calling Tool...
Tool Result...
Generating Answer...
```

---

# Phase 7 — Agents

## 26. Single-Agent Workflow

```text
Reason
↓
Tool
↓
Observe
↓
Respond
```

---

## 27. Multi-Agent System

Possible agents:

```text
Planner
Researcher
Coder
Reviewer
```

---

# Phase 8 — Security

## 28. Password Hashing

### Current

```python
hashlib.sha256(...)
```

### Target

```python
bcrypt.hashpw(...)
```

Priority: Critical

---

## 29. HTTPS

Reverse proxy:

- Nginx
- Traefik

---

## 30. Rate Limiting

Protect against:

```text
Spam
Abuse
DoS attacks
```

---

## 31. CSRF / CORS Hardening

Production requirement.

---

# Phase 9 — UX Polish

## 32. Mobile UI

Responsive layouts.

---

## 33. Themes

```text
Dark Mode
Light Mode
```

---

## 34. Keyboard Shortcuts

Examples:

```text
Ctrl+Enter
Ctrl+K
Ctrl+/
```

---

## 35. Message Actions

```text
Copy
Edit
Delete
Regenerate
```

---

## 36. Typing Indicators

Examples:

```text
Thinking...
Generating...
```

---

## 37. Token Usage Statistics

Display:

```text
Prompt Tokens
Completion Tokens
Total Tokens
Estimated Cost
```

---

# Recommended Next Priorities

## Immediate (Next Sprint)

- [x] Database Connection Pooling
- [x] bcrypt Migration
- [x] Real Message IDs
- [x] Conversation Rename
- [ ] Conversation Search
- [ ] Edit Message
- [ ] Regenerate Response

---

## Near-Term

- [ ] Async Queue (Redis + Dramatiq)
- [ ] Incremental Markdown Rendering
- [ ] Diff Rendering

---

## Memory Foundation

- [ ] Conversation Intelligence
- [ ] Basic Memory
- [ ] Memory UI

---

## RAG Layer

- [ ] pgvector Integration
- [ ] Retrieval Pipeline
- [ ] RAG
- [ ] Memory Intelligence

---

## AI Platform

- [ ] Tool Framework
- [ ] Tool Streaming
- [ ] Agent Framework

---

## Production Readiness

- [ ] HTTPS
- [ ] Rate Limiting
- [ ] Security Hardening
- [ ] Monitoring Dashboard