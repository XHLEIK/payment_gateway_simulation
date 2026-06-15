# Regilly Assignment: Payment Gateway Frontend (Next.js)

This is the Next.js frontend client portal for the **Payment Gateway & Wallet Management System**. It provides user interfaces for candidate wallets, transactions, peer-to-peer transfers, billing requests, and administrative controls.

---

## 🚀 Key Features

- **Rich Glassmorphic Design**: A premium dark-mode theme utilizing custom Vanilla CSS components, glowing gradients, hover scaling, and clean layouts.
- **In-App Notification Center**: A header-bound notification bell with an active unread badge and a sliding glassmorphic drawer containing deep links, unread states, and mark-all-read triggers.
- **Transaction Rollback & Disputes**: Interactive rollback (compensating transaction request) trigger and dispute submission modal for all debit transactions.
- **Payment Simulation Toggles**: Interactive sliding toggles in the wallet transfer view to simulate a processing or failed payment state.
- **Admin Command Center**: Complete dashboard for administrators to approve/reject reversals, transition dispute workflows, manage pending simulation queues, and adjust candidate velocity spend limits.
- **Velocity Spend limits Gauges**: Circular or linear progress indicators displaying spend allowances used today against maximum candidate limits.
- **Dynamic Dashboard Metrics**: Displays current balance, transaction rates, and success rates. Includes interactive charts powered by **Recharts** to plot transaction volume trends.
- **Interactive Wallet Controls**: Form fields to load money, verify credit cards, and execute peer-to-peer money transfers using transaction PIN locks.
- **Sortable & Paginated Log Table**: Lists historical transactions with dynamic columns header sorting (`Date`, `Reference ID`, `Type`, `Amount`, `Status`).

---

## 🛠️ Tech Stack

- **Framework**: Next.js v16.x (React 19) App Router
- **State Management & Querying**: TanStack React Query v5 (for cache synchronization and stale-while-revalidate data fetching)
- **Data Visualization**: Recharts v3
- **Icons**: Lucide React
- **Styling**: Tailwind CSS v4 & Vanilla CSS variables
- **Security**: Cloudflare Turnstile widget integration, cookie-based sessions, CSRF headers mapping on API client (`withCredentials: true`)

---

## 📂 Folder Layout

```
payment_gateway/
├── public/                     # Static assets (images, icons)
└── src/
    ├── services/
    │   └── api.ts              # Central Axios client (injects CSRF tokens, withCredentials enabled)
    ├── components/
    │   ├── layout-shell.tsx    # Global sidebar shell (separates admin/candidate views)
    │   └── providers.tsx       # Binds React Query, manages authentication state, cookie-session lifecycle & CSRF token sync
    └── app/                    # Next.js App Router Page Views
        ├── layout.tsx          # Binds core providers, viewport settings, and fonts
        ├── page.tsx            # Root redirect logic
        ├── login/              # Sign-in panel with brute-force protection & Turnstile CAPTCHA widget
        ├── dashboard/          # Analytics dashboards for candidates & admins
        ├── wallet/             # Balance actions (load, transfer, requests)
        ├── transactions/       # Sortable and paginated logs list
        └── admin/              # Global analytics & refund management
```

---

## ⚙️ Environment Configuration

By default, the frontend connects to the backend API at `http://localhost:3001/api`. Customize this and set up your public Cloudflare Turnstile Site Key by creating a `.env.local` file inside the `payment_gateway/` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

---

## 🚀 Setup & Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser to access the portal.

### 3. Build for Production
```bash
npm run build
npm run start
```
