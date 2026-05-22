export type AppView = 'landing' | 'wizard' | 'empty-dashboard' | 'dashboard' | 'unlock' | 'settings' | 'budget' | 'category-details';

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
  };
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
