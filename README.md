<div align="center">

# 🔐 VaultFlow

**Privacy-first, offline-native personal finance manager**

A fully client-side budgeting application that keeps your financial data encrypted and under your control. No accounts, no telemetry, no servers storing your data — just your browser.

<br />

[![License: Custom Non-Commercial](https://img.shields.io/badge/License-Non--Commercial-orange.svg?style=flat-square)](LICENSE)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=61DAFB&style=flat-square)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38BDF8.svg?logo=tailwindcss&style=flat-square)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript&style=flat-square)](https://www.typescriptlang.org)

<br />

<img src="https://github-readme-stats.vercel.app/api/pin/?username=dotm-dev&repo=vaultflow&bg_color=1A2521&title_color=7BA05B&text_color=A4B5AC&icon_color=5C7C8A&border_color=22302A&show_owner=true" alt="VaultFlow Repository Stats" />
<img src="https://github-readme-stats.vercel.app/api/top-langs/?username=dotm-dev&layout=compact&bg_color=1A2521&title_color=7BA05B&text_color=A4B5AC&icon_color=5C7C8A&border_color=22302A&hide=html,css" alt="VaultFlow Top Languages" />

</div>

---

## 🍃 The Off-Grid Philosophy (Why VaultFlow?)

Unlike traditional finance applications that pull your credentials into central databases or query open banking APIs through insecure aggregators, VaultFlow operates under an **absolute client-side containment protocol**:

*   **Zero Accounts**: No registration, email logins, or token hashes. Your passphrase acts as the sole cryptographic anchor.
*   **Local Cryptographic Envelopes**: Financial records are encrypted directly inside the browser using AES-GCM 256-bit. Plaintext never meets disk.
*   **Visual Data Scrubbing**: Machine-learning classifications (via the Gemini API) are sandboxed. The application only shares merchant strings for categorization — dates, transaction balances, and totals never exit your machine.
*   **Sovereign Cloud Sync**: Backups bypass third-party servers entirely, syncing directly from your local browser database to your personal Google Drive storage space.

---

## 🎛️ Key Feature Modules

### 1. 🔀 Reserves Distribution Map (Interactive Sankey)
*   **Proportional S-Curve Flows**: Visually traces cash flow through 5 distinct nodes: Inflows ➔ Net Reserves Pool ➔ Pillars (Fixed, Agile, Retained) ➔ Expense Categories ➔ Top Merchants.
*   **Session-based Draggable Nodes**: Adjust coordinates vertically in real-time. Link curves and connection bounds automatically compute positions to match node heights perfectly.
*   **Themed Linear Gradients**: Connections glow dynamically as they morph from the source HSL colors to the target HSL color profiles.

### 2. 🛠️ Dynamic CSV Column Mapper
*   **Zero-Config Headers Parser**: Drag any bank CSV statement onto the window; the mapper samples columns, detects delimiters, and guesses columns (Date, Counterparty, and Amount) automatically.
*   **Single & Split Column Layouts**: Standardizes credit/debit split formats or positive/negative transaction amounts into unified records.
*   **Custom Mapping Profiles**: Save configurations (e.g. *"My Swiss Bank Statement"*) to allow fully automated parsing on future uploads.

### 3. 📈 Runway Metrics & Detailed Reserves
*   **Runway Predictor**: Real-time monthly burn rate and runway survival estimators (e.g. *"Runway: 12.4 Months"*).
*   **Filters Workbench**: Find and configure transactions using date presets (1M, 3M, 6M, 1Y, All Time), pillar categories, amounts, or merchant tags.
*   **Recurring transactions Scheduler**: Set up calendar-accurate repeating income/expense templates with custom timeframes.

---

## 🔬 Tech Stack

| Layer | Technologies | Role / Feature |
|---|---|---|
| **Core Client** | React 19, TypeScript, Vite | Application structure & dev server compilation |
| **Styling** | Tailwind CSS 4, CSS variables | Custom "Zen Garden" dark/light aesthetics |
| **Motion** | Framer Motion (`motion/react`) | Fluid transitions, page swipes & modal overlays |
| **Database** | IndexedDB (via `idb` wrapper) | High-performance offline browser object storage |
| **Crypto** | Web Cryptography API | Passcode PBKDF2 salt derivation & AES-GCM 256 |
| **AI Layer** | Google Gemini API | Automated merchant counterparty categorization |
| **Cloud Bridge** | Google Drive API (OAuth 2.0) | Direct browser-to-cloud backup sync |

---

## 📂 Project Architecture

<details>
<summary><b>Click to expand file structure details</b></summary>

```
vaultflow/
├── index.html                 # Main HTML entry point
├── server.ts                  # Node/Express Gemini Proxy Server
├── vite.config.ts             # Vite configuration
├── src/
│   ├── main.tsx               # React application mounting
│   ├── App.tsx                # View routing, overall state, and background loops
│   ├── types.ts               # Core types & mappings
│   ├── index.css              # Global styles, variables, and Zen Garden tokens
│   ├── components/
│   │   ├── LandingView.tsx    # Welcome page
│   │   ├── WizardView.tsx     # Cryptographic configuration wizard
│   │   ├── UnlockView.tsx     # Passcode entry unlock screen
│   │   ├── DashboardView.tsx  # Central console & charts
│   │   ├── EmptyDashboardView.tsx # Onboarding options grid
│   │   ├── CategoryDetailsView.tsx # Spend trends per-category details
│   │   ├── BudgetView.tsx     # Limit configurations
│   │   ├── SettingsView.tsx   # Local database administration & Sync
│   │   ├── ManualExpenseModal.tsx # Income / Expense addition modal
│   │   ├── ReservesFlowView.tsx # Runway & detailed analytics
│   │   ├── ReservesMapView.tsx # Interactive cash flow map (Sankey)
│   │   └── ImportModal.tsx    # CSV mapper & statement importer
│   └── lib/
│       ├── crypto.ts          # AES-GCM encryption & PBKDF2 helpers
│       ├── db.ts              # IndexedDB wrapper operations
│       ├── csv.ts             # CSV column mapping and guessing algorithms
│       ├── categories.ts      # Categories lists, colors, and icons
│       ├── formatters.ts      # Multi-currency & timezone formatters
│       ├── googleDriveSync.ts # Google Drive file sync management
│       └── utils.ts           # CSS merging utility
```
</details>

---

## 🚀 Getting Started

### 📋 Prerequisites
*   **Node.js** ≥ 18
*   **npm** ≥ 9
*   A **Gemini API Key** for automatic merchant categorizations — [Get your key here](https://aistudio.google.com/apikey)
*   *(Optional)* A **Google OAuth Client ID** for Drive Sync backups — [Create Client ID here](https://console.cloud.google.com/apis/credentials)

### 💻 Quick Start Setup
1.  **Clone the repository**
    ```bash
    git clone https://github.com/dotm-dev/vaultflow.git
    cd vaultflow
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Prepare local configuration**
    ```bash
    cp .env.example .env.local
    ```
    Open `.env.local` and fill in your keys:
    ```env
    GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
    VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" # (Optional)
    ```

4.  **Run Development Server**
    ```bash
    npm run dev
    ```
    The application will launch on **http://localhost:3000**.

---

## 📋 Available Developer Scripts

| Script | Description |
|---|---|
| `npm run dev` | Boots Vite development server + local Express API proxy |
| `npm run backend` | Runs only the Node Express Gemini proxy server |
| `npm run build` | Bundles both client-side static assets and Node server script |
| `npm run start` | Boots production Node backend server |
| `npm run preview` | Runs a local web server to preview production static build |
| `npm run lint` | Runs TypeScript compilation checks (`tsc --noEmit`) |
| `npm run clean` | Removes compiled build outputs |

---

## 🔒 Privacy & Security Manifesto

*   **100% Off-Chain**: The application functions completely offline. No tracking telemetry, cookies, or remote analytics packages are embedded.
*   **Ephemeral Cryptographic Session Keys**: Ephemeral AES keys are stored only in memory. Locking your session purges all decrypters instantly.
*   **Local Scrubbing**: Only merchant counterparty names are sent to Google's Gemini models for classification tags. Balances, transaction volumes, date timestamps, and ledger names remain locked on your device.

---

## ⚖️ License

This project is licensed under a custom Non-Commercial License. See the [LICENSE](LICENSE) file for more details.
