# Local ChatGPT-class System
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
# Local ChatGPT Clone Roadmap

## Phase 0 — Completed Foundation

### Core Chat

- [x] User registration
- [x] User login
- [x] JWT authentication
- [x] PostgreSQL persistence
- [x] Conversation threads
- [x] Chat history loading
- [x] System prompts
- [x] Streaming SSE responses

### Rendering

- [x] Markdown
- [x] GitHub Flavored Markdown (GFM)
- [x] KaTeX math rendering
- [x] Syntax highlighting
- [x] Streaming cursor animation

### Performance

- [x] vLLM backend
- [x] Stop generation
- [x] Virtualized chat list (react-virtuoso)
- [x] Streaming chunk batching

### Infrastructure

- [x] Docker Compose deployment
- [x] Container health checks

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

# Phase 5 — Memory

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
```

---

## 18. Vector Database

### Candidates

- pgvector
- Qdrant
- Milvus

### Recommended

```text
PostgreSQL + pgvector
```

Reason:

- Already using PostgreSQL
- Simpler deployment
- Excellent performance for single-node setups

---

## 19. Retrieval Pipeline

Prompt construction:

```text
Conversation History
        +
Relevant Memories
        +
User Query
```

---

## 20. Memory Intelligence

Automatic:

```text
Extract
Merge
Summarize
Forget
```

---

# Phase 6 — Tools

## 21. Tool Framework

OpenAI-compatible tool schema.

Example:

```json
{
  "name": "search",
  "description": "Search the web"
}
```

---

## 22. Built-in Tools

Planned:

```text
Web Search
Calculator
Python
Filesystem
Database
```

---

## 23. Tool Streaming

Display intermediate steps:

```text
Thinking...
Calling Tool...
Tool Result...
Generating Answer...
```

---

# Phase 7 — Agents

## 24. Single-Agent Workflow

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

## 25. Multi-Agent System

Possible agents:

```text
Planner
Researcher
Coder
Reviewer
```

---

# Phase 8 — Security

## 26. Password Hashing

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

## 27. HTTPS

Reverse proxy:

- Nginx
- Traefik

---

## 28. Rate Limiting

Protect against:

```text
Spam
Abuse
DoS attacks
```

---

## 29. CSRF / CORS Hardening

Production requirement.

---

# Phase 9 — UX Polish

## 30. Mobile UI

Responsive layouts.

---

## 31. Themes

```text
Dark Mode
Light Mode
```

---

## 32. Keyboard Shortcuts

Examples:

```text
Ctrl+Enter
Ctrl+K
Ctrl+/
```

---

## 33. Message Actions

```text
Copy
Edit
Delete
Regenerate
```

---

## 34. Typing Indicators

Examples:

```text
Thinking...
Generating...
```

---

## 35. Token Usage Statistics

Display:

```text
Prompt Tokens
Completion Tokens
Total Tokens
Estimated Cost
```

---

# Recommended Next Priorities

## Immediate

1. Real DB Message IDs
2. Conversation Rename
3. Conversation Search
4. bcrypt Migration
5. Async Queue

---

## Next Wave

6. Edit Message
7. Regenerate Response
8. Incremental Markdown Rendering
9. Diff Rendering
10. Memory V1

---

## Long-Term

11. pgvector Integration
12. Retrieval Pipeline
13. Tool Framework
14. Agent Framework
15. Production Security Hardening