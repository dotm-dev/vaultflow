import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Calendar, Store, Filter, X, Eye, FileText } from 'lucide-react';
import { Transaction } from '../types';
import { useCategories, ICON_MAP } from '../lib/categories';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { formatAmount, formatDate, formatTime, getTimezoneDateParts, getTimestampFromParts } from '../lib/formatters';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';

const COLOR_HEX_MAP: Record<string, string> = {
  'text-earth-clay': '#D9735A',
  'text-nature-green': '#7BA05B',
  'text-ocean-blue': '#5C7C8A',
  'text-sand-gold': '#D4AE5E',
  'text-plum-purple': '#8B6B7B',
  'text-sky-teal': '#7AA89F',
  'text-bark-brown': '#9E806E',
  'text-forest-moss': '#506655',
  'text-white': '#FFFFFF',
};

interface CategoryDetailsViewProps {
  categoryId: string;
  transactions: Transaction[];
  onBack: () => void;
  onUpdateTransaction?: (tx: Transaction) => void;
  currency: string;
  thousandsSeparator: string;
  dateFormat: string;
  timezone: string;
}

export default function CategoryDetailsView({ 
  categoryId, 
  transactions, 
  onBack, 
  onUpdateTransaction, 
  currency,
  thousandsSeparator,
  dateFormat,
  timezone
}: CategoryDetailsViewProps) {
  const { categories } = useCategories();
  const containerRef = useRef<HTMLDivElement>(null);
  const txListRef = useRef<HTMLDivElement>(null);
  const lastCategoryIdRef = useRef(categoryId);
  const lastPageRef = useRef(1);

  const category = categories.find(c => c.id === categoryId) || {
    id: categoryId,
    label: categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
    icon: 'Tag',
    color: 'text-on-surface-variant',
    budget: 0
  };

  const IconComponent = ICON_MAP[category.icon] || ICON_MAP['Tag'];

  // Chart configuration & monthly trend calculations
  const chartColor = COLOR_HEX_MAP[category.color] || '#7BA05B';
  const budgetLimit = (category.budget || 0) / 100;
  const referenceLineLabel = categoryId === 'income' ? 'Savings Target' : 'Budget Limit';

  const chartData = useMemo(() => {
    const months: { year: number; month: number; label: string; amount: number; start: number; end: number }[] = [];
    const nowParts = getTimezoneDateParts(Date.now(), timezone);
    const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    // Generate the last 6 months in chronological order
    for (let i = 5; i >= 0; i--) {
      const monthStart = getTimestampFromParts(nowParts.year, nowParts.month - i, 1, 0, 0, 0, timezone);
      const monthEnd = getTimestampFromParts(nowParts.year, nowParts.month - i + 1, 1, 0, 0, 0, timezone);
      const mParts = getTimezoneDateParts(monthStart, timezone);
      months.push({
        year: mParts.year,
        month: mParts.month,
        label: monthsAbbr[mParts.month - 1],
        amount: 0,
        start: monthStart,
        end: monthEnd,
      });
    }

    // Filter transactions belonging to this category (independent of page filters)
    const catTxs = transactions.filter(t => {
      return categoryId === 'income' ? t.type === 'income' : (t.category_id === categoryId && t.type === 'expense');
    });

    // Sum transactions per month using timezone-aware boundaries
    catTxs.forEach(tx => {
      const match = months.find(m => tx.booking_date >= m.start && tx.booking_date < m.end);
      if (match) {
        match.amount += tx.amount / 100;
      }
    });

    return months.map(m => ({
      name: m.label,
      amount: Math.round(m.amount),
    }));
  }, [transactions, categoryId, timezone]);

  const [timeFilter, setTimeFilter] = useState<'all' | 'this_month' | 'last_3_months' | 'this_year' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  
  const [movedTxIds, setMovedTxIds] = useState<Set<string>>(new Set());
  const [activeTx, setActiveTx] = useState<Transaction | null>(null);

  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Scroll to very top instantly when category switches
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [categoryId]);

  // Scroll to transaction list smoothly when changing pages
  useEffect(() => {
    if (lastPageRef.current !== currentPage) {
      if (txListRef.current) {
        txListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      lastPageRef.current = currentPage;
    }
  }, [currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    lastPageRef.current = 1;
  }, [categoryId, timeFilter, minAmount, maxAmount, storeFilter, customStartDate, customEndDate]);

  const filteredTransactions = useMemo(() => {
    let txs = transactions.filter(t => {
      const isMatch = categoryId === 'income' ? t.type === 'income' : (t.category_id === categoryId && t.type === 'expense');
      return isMatch || movedTxIds.has(t.id);
    });

    // Time Filter — timezone-aware
    const filterParts = getTimezoneDateParts(Date.now(), timezone);
    if (timeFilter === 'this_month') {
      const startOfMonth = getTimestampFromParts(filterParts.year, filterParts.month, 1, 0, 0, 0, timezone);
      txs = txs.filter(t => t.booking_date >= startOfMonth);
    } else if (timeFilter === 'last_3_months') {
      const start = getTimestampFromParts(filterParts.year, filterParts.month - 2, 1, 0, 0, 0, timezone);
      txs = txs.filter(t => t.booking_date >= start);
    } else if (timeFilter === 'this_year') {
      const startOfYear = getTimestampFromParts(filterParts.year, 1, 1, 0, 0, 0, timezone);
      txs = txs.filter(t => t.booking_date >= startOfYear);
    } else if (timeFilter === 'custom') {
      if (customStartDate) {
        const [y, m, d] = customStartDate.split('-').map(Number);
        const start = getTimestampFromParts(y, m, d, 0, 0, 0, timezone);
        txs = txs.filter(t => t.booking_date >= start);
      }
      if (customEndDate) {
        const [y, m, d] = customEndDate.split('-').map(Number);
        const end = getTimestampFromParts(y, m, d, 23, 59, 59, timezone);
        txs = txs.filter(t => t.booking_date <= end);
      }
    }

    // Amount Filter
    const min = parseFloat(minAmount);
    if (!isNaN(min)) {
      txs = txs.filter(t => t.amount / 100 >= min);
    }
    const max = parseFloat(maxAmount);
    if (!isNaN(max)) {
      txs = txs.filter(t => t.amount / 100 <= max);
    }

    // Store Filter
    if (storeFilter.trim()) {
      const query = storeFilter.toLowerCase();
      txs = txs.filter(t => t.counterparty.toLowerCase().includes(query));
    }

    return txs.sort((a, b) => b.booking_date - a.booking_date);
  }, [transactions, categoryId, timeFilter, minAmount, maxAmount, storeFilter, movedTxIds, customStartDate, customEndDate, timezone]);

  const totalSpent = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  const handleCategoryChange = (tx: Transaction, newCategoryId: string) => {
    if (onUpdateTransaction) {
      // If it's an income being changed to a non-income, or expense to income, we might need to handle type
      // But we just trust the user or leave type alone. (Usually they just fix wrong expense categories).
      onUpdateTransaction({ ...tx, category_id: newCategoryId });
      setMovedTxIds(prev => {
        const next = new Set(prev);
        next.add(tx.id);
        return next;
      });
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-surface-dark flex flex-col relative overflow-y-auto selection:bg-nature-green selection:text-surface-dark pb-10">

      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-white/5 sticky top-0">
        <div className="max-w-4xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
            <div className="flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-white/5", category.color.replace('text-', 'bg-').concat('/10'))}>
                <IconComponent className={cn("w-4 h-4", category.color)} />
              </div>
              <div className="text-xl font-black text-on-surface tracking-tight">{category.label}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col px-6 max-w-4xl mx-auto w-full py-8 z-10 gap-8">
        
        <div className="flex flex-col md:flex-row gap-6 md:items-end justify-between">
          <div>
            <h2 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1">
              {categoryId === 'income' ? 'Total Income' : 'Total Spent'}
            </h2>
            <div className="text-5xl font-light tracking-tight text-on-surface">
              {formatAmount(totalSpent, currency, thousandsSeparator, true)}
            </div>
          </div>
        </div>

        {/* Monthly Trend Chart */}
        <div className="w-full space-y-3">
          <div className="h-60 w-full glass-card rounded-[2rem] p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-[200px] h-[200px] opacity-10 blur-[50px] rounded-full pointer-events-none" style={{ backgroundColor: chartColor }} />
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`colorTrend-${categoryId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  stroke="var(--color-on-surface-variant)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis
                  hide
                  domain={[0, (dataMax: number) => {
                    const upperBound = Math.max(dataMax, budgetLimit);
                    return Math.ceil(upperBound * 1.15);
                  }]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--surface-container)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '16px', 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                    backdropFilter: 'blur(12px)'
                  }}
                  itemStyle={{ color: 'var(--on-surface)' }}
                  formatter={(value: number) => [`${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, categoryId === 'income' ? 'Received' : 'Spent']}
                  labelStyle={{ color: 'var(--on-surface-variant)', marginBottom: '4px', fontSize: '11px', fontWeight: 'bold' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke={chartColor} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill={`url(#colorTrend-${categoryId})`} 
                  animationDuration={1500}
                />
                {budgetLimit > 0 && (
                  <ReferenceLine 
                    y={budgetLimit} 
                    stroke={chartColor} 
                    strokeDasharray="4 4" 
                    strokeWidth={1.5}
                    opacity={0.8}
                    label={{ 
                      value: `${referenceLineLabel}: ${formatAmount(category.budget, currency, thousandsSeparator, false)}`, 
                      position: 'top', 
                      fill: 'var(--color-on-surface-variant)', 
                      fontSize: 10,
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      dy: -6
                    }} 
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filters */}
        <section className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-on-surface-variant" />
            <h3 className="text-xs font-bold text-on-surface uppercase tracking-widest font-mono">Filters</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Time Period</label>
              <div className="relative group">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                <select 
                  value={timeFilter}
                  onChange={e => setTimeFilter(e.target.value as any)}
                  className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors appearance-none"
                >
                  <option value="all">All Time</option>
                  <option value="this_month">This Month</option>
                  <option value="last_3_months">Last 3 Months</option>
                  <option value="this_year">This Year</option>
                  <option value="custom">Custom Range...</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Amount Range ({currency})</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  placeholder="Min"
                  value={minAmount}
                  onChange={e => setMinAmount(e.target.value)}
                  className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-nature-green/50 transition-colors"
                />
                <span className="text-on-surface-variant">-</span>
                <input 
                  type="number" 
                  placeholder="Max"
                  value={maxAmount}
                  onChange={e => setMaxAmount(e.target.value)}
                  className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-nature-green/50 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Store / Merchant</label>
              <div className="relative group">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search stores..."
                  value={storeFilter}
                  onChange={e => setStoreFilter(e.target.value)}
                  className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-nature-green/50 transition-colors"
                />
              </div>
            </div>
          </div>

          <AnimatePresence>
            {timeFilter === 'custom' && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4 overflow-hidden"
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Start Date</label>
                  <input 
                    type="date" 
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors scheme-dark"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">End Date</label>
                  <input 
                    type="date" 
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-2.5 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors scheme-dark"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Transactions List */}
        <section ref={txListRef} className="scroll-mt-24 flex flex-col gap-3">
          <h3 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase px-2 mb-2">
            {filteredTransactions.length} Transactions
          </h3>
          
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant text-sm border border-white/5 border-dashed rounded-3xl">
              No transactions match the selected filters.
            </div>
          ) : (
            paginatedTransactions.map(tx => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={tx.id} 
                onClick={() => setActiveTx(tx)}
                className="glass-card rounded-2xl p-4 border border-white/5 flex flex-col md:flex-row md:items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer gap-4 md:gap-0"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                  <div className="w-10 h-10 rounded-full bg-surface-dark border border-white/5 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4 text-on-surface-variant" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-on-surface truncate">{tx.counterparty}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-2">
                      {formatDate(tx.booking_date, dateFormat, timezone)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto shrink-0" onClick={e => e.stopPropagation()}>
                  <select
                    value={tx.category_id || 'other'}
                    onChange={e => handleCategoryChange(tx, e.target.value)}
                    className="w-32 bg-surface-dark border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface focus:outline-none focus:border-nature-green/30 transition-colors appearance-none cursor-pointer text-center"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <div className={cn("font-mono font-bold text-right md:w-32 shrink-0", tx.type === 'income' ? 'text-nature-green' : 'text-on-surface')}>
                    {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount, currency, thousandsSeparator, true)}
                  </div>
                </div>
              </motion.div>
            ))
          )}

          {filteredTransactions.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-2 py-4 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-surface-dark border border-white/10 rounded-lg px-2.5 py-1 font-mono font-bold text-on-surface hover:text-nature-green focus:outline-none focus:border-nature-green/30 transition-all cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>transactions per page</span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant cursor-pointer"
                >
                  Prev
                </button>
                <span className="text-xs font-mono font-bold text-on-surface-variant">
                  Page {currentPage} of {Math.max(1, totalPages)}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {activeTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-dark/80 backdrop-blur-md" onClick={() => setActiveTx(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-lg bg-surface-container rounded-[2rem] p-8 border border-white/5 shadow-2xl flex flex-col gap-6"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-on-surface-variant" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">{activeTx.counterparty}</h3>
                    <p className="text-xs text-on-surface-variant font-mono">
                      {formatDate(activeTx.booking_date, dateFormat, timezone)} {formatTime(activeTx.booking_date, timezone)}
                    </p>
                  </div>
                </div>
                <button onClick={() => setActiveTx(null)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant flex items-center justify-center transition-all cursor-pointer hover:text-on-surface">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="glass-card rounded-xl p-4 border border-white/5 space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-white/5">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Amount</span>
                  <span className={cn("font-mono font-bold text-lg", activeTx.type === 'income' ? 'text-nature-green' : 'text-on-surface')}>
                    {activeTx.type === 'income' ? '+' : '-'}{formatAmount(activeTx.amount, currency, thousandsSeparator, true)}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/5">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Category</span>
                  <span className="font-bold text-on-surface text-sm">
                    {categories.find(c => c.id === activeTx.category_id)?.label || 'Other'}
                  </span>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                    <Eye className="w-3 h-3" /> Raw Source Data
                  </span>
                  <code className="bg-surface-dark rounded-lg p-3 text-[10px] text-on-surface-variant font-mono break-all whitespace-pre-wrap">
                    {activeTx.raw_data || 'Manual Entry'}
                  </code>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
