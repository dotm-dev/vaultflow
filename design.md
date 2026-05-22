# Product Design Specification: Local-First Personal Finance Tool
**Target Platform / Framework Setup:** Designed for agentic AI tools (e.g., Google Stitch, Antigravity) to bootstrap a frontend application leveraging local storage (IndexedDB).

## 1. Core Objective & Product Identity
A privacy-first, fully localized personal finance application for individuals and families. The tool visualizes financial health, categorizes expenses, plans budgets, and forecasts tendencies. 

**Key Directives:**
* **Privacy-Absolute:** All data processing, storage, and algorithm execution happens locally on the user's hardware. 
* **Visual-First:** Text must be minimized. The interface relies entirely on universally understood iconography, vibrant color coding, and interactive charts.
* **Professional yet Engaging:** Lightweight, highly responsive, colorful, and utilizing gamification to encourage healthy financial habits.

## 2. Visual Direction & Design System
* **Typography & Text:** Minimal. Text should only appear in tooltips, hover states, or hidden slide-out panels. 
* **Color Palette:** High-contrast and vibrant. Distinct thematic colors for core concepts: Income (e.g., vibrant green/teal), Fixed Expenses (e.g., deep blue/purple), Discretionary Spending (e.g., warm orange/coral), and Savings.
* **Iconography:** The primary method of navigation and interaction. SVGs with smooth hover animations. 
* **Layout:** Dashboard-centric, utilizing floating card or isometric styles to separate distinct widgets.

## 3. Data Architecture (Strict Client-Side)
The application avoids complex, highly-relational structures in favor of a hybrid approach optimized for client-side speed and CSV/bank-statement compatibility.

**Core Transaction Schema (`Transaction` interface):**
* `id`: UUID (String)
* `booking_date`: Unix Timestamp (Integer, for fast sorting)
* `amount`: Lowest currency denomination (Integer)
* `currency`: ISO 4217 code (String, e.g., 'CHF', 'EUR')
* `counterparty`: Cleaned merchant/sender string
* `category_id`: Foreign key to category definitions (Nullable)
* `raw_data`: JSON stash containing the unparsed, original bank statement row.

## 4. User Journeys & UI Views

### View A: The Landing Page ("Storefront")
* **Hero Section:** A bold, stylized, text-free graphic of the dashboard interface. 
* **Primary CTA Button:** A large, inviting icon-button (e.g., a "Power" or "Key" icon) to "Initialize Setup".
* **Value Props:** Three distinct visual columns below the hero containing only icons:
    1.  *Lock:* Symbolizing local-only encryption.
    2.  *Brain/Lightning:* Symbolizing smart categorization.
    3.  *Trophy/Chart:* Symbolizing goals and gamification.

### View B: The Setup Wizard (Modal Flow)
* **Step 1 (Encryption):** A single input field with a padlock icon to set a master password (generates local encryption keys).
* **Step 2 (Cloud Backup):** A Google Drive icon and a toggle switch. If toggled, trigger OAuth. Icon-tooltip explains: "Data is encrypted before upload."
* **Step 3 (Import):** A massive drag-and-drop target zone for CSV/PDF files. Includes a smaller "Skip" icon (forward arrow) to bypass.
* **AI Consent Toggle:** A toggle labeled with a "Magic Wand" icon. Tooltip explicitly states: "Only merchant names are sent securely to an AI to predict categories. Dates and amounts stay on your device."
* **Loading State:** A smooth progress bar with cycling, friendly status messages (e.g., "Forging local vault...", "Analyzing patterns...") to provide the "labor illusion".

### View C: The "Empty State" Dashboard (Action Grid)
* Displayed if the user has no transactions yet.
* **Layout:** A centralized grid of large, stylized tiles.
* **Primary Tile:** Centered or top-left. Massive "File Upload" document icon representing "Import First Report".
* **Secondary Tiles:** * "+" Icon (Add Manual Expense).
    * "Bullseye" Target Icon (Set First Budget).
    * "Cloud" Icon (Configure Backup, if skipped).
* **Gamification Tie-in:** Completing these tile actions triggers a satisfying visual checkmark or badge animation, initiating the user's "Health Score".

### View D: Manual Expense Form (Normalized Input)
* **Trigger:** Clicking the "+" icon tile.
* **Type Toggle:** A large switch at the top with "+" (Income) and "-" (Expense).
* **Amount Input:** Dominates the view. Massive numerical font, accompanied only by the currency symbol. No label.
* **Date Selector:** Defaults to today. Clicking the "Calendar" icon opens a visual date-picker.
* **Merchant:** A single-line input next to a "Storefront" or "Tag" icon.
* **Categorization:** A responsive grid of large category icons. Categorizing is done via a single tap on the desired icon, avoiding standard dropdown menus.
* **Save Action:** A prominent "Checkmark" button at the bottom. Form validation is purely visual (e.g., shaking the empty amount field if the user tries to save).

## 5. Gamification Layer
* **Visual Streaks:** Small progress rings around budget category icons that fill up as the month progresses. 
* **Financial Health Score:** A dynamic, visual metric (e.g., a growing plant icon or a dynamic shield) that improves as the user categorizes loose transactions, stays under budget, and imports monthly data consistently.
