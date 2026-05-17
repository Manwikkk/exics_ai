-- ═══════════════════════════════════════════════════════════════
-- Exics — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor to create all required tables
-- ═══════════════════════════════════════════════════════════════

-- Chats
CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New chat',
    model TEXT NOT NULL DEFAULT 'groq',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    model TEXT,
    attachments JSONB DEFAULT '[]',
    citations JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    chunk_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing',
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- Chat-Document linking (per-chat document scoping)
CREATE TABLE IF NOT EXISTS chat_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    filename TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(chat_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_documents_chat_id ON chat_documents(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_documents_doc_id ON chat_documents(doc_id);

-- Encrypted API Keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Feedback
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    message_id UUID,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Chats: users can only access their own chats
CREATE POLICY "Users manage own chats" ON chats
    FOR ALL USING (auth.uid() = user_id);

-- Messages: users can access messages in their own chats
CREATE POLICY "Users manage messages in own chats" ON messages
    FOR ALL USING (chat_id IN (SELECT id FROM chats WHERE user_id = auth.uid()));

-- Documents: users can view all documents, manage their own
CREATE POLICY "Users view all documents" ON documents
    FOR SELECT USING (true);
CREATE POLICY "Users manage own documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own documents" ON documents
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own documents" ON documents
    FOR DELETE USING (auth.uid() = user_id);

-- Chat-Documents: users can manage links in their own chats
CREATE POLICY "Users manage own chat documents" ON chat_documents
    FOR ALL USING (chat_id IN (SELECT id FROM chats WHERE user_id = auth.uid()));

-- API Keys: users can only access their own keys
CREATE POLICY "Users manage own API keys" ON api_keys
    FOR ALL USING (auth.uid() = user_id);

-- Feedback: users can only access their own feedback
CREATE POLICY "Users manage own feedback" ON feedback
    FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- Service role bypass (the backend uses service_role key)
-- The service_role key bypasses RLS by default in Supabase.
-- No additional policies needed for the backend.
-- ═══════════════════════════════════════════════════════════════
