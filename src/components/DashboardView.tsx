import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, LogOut, ArrowUp, ArrowDown, Plus, Download, Sun, Moon, Utensils, Car, Zap, ShoppingBag, Gamepad2, Home, Heart, MoreHorizontal as OtherIcon, FileText, Shield, Lock, Code, X, CloudUpload, Edit2, DollarSign, Menu } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { cn } from '@/src/lib/utils';
import { Transaction } from '../types';
import { getConfig } from '../lib/db';
import { useCategories, ICON_MAP } from '../lib/categories';
import { formatAmount, formatDate, getTimezoneDateParts, getTimestampFromParts } from '../lib/formatters';

interface DashboardViewProps {
  transactions: Transaction[];
  onAddManual: () => void;
  onImportCSV: () => void;
  onWipe: () => void;
  onExport: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSettings: () => void;
  onSetBudget: () => void;
  onExpectedBudget: () => void;
  onLock: () => void;
  onViewCategory: (catId: string) => void;
  currency: string;
  thousandsSeparator: string;
  dateFormat: string;
  isCloudConnected: boolean;
  timezone: string;
  activeVaultName: string;
  onUpdateVaultName: (name: string) => Promise<void>;
}

export default function DashboardView({ 
  transactions, 
  onAddManual, 
  onImportCSV, 
  onWipe, 
  onExport, 
  theme, 
  onToggleTheme, 
  onSettings, 
  onSetBudget, 
  onExpectedBudget,
  onLock, 
  onViewCategory, 
  currency,
  thousandsSeparator,
  dateFormat,
  timezone,
  isCloudConnected,
  activeVaultName,
  onUpdateVaultName
}: DashboardViewProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'docs' | 'security' | 'manifest' | 'source' | null>(null);
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | '1Y'>('1M');
  const [chartMetric, setChartMetric] = useState<'spendings' | 'balance'>('spendings');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(activeVaultName);

  useEffect(() => {
    setTempName(activeVaultName);
  }, [activeVaultName]);

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== activeVaultName) {
      onUpdateVaultName(trimmed);
    } else {
      setTempName(activeVaultName);
    }
    setIsEditingName(false);
  };



  const modalContent = {
    docs: { title: 'Ledger Documentation', subtitle: 'HOW OFFLINE CRYPTOGRAPHY SAFEGUARDS YOUR LEDGER', icon: FileText, color: 'text-nature-green', body: 'Learn how VaultFlow’s visual-first offline architecture structures your finance records. By normalizing bank statement CSVs locally and routing tags via your private node classification agent, we completely bypass server storage.' },
    security: { title: 'Cryptographic Engine Audit', subtitle: 'NATIVE AES-GCM 256-BIT SECURE ENVELOPES', icon: Shield, color: 'text-ocean-blue', body: 'Your master passcode acts as the absolute derivation source. VaultFlow triggers the native browser Web Cryptography API (`subtle`) to derive an ephemeral symmetric key. Payloads are encrypted with unique 96-bit IVs before resting safely inside your browser IndexedDB.' },
    manifest: { title: 'VaultFlow Privacy Manifest', subtitle: 'ZERO STORAGE. ZERO TRACKING. 100% OFF-CHAIN.', icon: Lock, color: 'text-sand-gold', body: 'Your finances are private. We do not integrate tracking SDKs, analytical hooks, or telemetry scripts. No registration details, session keys, balances, or transaction details ever exit your local device context.' },
    source: { title: 'Open Source Assurance', subtitle: 'TRANSPARENT ARCHITECTURE AND BUILD VERIFICATION', icon: Code, color: 'text-nature-green', body: 'VaultFlow is engineered on open standard runtimes: React, Vite, Framer Motion, and Tailwind CSS. The code builds directly into client-side static bundles with no proprietary libraries.' }
  };

  // 1. Data Parsing & Splits
  const expenses = transactions.filter(t => t.type === 'expense');
  const incomes = transactions.filter(t => t.type === 'income');

  const totalExpensesCents = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalIncomesCents = incomes.reduce((sum, t) => sum + t.amount, 0);
  const netReservesCents = totalIncomesCents - totalExpensesCents;

  // 2. Pillars (Fixed vs Agile vs Retained)
  const FIXED_CATEGORIES = ['home', 'utilities', 'health'];
  const fixedCents = expenses.filter(t => FIXED_CATEGORIES.includes(t.category_id || '')).reduce((sum, t) => sum + t.amount, 0);
  const agileCents = totalExpensesCents - fixedCents;
  const retainedCents = Math.max(0, netReservesCents);
  
  const totalBase = Math.max(totalIncomesCents, 1);
  const fixedPercent = (fixedCents / totalBase) * 100;
  const agilePercent = (agileCents / totalBase) * 100;
  const retainedPercent = (retainedCents / totalBase) * 100;

  // 3. Reserves & Flow Trend (Dynamic) — timezone-aware
  const velocityData: { label: string; value: number }[] = [];
  const nowParts = getTimezoneDateParts(Date.now(), timezone);
  
  if (chartRange === '1M') {
    for (let i = 29; i >= 0; i--) {
      const dayStart = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - i, 0, 0, 0, timezone);
      const dayEnd = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - i + 1, 0, 0, 0, timezone);
      const dayParts = getTimezoneDateParts(dayStart, timezone);
      const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const dateStr = `${monthsAbbr[dayParts.month - 1]} ${dayParts.day}`;
      
      let val = 0;
      if (chartMetric === 'spendings') {
        val = expenses
          .filter(t => t.booking_date >= dayStart && t.booking_date < dayEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
      } else {
        const incomesBefore = incomes.filter(t => t.booking_date < dayEnd).reduce((sum, t) => sum + t.amount, 0);
        const expensesBefore = expenses.filter(t => t.booking_date < dayEnd).reduce((sum, t) => sum + t.amount, 0);
        val = (incomesBefore - expensesBefore) / 100;
      }
      velocityData.push({ label: dateStr, value: val });
    }
  } else if (chartRange === '3M' || chartRange === '6M') {
    const weeks = chartRange === '3M' ? 12 : 24;
    for (let i = weeks - 1; i >= 0; i--) {
      const start = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - (i * 7 + 7), 0, 0, 0, timezone);
      const end = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - (i * 7), 0, 0, 0, timezone);
      const startParts = getTimezoneDateParts(start, timezone);
      const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const weekStr = `${monthsAbbr[startParts.month - 1]} ${startParts.day}`;
      
      let val = 0;
      if (chartMetric === 'spendings') {
        val = expenses
          .filter(t => t.booking_date >= start && t.booking_date < end)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
      } else {
        const incomesBefore = incomes.filter(t => t.booking_date < end).reduce((sum, t) => sum + t.amount, 0);
        const expensesBefore = expenses.filter(t => t.booking_date < end).reduce((sum, t) => sum + t.amount, 0);
        val = (incomesBefore - expensesBefore) / 100;
      }
      velocityData.push({ label: weekStr, value: val });
    }
  } else if (chartRange === '1Y') {
    for (let i = 11; i >= 0; i--) {
      const monthStart = getTimestampFromParts(nowParts.year, nowParts.month - i, 1, 0, 0, 0, timezone);
      const monthEnd = getTimestampFromParts(nowParts.year, nowParts.month - i + 1, 1, 0, 0, 0, timezone);
      const mParts = getTimezoneDateParts(monthStart, timezone);
      const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthStr = `${monthsAbbr[mParts.month - 1]} '${String(mParts.year).slice(-2)}`;
      
      let val = 0;
      if (chartMetric === 'spendings') {
        val = expenses
          .filter(t => t.booking_date >= monthStart && t.booking_date < monthEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
      } else {
        const incomesBefore = incomes.filter(t => t.booking_date < monthEnd).reduce((sum, t) => sum + t.amount, 0);
        const expensesBefore = expenses.filter(t => t.booking_date < monthEnd).reduce((sum, t) => sum + t.amount, 0);
        val = (incomesBefore - expensesBefore) / 100;
      }
      velocityData.push({ label: monthStr, value: val });
    }
  }

  // 4. Categories & Budgets
  const categoryBudgets: Record<string, { limit: number; icon: any; color: string; label: string }> = {};
  categories.forEach(c => {
    categoryBudgets[c.id] = { limit: c.budget, icon: ICON_MAP[c.icon] || ICON_MAP['Tag'], color: c.color, label: c.label };
  });

  const currentMonthStart = getTimestampFromParts(nowParts.year, nowParts.month, 1, 0, 0, 0, timezone);
  const nextMonthStart = getTimestampFromParts(nowParts.year, nowParts.month + 1, 1, 0, 0, 0, timezone);

  const isCurrentMonth = (timestamp: number) => {
    return timestamp >= currentMonthStart && timestamp < nextMonthStart;
  };

  const categorySpent: Record<string, number> = {};
  transactions.forEach(t => {
    if (isCurrentMonth(t.booking_date)) {
      if (t.type === 'income') {
        categorySpent['income'] = (categorySpent['income'] || 0) + t.amount;
      } else {
        const cat = t.category_id || 'other';
        categorySpent[cat] = (categorySpent[cat] || 0) + t.amount;
      }
    }
  });

  const displayedCategories = Object.keys(categoryBudgets)
    .filter(key => key !== 'income')
    .map(key => ({
      key,
      spent: categorySpent[key] || 0,
      ...categoryBudgets[key]
    }))
    .sort((a, b) => b.spent - a.spent)
    .filter(c => c.spent > 0 || c.limit > 0);

  return (
    <div className="min-h-screen flex flex-col relative bg-surface-dark overflow-x-hidden overflow-y-auto selection:bg-nature-green selection:text-surface-dark pb-10">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-ocean-blue/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-nature-green/5 blur-[150px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-white/5 sticky top-0">
        <div className="max-w-5xl mx-auto px-6 h-16 flex justify-between items-center relative">
          {/* Left Side: Logo & Sync Badge */}
          <div className="flex items-center gap-3">
            <span className="text-xl font-medium text-nature-green hover:opacity-80 transition-opacity duration-300">
              VaultFlow
            </span>
            <div className={cn("hidden sm:flex px-2 py-0.5 rounded items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest border shrink-0", isCloudConnected ? "bg-ocean-blue/10 text-ocean-blue border-ocean-blue/20" : "bg-earth-clay/10 text-earth-clay border-earth-clay/20")}>
              {isCloudConnected ? <CloudUpload className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {isCloudConnected ? 'Cloud Synced' : 'Local Only'}
            </div>
            <div 
              className={cn("flex sm:hidden p-1 rounded border shrink-0", isCloudConnected ? "bg-ocean-blue/10 text-ocean-blue border-ocean-blue/20" : "bg-earth-clay/10 text-earth-clay border-earth-clay/20")}
              title={isCloudConnected ? 'Cloud Synced' : 'Local Only'}
            >
              {isCloudConnected ? <CloudUpload className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            </div>
          </div>

          {/* Middle Side: Ledger Name */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center z-10">
            {isEditingName ? (
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') {
                    setTempName(activeVaultName);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="bg-white/5 border border-nature-green/30 rounded px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-nature-green/50 max-w-[130px] font-mono text-center"
              />
            ) : (
              <div 
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditingName(true); } }}
                onClick={() => setIsEditingName(true)}
                className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 px-3 py-1 rounded-full hover:bg-white/5 hover:border-nature-green/20 transition-all cursor-pointer select-none"
              >
                <span 
                  className="text-xs font-mono font-bold tracking-wider uppercase text-on-surface-variant hover:text-on-surface truncate max-w-[150px] leading-none"
                  title="Click to rename ledger"
                >
                  {activeVaultName}
                </span>
                <button 
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                  }}
                  className="text-on-surface-variant hover:text-nature-green p-0.5 cursor-pointer flex items-center justify-center shrink-0"
                  title="Rename ledger"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Right Side: Buttons (Desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <button onClick={onExpectedBudget} className="px-4.5 h-9 rounded-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest bg-ocean-blue/15 text-ocean-blue border border-ocean-blue/30 hover:bg-ocean-blue/25 hover:border-ocean-blue/40 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-[0_0_15px_rgba(92,124,138,0.15)]" title="Open Monthly Expected Budget Planner">
              Planner
            </button>
            <button onClick={onSetBudget} className="px-4.5 h-9 rounded-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest bg-nature-green/15 text-nature-green border border-nature-green/30 hover:bg-nature-green/25 hover:border-nature-green/40 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-[0_0_15px_rgba(123,160,91,0.15)]">
              Budgets
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button 
              onClick={onToggleTheme} 
              title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-nature-green hover:bg-white/5 transition-all cursor-pointer"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <button 
              onClick={onSettings} 
              title="Settings"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-nature-green hover:bg-white/5 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={onLock} 
              title="Lock Session"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-nature-green hover:bg-white/5 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Right Side: Toggle Buttons (Mobile) */}
          <div className="flex md:hidden items-center gap-1.5">
            <button 
              onClick={onToggleTheme} 
              title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-nature-green hover:bg-white/5 transition-all cursor-pointer"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              title="Toggle Menu"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-nature-green hover:bg-white/5 transition-all cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden w-full bg-surface-dark/95 border-b border-white/5 backdrop-blur-xl overflow-hidden"
            >
              <div className="px-6 py-5 flex flex-col gap-5 max-w-md mx-auto">
                {/* Ledger Name Row */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant font-mono">Ledger Name</span>
                  {isEditingName ? (
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') {
                          setTempName(activeVaultName);
                          setIsEditingName(false);
                        }
                      }}
                      autoFocus
                      className="bg-white/5 border border-nature-green/30 rounded px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-nature-green/50 max-w-[150px] font-mono text-center"
                    />
                  ) : (
                    <div 
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditingName(true); } }}
                      onClick={() => setIsEditingName(true)}
                      className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 px-3 py-1 rounded-full hover:bg-white/5 hover:border-nature-green/20 transition-all cursor-pointer select-none"
                    >
                      <span className="text-xs font-mono font-bold tracking-wider uppercase text-on-surface-variant hover:text-on-surface truncate max-w-[140px] leading-none">
                        {activeVaultName}
                      </span>
                      <Edit2 className="w-3 h-3 text-on-surface-variant" />
                    </div>
                  )}
                </div>

                {/* Sync Badge Row */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant font-mono">Sync Status</span>
                  <div className={cn("px-2 py-0.5 rounded flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest border shrink-0", isCloudConnected ? "bg-ocean-blue/10 text-ocean-blue border-ocean-blue/20" : "bg-earth-clay/10 text-earth-clay border-earth-clay/20")}>
                    {isCloudConnected ? <CloudUpload className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {isCloudConnected ? 'Cloud Synced' : 'Local Only'}
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onExpectedBudget();
                    }}
                    className="h-10 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-widest bg-ocean-blue/15 text-ocean-blue border border-ocean-blue/30 hover:bg-ocean-blue/25 hover:border-ocean-blue/40 transition-all cursor-pointer"
                  >
                    Planner
                  </button>
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onSetBudget();
                    }}
                    className="h-10 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-widest bg-nature-green/15 text-nature-green border border-nature-green/30 hover:bg-nature-green/25 hover:border-nature-green/40 transition-all cursor-pointer"
                  >
                    Budgets
                  </button>
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onSettings();
                    }}
                    className="h-10 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-widest bg-white/5 text-on-surface-variant border border-white/10 hover:bg-white/10 hover:text-on-surface transition-all cursor-pointer"
                  >
                    Settings
                  </button>
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onLock();
                    }}
                    className="h-10 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-widest bg-white/5 text-earth-clay border border-earth-clay/20 hover:bg-earth-clay/15 transition-all cursor-pointer"
                  >
                    Lock
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Flow */}
      <main className="flex-grow max-w-4xl mx-auto w-full px-6 pt-12 pb-24 md:pt-20 md:pb-32 flex flex-col gap-20">
        
        {/* Top Section: Zen Overview */}
        <section className="flex flex-col items-center text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase">Available Reserves</h2>
            <div className="text-6xl md:text-8xl font-light tracking-tight text-on-surface">
              {netReservesCents < 0 && <span className="text-3xl md:text-4xl text-earth-clay align-top mr-1">-</span>}
              <span className="text-3xl md:text-4xl text-on-surface-variant align-top mr-1">{currency}</span>
              {formatAmount(Math.abs(netReservesCents), '', thousandsSeparator, true)}
            </div>
            <div className="flex justify-center gap-6 text-sm text-on-surface-variant mt-2 font-medium">
              <span className="flex items-center gap-1.5"><ArrowUp className="w-4 h-4 text-nature-green"/> {formatAmount(totalIncomesCents, currency, thousandsSeparator, false)} In</span>
              <span className="flex items-center gap-1.5"><ArrowDown className="w-4 h-4 text-earth-clay"/> {formatAmount(totalExpensesCents, currency, thousandsSeparator, false)} Out</span>
            </div>
          </div>

          <div className="w-full max-w-2xl pt-6">
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden flex">
              <div style={{ width: `${fixedPercent}%` }} className="bg-ocean-blue h-full transition-all duration-1000" />
              <div style={{ width: `${agilePercent}%` }} className="bg-earth-clay h-full transition-all duration-1000" />
              <div style={{ width: `${retainedPercent}%` }} className="bg-nature-green h-full transition-all duration-1000" />
            </div>
            <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest mt-3">
              <div className="flex flex-col items-start gap-1">
                <span className="text-ocean-blue">Fixed Base</span>
                <span className="text-on-surface-variant font-mono">{fixedPercent.toFixed(1)}%</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-earth-clay">Agile Spend</span>
                <span className="text-on-surface-variant font-mono">{agilePercent.toFixed(1)}%</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-nature-green">Retained</span>
                <span className="text-on-surface-variant font-mono">{retainedPercent.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Middle Section: Flow Graph */}
        <section className="w-full max-w-3xl mx-auto space-y-4">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
             <div className="flex items-center gap-3">
               <h3 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase">Reserves & Flow</h3>
               <div className="flex bg-white/5 p-0.5 rounded-full border border-white/5">
                 <button
                   onClick={() => setChartMetric('spendings')}
                   className={cn(
                     "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all",
                     chartMetric === 'spendings'
                       ? "bg-ocean-blue text-surface-dark shadow-[0_2px_10px_rgba(92,124,138,0.3)]"
                       : "text-on-surface-variant hover:text-on-surface"
                   )}
                 >
                   Spendings
                 </button>
                 <button
                   onClick={() => setChartMetric('balance')}
                   className={cn(
                     "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all",
                     chartMetric === 'balance'
                       ? "bg-nature-green text-surface-dark shadow-[0_2px_10px_rgba(123,160,91,0.3)]"
                       : "text-on-surface-variant hover:text-on-surface"
                   )}
                 >
                   Balance
                 </button>
               </div>
             </div>
             <div className="flex gap-2">
               {(['1M', '3M', '6M', '1Y'] as const).map(range => (
                 <button 
                   key={range}
                   onClick={() => setChartRange(range)}
                   className={cn(
                     "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                     chartRange === range 
                       ? "bg-nature-green text-surface-dark" 
                       : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                   )}
                 >
                   {range}
                 </button>
               ))}
             </div>
           </div>
           <div className="h-48 w-full glass-card rounded-[2rem] p-6 relative overflow-hidden group">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={velocityData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartMetric === 'spendings' ? 'var(--color-ocean-blue)' : 'var(--color-nature-green)'} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={chartMetric === 'spendings' ? 'var(--color-ocean-blue)' : 'var(--color-nature-green)'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface-container)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                    itemStyle={{ color: 'var(--on-surface)' }}
                    formatter={(value: number) => [`${currency}${value.toFixed(2)}`, chartMetric === 'spendings' ? 'Spent' : 'Balance']}
                    labelStyle={{ color: 'var(--on-surface-variant)', marginBottom: '4px', fontSize: '12px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke={chartMetric === 'spendings' ? 'var(--color-ocean-blue)' : 'var(--color-nature-green)'} 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                    animationDuration={1500}
                  />
                </AreaChart>
             </ResponsiveContainer>
           </div>
        </section>

        {/* Bottom Section: Categories */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase">Activity Streams</h3>
          </div>
           
           {/* Standalone wide Income Card */}
           {(() => {
             const incomeInfo = categoryBudgets['income'];
             if (!incomeInfo) return null;
             const incomeEarned = categorySpent['income'] || 0;
             const incomeTarget = incomeInfo.limit;
             const IncomeIcon = incomeInfo.icon || DollarSign;
             
             return (
               <motion.div 
                 role="button"
                 tabIndex={0}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewCategory('income'); } }}
                 whileHover={{ y: -2 }}
                 onClick={() => onViewCategory('income')}
                 className="glass-card rounded-[2rem] p-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6 cursor-pointer hover:border-white/10 group shadow-md"
               >
                 <div className="absolute top-0 right-0 w-[240px] h-[240px] bg-nature-green/5 dark:bg-nature-green/10 blur-[60px] rounded-full pointer-events-none" />
                 
                 <div className="flex items-center gap-4 relative z-10">
                   <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-nature-green/10 text-nature-green shrink-0">
                     <IncomeIcon className="w-6 h-6" />
                   </div>
                   <div>
                     <div className="flex items-center gap-2">
                       <span className="font-bold text-base text-on-surface">{incomeInfo.label} Stream</span>
                       <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-nature-green/10 text-nature-green border border-nature-green/20">
                         Current Month
                       </span>
                     </div>
                     <p className="text-xs text-on-surface-variant mt-1 font-sans">Track monthly cash inflow and progress towards your savings target.</p>
                   </div>
                 </div>

                 <div className="flex flex-col sm:items-end justify-center gap-1.5 relative z-10 shrink-0 min-w-[200px] w-full sm:w-auto">
                   <div className="flex justify-between sm:justify-end items-baseline gap-2">
                     <span className="text-2xl font-light text-on-surface font-mono">
                       {formatAmount(incomeEarned, currency, thousandsSeparator, true)}
                     </span>
                     {incomeTarget > 0 && (
                       <span className="text-xs text-on-surface-variant font-mono">
                         / {formatAmount(incomeTarget, currency, thousandsSeparator, false)}
                       </span>
                     )}
                   </div>
                   
                   {incomeTarget > 0 ? (
                     <div className="w-full space-y-1">
                       <div className="w-full h-1.5 bg-on-surface/5 dark:bg-white/5 rounded-full overflow-hidden">
                         <div 
                           style={{ width: `${Math.min(100, (incomeEarned / incomeTarget) * 100)}%` }} 
                           className="bg-nature-green h-full rounded-full transition-all duration-1000" 
                         />
                       </div>
                       <div className="flex justify-between text-[9px] font-mono font-bold text-on-surface-variant uppercase tracking-wider">
                         <span>Savings Target</span>
                         <span>{Math.round((incomeEarned / incomeTarget) * 100)}%</span>
                       </div>
                     </div>
                   ) : (
                     <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-wider self-end">No savings target set</span>
                   )}
                 </div>
               </motion.div>
             );
           })()}

           {displayedCategories.length > 0 ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {displayedCategories.map(cat => {
                  const pct = cat.limit > 0 ? Math.min(100, (cat.spent / cat.limit) * 100) : 0;
                  return (
                    <motion.div 
                      key={cat.key}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewCategory(cat.key); } }}
                      whileHover={{ y: -2 }}
                      onClick={() => onViewCategory(cat.key)}
                      className="glass-card rounded-[1.5rem] p-5 relative overflow-hidden flex flex-col justify-between h-32 group cursor-pointer hover:border-white/10"
                    >
                      {/* Soft fill background representing budget usage */}
                      <div 
                        className={cn("absolute bottom-0 left-0 w-full opacity-10 transition-all duration-1000", cat.color.replace('text-', 'bg-').replace('text', 'bg'))}
                        style={{ height: `${pct}%` }}
                      />
                      
                      <div className="flex items-center gap-3 relative z-10">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", cat.color.replace('text-', 'bg-').concat('/10'), cat.color)}>
                          <cat.icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-sm text-on-surface">{cat.label}</span>
                      </div>

                      <div className="relative z-10 flex flex-col">
                        <span className="text-xl font-light text-on-surface">{formatAmount(cat.spent, currency, thousandsSeparator, true)}</span>
                        <span className="text-[10px] text-on-surface-variant font-medium">
                          {cat.limit > 0 ? `of ${formatAmount(cat.limit, currency, thousandsSeparator, false)}` : 'No limit set'}
                        </span>
                      </div>
                    </motion.div>
                  );
               })}
             </div>
           ) : (
             <div className="text-center py-12 text-on-surface-variant text-sm border border-white/5 border-dashed rounded-3xl">
               No expenses or budget limits found for this month.
             </div>
           )}
        </section>

      </main>

      {/* Footer / Modals Component (Kept clean at bottom) */}
      <footer className="w-full py-8 px-6 flex justify-center border-t border-white/5 mt-auto">
        <nav className="flex flex-wrap justify-center gap-6 font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/70">
          <button onClick={() => setActiveModal('docs')} className="hover:text-on-surface transition-colors">Docs</button>
          <button onClick={() => setActiveModal('security')} className="hover:text-on-surface transition-colors">Security</button>
          <button onClick={() => setActiveModal('manifest')} className="hover:text-on-surface transition-colors">Privacy</button>
          <button onClick={() => setActiveModal('source')} className="hover:text-on-surface transition-colors">Source</button>
        </nav>
      </footer>

      {/* Modal Overlay */}
      <AnimatePresence>
        {activeModal && modalContent[activeModal] && (() => {
          const content = modalContent[activeModal];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-dark/80 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-[440px] bg-surface-container rounded-[2rem] p-8 border border-white/5 shadow-2xl flex flex-col items-center gap-6"
              >
                <button onClick={() => setActiveModal(null)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant flex items-center justify-center transition-all cursor-pointer hover:text-on-surface">
                  <X className="w-4 h-4" />
                </button>
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <content.icon className={cn("w-7 h-7", content.color)} />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-medium text-on-surface">{content.title}</h2>
                  <p className="text-[10px] text-on-surface-variant tracking-[0.15em] font-bold uppercase">{content.subtitle}</p>
                </div>
                <p className="text-sm text-on-surface-variant/90 text-center leading-relaxed">
                  {content.body}
                </p>
                <button onClick={() => setActiveModal(null)} className="w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-on-surface font-medium text-sm transition-all mt-2 cursor-pointer">
                  Close
                </button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-4 items-end">
        <button 
          onClick={onImportCSV}
          className="group w-12 hover:w-[185px] h-12 rounded-full bg-surface-container border border-on-surface/10 hover:border-nature-green/40 text-on-surface-variant hover:text-nature-green flex items-center justify-center hover:justify-between shadow-lg hover:shadow-nature-green/20 transition-all duration-300 overflow-hidden cursor-pointer px-3.5"
          title="Import CSV Statement"
        >
          <span className="w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-300 font-mono text-[10px] font-bold uppercase tracking-widest leading-none whitespace-nowrap">
            Import Statement
          </span>
          <CloudUpload className="w-5 h-5 shrink-0" />
        </button>
        <button 
          onClick={onAddManual}
          className="group w-14 hover:w-[175px] h-14 rounded-full bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark flex items-center justify-center hover:justify-between shadow-lg shadow-nature-green/10 hover:shadow-nature-green/25 hover:scale-105 transition-all duration-300 overflow-hidden cursor-pointer px-4"
          title="Add Manual Record"
        >
          <span className="w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:opacity-100 transition-all duration-300 font-mono text-[10px] font-bold uppercase tracking-widest leading-none whitespace-nowrap">
            Add Record
          </span>
          <Plus className="w-6 h-6 shrink-0" />
        </button>
      </div>
    </div>
  );
}
