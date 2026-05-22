<div align="center">

# 🔐 VaultFlow

**Privacy-first, offline personal finance manager**

A fully client-side budgeting application that keeps your financial data encrypted and under your control. No accounts, no telemetry, no servers storing your data — just your browser.

</div>

---

## Features

- **🛡️ End-to-end encryption** — Master password derives AES-GCM 256-bit keys via the native Web Crypto API. Data is encrypted at rest in IndexedDB with unique IVs.
- **📊 Visual dashboard** — Spend velocity trend charts (daily, weekly, monthly), category breakdowns with budget progress rings, and net reserves overview.
- **📁 CSV import** — Drag-and-drop bank statement CSVs with automatic column detection and AI-powered merchant categorization (only merchant names are sent, never amounts or dates).
- **✏️ Manual records** — Quick-add expenses and income with category tagging and optional recurring schedules.
- **☁️ Google Drive sync** — Optional encrypted cloud backup to your private Google Drive. Switch between multiple vault ledgers across devices.
- **🎨 Theming** — Light, dark, and system-follow modes with smooth animated transitions.
- **🌍 Regional settings** — Configurable currency, thousands separator, date format, timezone (affects all charts, filters, and displays), and language selector.
- **📈 Category deep-dives** — Per-category transaction history with 6-month trend charts, time/amount/store filters, and paginated transaction lists.
- **💰 Budget management** — Set monthly budget limits per category with visual progress tracking and overspend alerts.
- **🔄 Auto-sync** — Configurable periodic background sync (30s to 10min intervals) with local caching toggle for shared devices.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 |
| Animations | Motion (Framer Motion) |
| Charts | Recharts |
| Icons | Lucide React |
| Storage | IndexedDB (via `idb`) |
| Encryption | Web Crypto API (AES-GCM) |
| AI Categorization | Google Gemini API |
| Cloud Backup | Google Drive API (OAuth 2.0) |
| Backend | Express (minimal proxy for AI calls) |

## Project Structure

```
vaultflow/
├── index.html                 # Entry point
├── server.ts                  # Express backend (Gemini API proxy)
├── vite.config.ts             # Vite configuration
├── src/
│   ├── main.tsx               # React mount
│   ├── App.tsx                # Root component, state management, routing
│   ├── types.ts               # TypeScript interfaces
│   ├── index.css              # Global styles & design tokens
│   ├── components/
│   │   ├── LandingView.tsx    # Welcome / storefront page
│   │   ├── WizardView.tsx     # Setup wizard (password, cloud, import)
│   │   ├── UnlockView.tsx     # Vault unlock screen
│   │   ├── DashboardView.tsx  # Main dashboard with charts
│   │   ├── EmptyDashboardView.tsx  # First-run action grid
│   │   ├── CategoryDetailsView.tsx # Per-category drilldown
│   │   ├── BudgetView.tsx     # Budget limits management
│   │   ├── SettingsView.tsx   # Preferences, cloud, security
│   │   ├── ManualExpenseModal.tsx  # Add expense/income
│   │   └── ImportModal.tsx    # CSV import flow
│   └── lib/
│       ├── crypto.ts          # AES-GCM encryption utilities
│       ├── db.ts              # IndexedDB operations
│       ├── csv.ts             # CSV parsing & column detection
│       ├── categories.ts      # Category definitions & icons
│       ├── formatters.ts      # Currency, date, time formatting
│       ├── googleDriveSync.ts # Google Drive sync engine
│       └── utils.ts           # Shared helpers
└── .env.example               # Environment variable template
```

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Gemini API key** (for AI-powered categorization) — [Get one here](https://aistudio.google.com/apikey)
- *(Optional)* A **Google OAuth Client ID** (for cloud backup) — [Create one here](https://console.cloud.google.com/apis/credentials)

## Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/<your-username>/vaultflow.git
   cd vaultflow
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and fill in your keys:

   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"  # optional
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

   The app will be available at **http://localhost:3000**.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server on port 3000 |
| `npm run backend` | Start only the Express backend |
| `npm run build` | Production build (Vite + esbuild) |
| `npm run start` | Run the production server |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | TypeScript type-checking (`tsc --noEmit`) |
| `npm run clean` | Remove build artifacts |

## Privacy Manifest

- **Zero tracking** — No analytics, telemetry, or third-party tracking scripts.
- **Zero server storage** — All financial data lives in your browser's IndexedDB.
- **Encrypted backups** — Cloud sync encrypts data locally before uploading to your private Google Drive.
- **Minimal AI exposure** — Only merchant names are sent for categorization. Dates, amounts, and balances never leave your device.

## License

This project is provided as-is for personal use.
