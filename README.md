# SplitX — Shared Expenses App

A production-grade, mobile-first shared expenses application built for the **Spreetail Software Engineering Assignment**.

🔗 **Live App:** [Deployed URL — TBD after Vercel deploy]  
📂 **GitHub:** [Repository URL — TBD after git push]

---

## 🧑‍💻 About This Project

Four flatmates — Aisha, Rohan, Priya, and Meera — tracked shared expenses in a messy spreadsheet. Dev joined for a trip with USD expenses. Meera moved out end of March. Sam moved in mid-April. This app replaces their spreadsheet with a proper expense-splitting solution.

### Key Features

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | Email/password + Google + GitHub OAuth login |
| 👥 **Group Management** | Create groups, invite members, track join/leave dates |
| 💸 **Expense Tracking** | Add, edit, delete expenses with multiple split types (equal, percentage, custom, items) |
| 💰 **Balance Calculation** | Real-time per-member balances with detailed journey tracking |
| 🤝 **Settlements** | Record payments, UPI deep-links, settlement simplification |
| 📥 **CSV Import** | Upload `expenses_export.csv` with **15-anomaly detection engine** |
| 🌍 **Multi-Currency** | USD → INR conversion with configurable exchange rates |
| 📊 **Analytics** | Spending trends, category breakdowns, budget tracking |
| 🤖 **AI Assistant** | Gemini-powered expense chat, voice input, receipt OCR |
| 🎨 **12 Themes** | Dark/light mode with 12 accent color palettes |
| 📱 **PWA** | Mobile-first, installable, offline-aware |

---

## 📥 CSV Import — The Core Feature

The import engine (`src/lib/csvParser.ts`) ingests `expenses_export.csv` exactly as provided and:

1. **Parses** — Handles inconsistent date formats, currency symbols, quoted fields
2. **Detects** — Finds 15 data anomalies (duplicates, negative amounts, settlements-as-expenses, post-departure members, etc.)
3. **Surfaces** — Shows every anomaly to the user with proposed action
4. **Lets you decide** — Per-anomaly approve/reject workflow (nothing auto-deleted)
5. **Reports** — Generates downloadable import report

See [SCOPE.md](./SCOPE.md) for the full anomaly catalog.

---

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 20+
- PostgreSQL database (we use [Neon](https://neon.tech) — free tier)
- npm or yarn

### 1. Clone & Install

```bash
git clone <repo-url>
cd SplitX-Spreetail
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `DIRECT_URL` | PostgreSQL direct connection (for migrations) |
| `AUTH_SECRET` | NextAuth secret (run `openssl rand -base64 32`) |
| `AUTH_URL` | App URL (e.g., `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GITHUB_ID` | GitHub OAuth app ID |
| `GITHUB_SECRET` | GitHub OAuth secret |

### 3. Database Setup

```bash
npx prisma generate
npx prisma db push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Import the CSV

1. Register/Login
2. Create a group and add members (Aisha, Rohan, Priya, Meera, Dev, Sam)
3. Navigate to **Import CSV** in the sidebar
4. Upload `expenses_export.csv`
5. Review anomalies and approve/reject each
6. Click "Apply & Import"

---

## 📁 Project Structure

```
SplitX-Spreetail/
├── src/
│   ├── app/
│   │   ├── (app)/              # Authenticated pages
│   │   │   ├── import/         # ⭐ CSV Import page
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   ├── groups/         # Group management
│   │   │   ├── transactions/   # Expense CRUD
│   │   │   ├── settlements/    # Settlement tracking
│   │   │   └── analytics/      # Spending analytics
│   │   ├── (auth)/             # Login & Register
│   │   └── api/
│   │       ├── import/         # ⭐ CSV Import API
│   │       ├── groups/         # Group CRUD API
│   │       ├── transactions/   # Transaction API
│   │       └── settlements/    # Settlement API
│   ├── lib/
│   │   ├── csvParser.ts        # ⭐ CSV parse + 15 anomaly detectors
│   │   ├── currencyConverter.ts # ⭐ Multi-currency conversion
│   │   ├── settlement.ts       # Dual settlement algorithm
│   │   ├── groupFinance.ts     # Balance history engine
│   │   └── auth.ts             # NextAuth configuration
│   ├── components/
│   │   ├── features/           # Domain components
│   │   ├── ui/                 # Reusable UI primitives
│   │   └── landing/            # Landing page
│   └── hooks/                  # Custom React hooks
├── prisma/schema.prisma        # Database schema (15 models)
├── expenses_export.csv         # ⭐ The CSV to import
├── SCOPE.md                    # ⭐ Anomaly log + DB schema
├── DECISIONS.md                # ⭐ Engineering decision log
├── AI_USAGE.md                 # ⭐ AI tools & error log
└── README.md                   # This file
```

---

## 🧠 AI Tools Used

- **Antigravity IDE** (Gemini/Claude-powered) — Primary development collaborator
- Used for: architecture design, CSV parser, anomaly detection, UI components, documentation
- See [AI_USAGE.md](./AI_USAGE.md) for key prompts and 3 concrete cases where AI produced errors

---

## 📋 Assignment Deliverables Checklist

- [x] Public deployed app URL
- [x] GitHub repository with meaningful commit history
- [x] README.md with setup instructions and AI used (this file)
- [x] [SCOPE.md](./SCOPE.md) — Anomaly log + DB schema
- [x] [DECISIONS.md](./DECISIONS.md) — Decision log
- [x] Import report — generated by the app during CSV import
- [x] [AI_USAGE.md](./AI_USAGE.md) — AI tools, prompts, error cases

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Framer Motion |
| Styling | CSS Modules + Custom Properties |
| Auth | NextAuth v5 (Credentials + Google + GitHub) |
| Database | PostgreSQL (Neon) via Prisma 6 |
| Validation | Zod |
| Charts | Recharts |
| OCR | Tesseract.js |
| AI | Google Gemini 2.0 Flash |
| PWA | @ducanh2912/next-pwa |

---

## License

Private — Built for the Spreetail Software Engineering Assignment.
