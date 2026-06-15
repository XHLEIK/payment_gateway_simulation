# Regilly Assignment: Payment Gateway Backend (NestJS)

This is the NestJS backend API service for the **Payment Gateway & Wallet Management System**. It handles user authentication, secure ledger wallets, multi-stage payment transitions, asynchronous mock gateway payments, and cached metrics reporting.

---

## 🚀 Key Features & Architectural Patterns

- **Modular NestJS Architecture**: Logically separated into domain modules (`auth`, `wallets`, `transactions`, `payments`, `analytics`, `redis`, `notifications`, `disputes`).
- **In-App Notification Center**: Custom `NotificationsModule` that tracks read/unread actions and leverages Redis atomic increments (`unread:{userId}`) to serve unread counts in $O(1)$ time, eliminating database latency.
- **Transaction Reversal (Compensating Transactions)**: Implements database transactions in `SERIALIZABLE` isolation to handle sender/receiver rollback transfers safely.
- **Dispute FSM Validation**: Employs finite state validation (`OPEN -> UNDER_REVIEW -> RESOLVED/REJECTED`) with a composite unique index `idx_dispute_txn_user` to prevent multiple claims on a single transaction.
- **Spend Limit Rate Limiting**: Employs a Redis sliding window to enforce daily spend velocity thresholds with a seamless fallback to database aggregations during Redis downtime.
- **Pessimistic Row-Level Locking (`SELECT FOR UPDATE`)**: Wallet balances are adjusted under row-level database locks during credits and debits to prevent race conditions.
- **Deadlock Prevention (Lock Ordering)**: P2P transfer requests sort sender and recipient user UUIDs alphabetically prior to locking rows, breaking circular locking deadlocks.
- **Timing-Safe HMAC Webhook Verification**: Protects against side-channel timing attacks by checking gateway webhook signatures using `crypto.timingSafeEqual` over pre-hashed signatures.
- **HTTP Security Headers & CORS**: Binds `helmet` middleware for standard defense-in-depth headers and restricts CORS origin dynamically based on environment configuration.
- **Analytics Caching & Eviction**: Serves pre-aggregated statistics (success rate, total volume) from a Redis cache. The cache is automatically evicted when a new transaction is committed.
- **Structured Winston Logging**: Employs JSON logging with request-scoped tracking headers (`X-Correlation-ID`) for distributed tracing.

---

## 🛠️ Tech Stack

- **Framework**: NestJS v11.x (TypeScript)
- **Database ORM**: TypeORM v0.3.x with PostgreSQL Driver
- **Data Stores**: PostgreSQL (v16+) & Redis (ioredis client)
- **Security**: Passport JWT guards, Bcrypt (10 rounds) passwords & PIN hashing, Crypto HMAC
- **Testing**: Jest (Unit & E2E Integration)

---

## 📂 Directory Structure

```
backend/
├── scripts/                    # Database administrative scripts
│   ├── init-db.js              # Verifies & creates local payment_gateway_db
│   ├── seed.js                 # Applies primary DB schema and seeds
│   ├── seed-demo.js            # Seeds rich demo dataset (10 users, 60 txns, 5 refunds)
│   ├── check-schema.js         # Prints DB column listings
│   ├── check-tables.js         # Checks presence & rows of tables
│   ├── test-concurrency.js     # Simulates heavy concurrent debit loads
│   └── test-redis.js           # Tests Redis availability & failover
├── src/                        # NestJS Application Source
│   ├── main.ts                 # Bootstraps application & binds middlewares
│   ├── app.module.ts           # Imports TypeORM, RedisConfig, Throttler, and domain modules
│   └── modules/                # Core domain modules
│       ├── auth/               # User logins, profiles, and JWT Guards
│       ├── wallets/            # Balance modifications, transfers, PIN checks
│       ├── transactions/       # Transactions creation, query builder, state machine
│       ├── payments/           # Orders generation, HMAC signatures, webhooks, requests
│       ├── analytics/          # Daily aggregations & Redis caching logic
│       └── redis/              # Configures connection client wrapper
└── test/                       # E2E Integrations (e.g. p2p.e2e-spec.ts)
```

---

## ⚙️ Environment Variables

Configure the following variables in a `.env` file at the root of the `backend/` directory:

```env
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_db_password
DB_NAME=payment_gateway_db

# Redis Caching Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Cryptographic Keys
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h
WEBHOOK_SECRET=your_webhook_secret_key
```

---

## 🚀 Setup & Execution

### 1. Install Dependencies
```bash
npm install
```

### 2. Prepare Database
Ensure local PostgreSQL is running on port 5432, then initialize and seed:
```bash
# Create the database if it does not exist
node scripts/init-db.js

# Populate schema.sql and seed 10 demo users with full transaction history
node scripts/seed-demo.js
```

### 3. Run Server
```bash
# Development (with hot-reload)
npm run start:dev

# Production build and run
npm run build
npm run start:prod
```
The backend REST API will boot and listen on `http://localhost:3001/api`.

---

## 🧪 Tests Validation

Run the Jest integration test suite to verify concurrency controls, authentication, and state progression:

```bash
# Run End-To-End (E2E) integration tests
npm run test:e2e
```
