# Fintech System Functionality Catalog

This document details 100% of the functionalities, business workflows, and security protections implemented across the **Fintech Payment Gateway & Wallet Management System**.

---

## 📂 Index of Core Modules & Features

```
├── 1. Authentication, Sessions & Security (Auth)
├── 2. Wallet Ledger & Core Balance Control (Wallets)
├── 3. Peer-to-Peer (P2P) Transfers & Security (Wallets)
├── 4. Transaction Reversals & Rollbacks (Transactions)
├── 5. Gateway Checkout & Webhook Integration (Payments)
├── 6. Invoicing & Payment Billing Requests (Payments)
├── 7. Dispute Resolution State Machine (Disputes)
├── 8. Refund Claim Workflows (Refunds)
├── 9. Real-Time Notification Center (Notifications)
└── 10. Dashboard Analytics & Reports (Analytics, Reports)
```

---

## 🔒 1. Authentication, Sessions & Security

### 1.1 Candidate Registration
* **Public Self-Service Sign-up**: Standard sign-up flow strictly defaulting the user role to `user` (preventing privilege injection or role modification by the client).
* **Double Password Matching**: Enforces strict password matching validation between `password` and `confirmPassword` fields.
* **ASVS Password Strength Rules**:
  - Minimum of 12 characters.
  - Required mixed-case characters (uppercase + lowercase).
  - Required digit characters.
  - Required special character symbols.
  - Banned simple/common passwords and sequential dictionary check blocks.
* **CAPTCHA Integration**: Optional Cloudflare Turnstile bot verification check.

### 1.2 Administrative Account Spawning
* **Admin-Only Page**: Accessible to administrators via `/admin/create-admin`.
* **Admin-to-Admin Registration**: Allows existing administrators to spawn new administrator accounts securely (`POST /api/auth/create-admin`).
* **Audit Logging**: Logs the admin creator's UUID, target email, client IP, and success state.

### 1.3 Session & Session Rotation Security
* **Session Rotation**: The system rotates session IDs on successful login, mitigating session fixation exploits.
* **Secure Cookie Storage**: Implements HTTP-Only, SameSite=Strict, secure cookie storage.
* **Concurrent Device Invalidation**: Modifying a password (`POST /api/auth/change-password`) automatically invalidates all other active session keys for the user inside the Redis database.

### 1.4 CSRF Protection Middleware
* **Middleware Verification**: Injects NestJS global middleware to check `X-CSRF-Token` headers for all state-changing HTTP requests (POST, PATCH, DELETE, PUT).
* **Token Refreshing**: Fresh CSRF tokens can be requested at any time via `GET /api/auth/csrf`.

### 1.5 Brute-Force Bot Defenses
* **Login Failure Lockout**: Temporarily locks account logins for 15 minutes after 10 failed attempts. Logs a security alarm alert after 20 consecutive failures.
* **Dynamic CAPTCHA Requirements**: Turnstile protection becomes mandatory after 3 failed login attempts from a specific IP/email address.
* **Fallback Captcha Generation**: Generates distorted, random math/text SVG CAPTCHAs (`GET /api/auth/captcha`) with random lines, fonts, rotations, noise layers, and a 2-minute expiry TTL in Redis.

---

## 💳 2. Wallet Ledger & Core Balance Control

### 2.1 Concurrency-Safe Balance Checks
* **Pessimistic Row-Level Locking**: Updates or debits acquire a pessimistic write lock on the user's wallet row (`SELECT FOR UPDATE`) using NestJS TypeORM query runner.
* **Serializable Database Transactions**: Database balance updates run inside `SERIALIZABLE` transaction isolation blocks to prevent concurrent data anomalies and double-spend exploits.

### 2.2 Balance Query & Ledgers
* **Real-Time Balance Check**: Query current balance securely.
* **Audited Ledgers**: List historical transaction records showing amounts, types, reference IDs, and precise balance-after states.

### 2.3 Administrative Wallet Credits
* **Admin Manual Credit**: Admins can deposit funds directly into user wallets via `/api/wallet/credit`.
* **Compensating Audit Trail**: Logs credit actions to the audit ledger trail (`TransactionAudit`).

---

## 💸 3. Peer-to-Peer (P2P) Transfers & Security

### 3.1 Payee Verification
* **Payee Email Lookup**: Verifies recipient candidate email exists and returns their profile name prior to displaying PIN/amount entry screens.
* **Self-Transfer Protection**: Restricts users from sending funds to their own email address.

### 3.2 Deadlock Prevention (Lock Ordering)
* **Alphabetical Sorting**: Before acquiring database row locks on sender and receiver wallets, the system sorts user UUIDs alphabetically.
* **Sequential Locking**: Locks are acquired on the sorted UUID array in sequential order (`sortedUserIds[0]` then `sortedUserIds[1]`). This guarantees concurrent transfers between the same users will not lead to circular dependency deadlocks.

### 3.3 Transaction PIN Brute-Force Lockout
* **PIN Setup Flow**: Users configure a secure 6-digit transaction PIN prior to their first transfer.
* **Bcrypt Hash Checks**: PINs are hashed using Bcrypt (10 rounds) and validated on each transfer.
* **Brute-Force Lock**: 5 consecutive incorrect PIN entries triggers a **15-minute transfer lockout**.
* **Lock Reset**: Modifying or resetting the PIN clears lockout flags and failed attempt counts.

### 3.4 Velocity Spend Limits
* **Daily Spend Velocity**: Standard daily spending ceiling set to ₹50,000.00.
* **Redis sliding spend window**: Outgoing transfers are checked against a Redis sliding window to compute daily spend velocity.
* **Database Fallback**: Aggregates outgoing transaction rows from PostgreSQL to calculate daily spends if the Redis server goes offline.
* **Limit Customization**: Admins can modify individual candidates' daily limits.

### 3.5 Simulation Mode Controls (Always-On 80% Success Rate)
* **Always-On Random Simulation**: In non-test environments (`NODE_ENV !== 'test'`), transactions have a random 20% chance of failing or entering processing states when no manual overrides are active.
* **Simulate Failed Payment Override**: Toggle switch on the UI to force immediate transaction failure (creates `FAILED` transaction status rows, bypasses actual wallet movements).
* **Simulate Processing State Override**: Toggle switch to force immediate processing status. Places the transfer in the admin approval queue.
* **Notification Check**: Notification services inspect the actual transaction status to avoid sending success alerts on simulated failures.

---

## 🔄 4. Transaction Reversals & Rollbacks

### 4.1 Reversal Request Submission
* **Reversal Request**: Users can submit rollback/reversal requests for any successful P2P transfer directly from their transaction log view.
* **Reason Logging**: Allows users to specify reversal reasons. Sets transaction status to `REVERSAL_PENDING`.

### 4.2 Reversal Decision Pipeline
* **Reversal Approval (Admin)**: Admin approves the request, which:
  - Validates recipient wallet has sufficient funds.
  - Automatically executes compensating ledger entries (debits recipient wallet and credits sender wallet).
  - Updates transaction status to `REVERSED`.
* **Reversal Rejection (Admin)**: Admin rejects the request. Restores status to `SUCCESS` and records admin audit trails.

---

## 💰 5. Gateway Checkout & Webhook Integration

### 5.1 Payment Initiation
* **Checkout Initiation**: Generates a checkout payment order (`POST /api/payments/initiate`) in `INITIATED` status.
* **Idempotency Key Verification**: Blocks double checkout requests by verifying unique client-provided `requestId` values.

### 5.2 Payment Verification
* **Signature Simulation**: Client portal initiates checkout signature checks to simulate successful checkout callbacks.
* **Timed Gateway Simulation**: Webhooks are scheduled to resolve with standard latency delay.

### 5.3 Timing-Safe Webhooks
* **HMAC Signature Checking**: Outgoing/incoming gateway webhooks verify SHA-256 HMAC signatures computed from request payloads and the shared `WEBHOOK_SECRET`.
* **Timing Attack Prevention**: Employs `crypto.timingSafeEqual` to verify signatures, blocking side-channel timing attacks.

---

## 📝 6. Invoicing & Payment Billing Requests

### 6.1 Billing Request Creation
* **Payment Request**: Users can request money from other candidates by entering their email address and billing amount. Creates `PENDING` request logs.

### 6.2 Actionable Inbox
* **Received Requests Tab**: Displays a log of received billing requests.
* **Pay Billing Invoice**: Users can approve and pay received billing invoices by inputting their 6-digit transaction PIN.
* **Decline Billing Invoice**: Users can reject billing invoices. Status transitions to `REJECTED`.

### 6.3 Sent Request Logs
* **Sent Log**: Tracks states of sent billing requests (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`).

---

## ⚖️ 7. Dispute Resolution State Machine

### 7.1 Dispute Submission
* **File Dispute Ticket**: Candidates can submit dispute claims against any debit/transfer transaction.
* **Single Dispute Constraint**: Employs a composite index `idx_dispute_txn_user` to prevent submitting multiple dispute claims for a single transaction.

### 7.2 Dispute FSM Progression
* **Finite State Machine Validations**: Restricts dispute tickets through strict FSM transitions:
  `OPEN -> UNDER_REVIEW -> RESOLVED` or `OPEN -> UNDER_REVIEW -> REJECTED`.
* **Admin Processing notes**: Admins can add notes while transitioning dispute states.

---

## 🛡️ 8. Refund Claim Workflows

### 8.1 Refund Request
* **Request Refund**: Users can file refund claims for any debit transaction. Sets state to `PENDING` and locks/restricts subsequent claims.

### 8.2 Refund Approvals & Comp-ledger entries
* **Refund Approval (Admin)**: Admins review claims. Approving a claim:
  - Changes status to `APPROVED`.
  - Credits the user's wallet.
  - Transition status to `REFUNDED` and writes to the transaction audit logs.
* **Refund Rejection (Admin)**: Rejects claim and marks it `REJECTED`.

---

## 🔔 9. Real-Time Notification Center

### 9.1 Redis unread notification caching
* **Badge tracking**: Tracks unread notification count inside Redis using `unread:{userId}` keys.
* **$O(1)$ fast retrieval**: Badge counts are returned instantly in constant time.
* **Eviction/Decrement**: Marking a notification as read decrements the Redis counter.

### 9.2 Notifications sliding drawer
* **Bell drawer layout**: Header-bound notifications bell drawer displaying notification logs.
* **Mark single read**: Marking a notification as read updates its DB status and decrements the Redis unread cache.
* **Mark all read**: Marks all unread notifications as read and resets the Redis cache to `0`.

---

## 📊 10. Dashboard Analytics & Reports

### 10.1 Caching Analytics Graphs
* **Recharts Dashboard**: Renders interactive graphs of 14-day transaction trend stats.
* **Redis aggregation caching**: Stats are aggregated and cached in Redis.
* **Agg-Cache eviction**: Creating a new transaction automatically invalidates/evicts the Redis analytics cache.

### 10.2 CSV Data Export
* **CSV Export**: Downloads a filtered list of transaction logs in CSV format. Supports filters for date range (`startDate`, `endDate`), transaction type, and status.
