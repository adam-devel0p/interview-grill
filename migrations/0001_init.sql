-- migrations/0001_init.sql

CREATE TABLE interviews (
    id TEXT PRIMARY KEY,
    email TEXT,
    cv_text TEXT NOT NULL,
    job_description TEXT,
    analysis_json TEXT,
    interview_state_json TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    paid INTEGER NOT NULL DEFAULT 0,
    free_answers_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX idx_interviews_status ON interviews(status);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'interviewer' | 'candidate'
    content TEXT NOT NULL,
    evaluation_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
);
CREATE INDEX idx_messages_interview ON messages(interview_id);

CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    interview_id TEXT UNIQUE NOT NULL,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
);

CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    interview_id TEXT,
    provider TEXT NOT NULL,
    provider_order_id TEXT,
    amount INTEGER,
    currency TEXT,
    status TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_interview ON payments(interview_id);
CREATE UNIQUE INDEX idx_payments_provider_order ON payments(provider, provider_order_id);

CREATE TABLE events (
    id TEXT PRIMARY KEY,
    interview_id TEXT,
    event_name TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_events_name ON events(event_name);
CREATE INDEX idx_events_interview ON events(interview_id);

CREATE TABLE ai_usage (
    id TEXT PRIMARY KEY,
    interview_id TEXT,
    request_type TEXT NOT NULL, -- 'analysis' | 'interviewer' | 'evaluator' | 'report'
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost_usd REAL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_usage_interview ON ai_usage(interview_id);
