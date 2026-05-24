export type AppView = 'landing' | 'wizard' | 'empty-dashboard' | 'dashboard' | 'unlock' | 'settings' | 'budget' | 'category-details' | 'expected-budget' | 'reserves-flow' | 'reserves-map';

export interface Transaction {
  id: string;
  booking_date: number; // Unix timestamp in ms
  amount: number;       // Integer in lowest denomination (e.g., cents, Rappen)
  currency: string;     // ISO 4217 code (e.g., 'USD', 'CHF', 'EUR')
  counterparty: string; // Cleaned merchant or counterparty name
  category_id: string | null;
  type: 'expense' | 'income';
  raw_data?: string;    // Raw, unparsed CSV bank statement row
  recurrence?: {
    interval: number;
    unit: 'days' | 'weeks' | 'months' | 'years';
    last_processed_date?: number;
  };
  recurrence_parent_id?: string;
  recurrence_instance_date?: number;
}

export interface Category {
  id: string;
  label: string;
  icon: string;         // Lucide icon identifier string
  color: string;        // Thematic Tailwind color prefix (e.g., 'earth-clay')
  budget: number;       // Monthly budget limit in cents
}

export interface AppState {
  view: AppView;
  wizardStep: number;
  hasData: boolean;
  isManualExpenseOpen: boolean;
  isImportModalOpen: boolean;
  activeCategory?: string;
}

export interface CSVMappingProfile {
  id: string;
  name: string;
  headers: string[]; // List of all headers in the CSV to match against
  delimiter: string;
  dateHeader: string;
  counterpartyHeader: string;
  amountType: 'single' | 'split'; // Single column (+/-) or separate credit/debit columns
  amountHeader?: string; // For single column layout
  creditHeader?: string; // For split column layout
  debitHeader?: string;  // For split column layout
}

