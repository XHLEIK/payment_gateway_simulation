-- ============================================================================
-- REGILLY ASSIGNMENT
-- PAYMENT GATEWAY & WALLET MANAGEMENT SYSTEM DATABASE SCHEMA
-- ============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    transaction_pin_hash VARCHAR(255),
    pin_attempts INT NOT NULL DEFAULT 0,
    pin_locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Wallets Table (with check constraint to prevent negative balance)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0.00),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Transactions Table (Idempotent request keys & reference IDs)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(100) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0.00),
    type VARCHAR(50) NOT NULL, -- 'CREDIT' | 'DEBIT'
    status VARCHAR(50) NOT NULL DEFAULT 'INITIATED', -- 'INITIATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REFUNDED'
    gateway_order_id VARCHAR(100) UNIQUE,
    gateway_payment_id VARCHAR(100),
    request_id VARCHAR(255) UNIQUE, -- Idempotency Key
    balance_after NUMERIC(15, 2), -- Balance after transaction completes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Refunds Table (Dedicated Refund records for partial/approval workflows)
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0.00),
    reason VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'REJECTED'
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Transaction Audits Table (Correlation IDs & state logs)
CREATE TABLE IF NOT EXISTS transaction_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    actor VARCHAR(255) NOT NULL, -- 'system' | 'user' | 'admin:<id>'
    correlation_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Daily Transaction Statistics Table (Pre-aggregated stats for high speed queries)
CREATE TABLE IF NOT EXISTS daily_transaction_stats (
    date DATE PRIMARY KEY,
    success_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    total_volume NUMERIC(15, 2) NOT NULL DEFAULT 0.00
);

-- 7. Payment Requests Table (Direct request money feature)
CREATE TABLE IF NOT EXISTS payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0.00),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- DATABASE INDEXES (Task 7 optimization specifications)
-- ============================================================================

-- A. Composite Index for user-scoped date sorting queries (Dashboard history speedup)
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions (user_id, created_at DESC);

-- B. Partial Index for pending/active payments logs (Saves index disk space)
CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions (status) WHERE status != 'SUCCESS';

-- C. Gateway order index for webhook callbacks
CREATE INDEX IF NOT EXISTS idx_txn_gateway_order ON transactions (gateway_order_id);

-- D. Indexes for fast payment requests lookup
CREATE INDEX IF NOT EXISTS idx_pay_req_payer ON payment_requests (payer_id, status);
CREATE INDEX IF NOT EXISTS idx_pay_req_payee ON payment_requests (payee_id, status);

-- ============================================================================
-- INITIAL SEED DATA (Standard passwords: 'Subham@1234')
-- ============================================================================

-- Bcrypt hash generated for: 'Subham@1234'
-- Hash: $2b$10$RA.jVR8hPL4kL/JXN9FvuO8MC/IG3SIVh7tbnoWJ2n4iUuiXqD7v2

-- Seed Admin
INSERT INTO users (id, name, email, password_hash, role)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'System Administrator', 'admin@regilly.com', '$2b$10$RA.jVR8hPL4kL/JXN9FvuO8MC/IG3SIVh7tbnoWJ2n4iUuiXqD7v2', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO wallets (user_id, balance)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 10000.00)
ON CONFLICT (user_id) DO NOTHING;

-- Seed Standard User
INSERT INTO users (id, name, email, password_hash, role)
VALUES ('f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c', 'Subham Bose', 'user@regilly.com', '$2b$10$tMoxp.L2xHjY1yXWvIinveVjTeg.wY4o.x452g690v125P32V9g1i', 'user')
ON CONFLICT (email) DO NOTHING;

INSERT INTO wallets (user_id, balance)
VALUES ('f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c', 2500.00)
ON CONFLICT (user_id) DO NOTHING;
