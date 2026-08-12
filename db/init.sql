CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,                -- DEFAULT 'New Chat',
    system_prompt TEXT DEFAULT 'You are a helpful assistant powered by a large language model running locally.',
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('user', 'assistant')),              -- 'user' or 'assistant'
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable Trigram extension for fast searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index the conversation titles
CREATE INDEX IF NOT EXISTS conversations_title_trgm_idx 
ON conversations USING GIN (title gin_trgm_ops);

-- Index the message content
CREATE INDEX IF NOT EXISTS messages_content_trgm_idx 
ON messages USING GIN (content gin_trgm_ops);