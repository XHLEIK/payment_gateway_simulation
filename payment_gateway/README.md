# Regilly Assignment: Payment Gateway Frontend (Next.js)

This is the Next.js frontend client portal for the **Payment Gateway & Wallet Management System**. It provides user interfaces for candidate wallets, transactions, peer-to-peer transfers, billing requests, and administrative controls.

---

## 🚀 Key Features

- **Rich Glassmorphic Design**: A premium dark-mode theme utilizing custom Vanilla CSS components, glowing gradients, hover scaling, and clean layouts.
- **Dynamic Dashboard Metrics**: Displays current balance, transaction rates, and success rates. Includes interactive charts powered by **Recharts** to plot transaction volume trends.
- **Interactive Wallet Controls**: Form fields to load money, verify credit cards, and execute peer-to-peer money transfers using transaction PIN locks.
- **Sortable & Paginated Log Table**: Lists historical transactions with dynamic columns header sorting (`Date`, `Reference ID`, `Type`, `Amount`, `Status`).
- **Administrative Portal**: Admin panel displaying global metrics, ledger audit logs, and approval buttons to trigger refunds for candidate debits.

---

## 🛠️ Tech Stack

- **Framework**: Next.js v16.x (React 19) App Router
- **State Management & Querying**: TanStack React Query v5 (for cache synchronization and stale-while-revalidate data fetching)
- **Data Visualization**: Recharts v3
- **Icons**: Lucide React
- **Styling**: Tailwind CSS v4 & Vanilla CSS variables

---

## 📂 Folder Layout

```
payment_gateway/
├── public/                     # Static assets (images, icons)
└── src/
    ├── services/
    │   └── api.ts              # Central API client (methods for JWT tokens, wallets, payments)
    ├── components/
    │   ├── layout-shell.tsx    # Global sidebar shell (separates admin/candidate views)
    │   ├── providers.tsx       # Binds React Query client context
    │   └── ui/                 # Shared UI elements
    └── app/                    # Next.js App Router Page Views
        ├── layout.tsx          # Binds core providers, viewport settings, and fonts
        ├── page.tsx            # Root redirect logic
        ├── login/              # Sign-in panel with credentials verification
        ├── dashboard/          # Analytics dashboards for candidates & admins
        ├── wallet/             # Balance actions (load, transfer, requests)
        ├── transactions/       # Sortable and paginated logs list
        └── admin/              # Global analytics & refund management
```

---

## ⚙️ Environment Configuration

By default, the frontend connects to the backend API at `http://localhost:3001/api`. You can customize this by creating a `.env.local` file inside the `payment_gateway/` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
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
