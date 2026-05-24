import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ArrowLeft, ArrowUp, ArrowDown, Plus, Search, Calendar, Filter, DollarSign, X, FileText, 
  TrendingUp, Coins, Settings2, Bookmark, ChevronDown, ChevronUp, Clock, Eye, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { Transaction, Category } from '../types';
import { useCategories, ICON_MAP } from '../lib/categories';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { formatAmount, formatDate, formatTime, getTimezoneDateParts, getTimestampFromParts } from '../lib/formatters';
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Brush, Cell, Legend } from 'recharts';

interface ReservesFlowViewProps {
  transactions: Transaction[];
  onBack: () => void;
  onUpdateTransaction: (tx: Transaction) => Promise<void>;
  onUpdateConfig: (key: string, value: any) => Promise<void>;
  currency: string;
  thousandsSeparator: string;
  dateFormat: string;
  timezone: string;
  currentLedgerBalance: number;
  ledgerCreatedAt: number;
  fixedCategories: string[];
  activeVaultName: string;
}

export default function ReservesFlowView({
  transactions,
  onBack,
  onUpdateTransaction,
  onUpdateConfig,
  currency,
  thousandsSeparator,
  dateFormat,
  timezone,
  currentLedgerBalance,
  ledgerCreatedAt,
  fixedCategories,
  activeVaultName
}: ReservesFlowViewProps) {
  const { categories } = useCategories();
  const containerRef = useRef<HTMLDivElement>(null);
  const txListRef = useRef<HTMLDivElement>(null);

  // View States
  const [chartPreset, setChartPreset] = useState<'balance' | 'cumulative' | 'interval' | 'custom'>('balance');
  const [showReservesArea, setShowReservesArea] = useState(true);
  const [showNetBars, setShowNetBars] = useState(true);
  const [showInflowLine, setShowInflowLine] = useState(false);
  const [showOutflowLine, setShowOutflowLine] = useState(false);
  const [showCumInflow, setShowCumInflow] = useState(false);
  const [showCumOutflow, setShowCumOutflow] = useState(false);

  const applyPreset = (preset: 'balance' | 'cumulative' | 'interval') => {
    setChartPreset(preset);
    if (preset === 'balance') {
      setShowReservesArea(true);
      setShowNetBars(true);
      setShowInflowLine(false);
      setShowOutflowLine(false);
      setShowCumInflow(false);
      setShowCumOutflow(false);
    } else if (preset === 'cumulative') {
      setShowReservesArea(false);
      setShowNetBars(false);
      setShowInflowLine(false);
      setShowOutflowLine(false);
      setShowCumInflow(true);
      setShowCumOutflow(true);
    } else if (preset === 'interval') {
      setShowReservesArea(false);
      setShowNetBars(true);
      setShowInflowLine(true);
      setShowOutflowLine(true);
      setShowCumInflow(false);
      setShowCumOutflow(false);
    }
  };

  const [activeTx, setActiveTx] = useState<Transaction | null>(null);
  const [isFixedConfigOpen, setIsFixedConfigOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-surface-container/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-xs font-mono space-y-2 select-none min-w-[220px]">
          <div className="font-bold text-on-surface-variant pb-1.5 border-b border-white/5">{data.label}</div>
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between gap-4">
              <span className="text-nature-green font-bold">Reserves:</span>
              <span className="text-on-surface font-semibold">{formatAmount(data.balance * 100, currency, thousandsSeparator, false)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-on-surface-variant font-bold">Net Period Flow:</span>
              <span className={cn("font-semibold", data.intervalNet >= 0 ? "text-nature-green" : "text-earth-clay")}>
                {data.intervalNet >= 0 ? '+' : ''}{formatAmount(data.intervalNet * 100, currency, thousandsSeparator, false)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-[10px] opacity-85 border-t border-white/5 pt-1 mt-1 font-semibold">
              <span className="text-sky-teal">Inflow (Interval):</span>
              <span className="text-on-surface">{formatAmount(data.intervalIncome * 100, currency, thousandsSeparator, false)}</span>
            </div>
            <div className="flex justify-between gap-4 text-[10px] opacity-85 font-semibold">
              <span className="text-earth-clay">Outflow (Interval):</span>
              <span className="text-on-surface">{formatAmount(data.intervalExpense * 100, currency, thousandsSeparator, false)}</span>
            </div>
            <div className="flex justify-between gap-4 text-[10px] opacity-75 border-t border-white/5 pt-1 mt-1">
              <span className="text-sky-teal/70">Cum. Inflow:</span>
              <span className="text-on-surface-variant">{formatAmount(data.income * 100, currency, thousandsSeparator, false)}</span>
            </div>
            <div className="flex justify-between gap-4 text-[10px] opacity-75">
              <span className="text-earth-clay/70">Cum. Outflow:</span>
              <span className="text-on-surface-variant">{formatAmount(data.expense * 100, currency, thousandsSeparator, false)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | '30d' | '90d' | '180d' | 'this_year' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [pillarFilter, setPillarFilter] = useState<'all' | 'fixed' | 'agile' | 'retained'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [recurrenceFilter, setRecurrenceFilter] = useState<'all' | 'recurring' | 'onetime'>('all');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (timeFilter !== 'all') count++;
    if (pillarFilter !== 'all') count++;
    if (typeFilter !== 'all') count++;
    if (selectedCategory !== 'all') count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    if (recurrenceFilter !== 'all') count++;
    return count;
  }, [searchQuery, timeFilter, pillarFilter, typeFilter, selectedCategory, minAmount, maxAmount, recurrenceFilter]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setTimeFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setTypeFilter('all');
    setPillarFilter('all');
    setSelectedCategory('all');
    setMinAmount('');
    setMaxAmount('');
    setRecurrenceFilter('all');
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, timeFilter, customStartDate, customEndDate, typeFilter, pillarFilter, selectedCategory, minAmount, maxAmount, recurrenceFilter]);

  // Helper to dynamically calculate balance at a specific time `t`
  const calculateBalanceAt = (
    t: number,
    incomesList: Transaction[],
    expensesList: Transaction[]
  ): number => {
    if (t >= ledgerCreatedAt) {
      const incBetween = incomesList.filter(tx => tx.booking_date >= ledgerCreatedAt && tx.booking_date < t).reduce((sum, tx) => sum + tx.amount, 0);
      const expBetween = expensesList.filter(tx => tx.booking_date >= ledgerCreatedAt && tx.booking_date < t).reduce((sum, tx) => sum + tx.amount, 0);
      return currentLedgerBalance + incBetween - expBetween;
    } else {
      const incBetween = incomesList.filter(tx => tx.booking_date >= t && tx.booking_date < ledgerCreatedAt).reduce((sum, tx) => sum + tx.amount, 0);
      const expBetween = expensesList.filter(tx => tx.booking_date >= t && tx.booking_date < ledgerCreatedAt).reduce((sum, tx) => sum + tx.amount, 0);
      return currentLedgerBalance - incBetween + expBetween;
    }
  };

  // Split overall transaction lists
  const allExpenses = useMemo(() => transactions.filter(t => t.type === 'expense'), [transactions]);
  const allIncomes = useMemo(() => transactions.filter(t => t.type === 'income'), [transactions]);

  // Available Reserves is the current net balance
  const currentNetReserves = useMemo(() => {
    return calculateBalanceAt(Infinity, allIncomes, allExpenses);
  }, [allIncomes, allExpenses, currentLedgerBalance, ledgerCreatedAt]);

  // Persistent starting balance of the ledger (at the beginning of time)
  const startingBalanceCents = useMemo(() => {
    return calculateBalanceAt(-Infinity, allIncomes, allExpenses);
  }, [allIncomes, allExpenses, currentLedgerBalance, ledgerCreatedAt]);

  // Determine transaction classification by financial pillar
  const getTransactionPillar = (tx: Transaction): 'fixed' | 'agile' | 'retained' => {
    if (tx.type === 'income') return 'retained';
    if (fixedCategories.includes(tx.category_id || '')) return 'fixed';
    return 'agile';
  };

  // Filtered transactions computation
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    // Search Query (Counterparty / merchant / raw_data)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => 
        t.counterparty.toLowerCase().includes(q) || 
        (t.raw_data && t.raw_data.toLowerCase().includes(q))
      );
    }

    // Time Filter Boundaries
    const nowParts = getTimezoneDateParts(Date.now(), timezone);
    let startTimestamp = 0;
    let endTimestamp = Infinity;

    if (timeFilter === '30d') {
      startTimestamp = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 30, 0, 0, 0, timezone);
    } else if (timeFilter === '90d') {
      startTimestamp = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 90, 0, 0, 0, timezone);
    } else if (timeFilter === '180d') {
      startTimestamp = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 180, 0, 0, 0, timezone);
    } else if (timeFilter === 'this_year') {
      startTimestamp = getTimestampFromParts(nowParts.year, 1, 1, 0, 0, 0, timezone);
    } else if (timeFilter === 'custom') {
      if (customStartDate) {
        const [y, m, d] = customStartDate.split('-').map(Number);
        startTimestamp = getTimestampFromParts(y, m, d, 0, 0, 0, timezone);
      }
      if (customEndDate) {
        const [y, m, d] = customEndDate.split('-').map(Number);
        endTimestamp = getTimestampFromParts(y, m, d, 23, 59, 59, timezone);
      }
    }

    if (startTimestamp > 0) {
      list = list.filter(t => t.booking_date >= startTimestamp);
    }
    if (endTimestamp < Infinity) {
      list = list.filter(t => t.booking_date <= endTimestamp);
    }

    // Type Filter
    if (typeFilter !== 'all') {
      list = list.filter(t => t.type === typeFilter);
    }

    // Financial Pillar Filter
    if (pillarFilter !== 'all') {
      list = list.filter(t => getTransactionPillar(t) === pillarFilter);
    }

    // Category Selector
    if (selectedCategory !== 'all') {
      list = list.filter(t => t.category_id === selectedCategory || (selectedCategory === 'income' && t.type === 'income'));
    }

    // Amount Range
    const min = parseFloat(minAmount);
    if (!isNaN(min)) {
      list = list.filter(t => t.amount / 100 >= min);
    }
    const max = parseFloat(maxAmount);
    if (!isNaN(max)) {
      list = list.filter(t => t.amount / 100 <= max);
    }

    // Recurrence
    if (recurrenceFilter === 'recurring') {
      list = list.filter(t => t.recurrence !== undefined && t.recurrence !== null);
    } else if (recurrenceFilter === 'onetime') {
      list = list.filter(t => t.recurrence === undefined || t.recurrence === null);
    }

    return list.sort((a, b) => b.booking_date - a.booking_date);
  }, [transactions, searchQuery, timeFilter, customStartDate, customEndDate, typeFilter, pillarFilter, selectedCategory, minAmount, maxAmount, recurrenceFilter, fixedCategories, timezone]);

  // Paginated List
  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // Metric Calculations for current filter scope
  const { periodInflow, periodOutflow, periodNetFlow, periodFixedOutflow, periodAgileOutflow } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let fixed = 0;
    let agile = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'income') {
        inflow += t.amount;
      } else {
        outflow += t.amount;
        if (fixedCategories.includes(t.category_id || '')) {
          fixed += t.amount;
        } else {
          agile += t.amount;
        }
      }
    });

    return {
      periodInflow: inflow,
      periodOutflow: outflow,
      periodNetFlow: inflow - outflow,
      periodFixedOutflow: fixed,
      periodAgileOutflow: agile
    };
  }, [filteredTransactions, fixedCategories]);

  // Compute Runway Metrics
  const { monthlyBurnRate, runwayMonths, runwayStatus } = useMemo(() => {
    // We calculate monthly burn rate from current period outflow.
    // First, determine duration of active filter scope in days.
    let scopeDays = 30;
    const nowParts = getTimezoneDateParts(Date.now(), timezone);

    if (timeFilter === '30d') scopeDays = 30;
    else if (timeFilter === '90d') scopeDays = 90;
    else if (timeFilter === '180d') scopeDays = 180;
    else if (timeFilter === 'this_year') {
      const yearStart = getTimestampFromParts(nowParts.year, 1, 1, 0, 0, 0, timezone);
      scopeDays = Math.max(1, (Date.now() - yearStart) / (1000 * 60 * 60 * 24));
    } else if (timeFilter === 'custom' && customStartDate && customEndDate) {
      const start = Date.parse(customStartDate);
      const end = Date.parse(customEndDate);
      scopeDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
    } else {
      // 'all' time or fallback: span from first transaction to today
      if (transactions.length > 0) {
        const oldestTx = transactions[transactions.length - 1].booking_date;
        scopeDays = Math.max(1, (Date.now() - oldestTx) / (1000 * 60 * 60 * 24));
      }
    }

    const burnRate = (periodOutflow / scopeDays) * 30.417; // Normalized average monthly expenses
    const runway = burnRate > 0 ? (currentNetReserves / burnRate) : Infinity;

    let status: 'safe' | 'warning' | 'danger' = 'safe';
    if (runway < 3) status = 'danger';
    else if (runway < 6) status = 'warning';

    return {
      monthlyBurnRate: burnRate,
      runwayMonths: runway,
      runwayStatus: status
    };
  }, [periodOutflow, timeFilter, customStartDate, customEndDate, currentNetReserves, transactions, timezone]);

  // Savings rate for selected period
  const savingsRate = useMemo(() => {
    if (periodInflow <= 0) return 0;
    return ((periodInflow - periodOutflow) / periodInflow) * 100;
  }, [periodInflow, periodOutflow]);

  // Category change wrapper
  const handleCategoryChange = async (tx: Transaction, newCatId: string) => {
    // If setting to income, make it income, otherwise expense
    const updatedTx: Transaction = {
      ...tx,
      category_id: newCatId === 'income' ? null : newCatId,
      type: newCatId === 'income' ? 'income' : 'expense'
    };
    await onUpdateTransaction(updatedTx);
  };

  // Toggle category inside "Fixed Base" list
  const toggleFixedCategory = async (catId: string) => {
    let updatedList = [...fixedCategories];
    if (updatedList.includes(catId)) {
      updatedList = updatedList.filter(id => id !== catId);
    } else {
      updatedList.push(catId);
    }
    await onUpdateConfig('fixed_categories', JSON.stringify(updatedList));
  };

  // Generate chart data chronologically
  const chartData = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    // Identify active date range
    let startTs = 0;
    let endTs = Date.now();
    const nowParts = getTimezoneDateParts(Date.now(), timezone);

    if (timeFilter === '30d') {
      startTs = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 30, 0, 0, 0, timezone);
    } else if (timeFilter === '90d') {
      startTs = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 90, 0, 0, 0, timezone);
    } else if (timeFilter === '180d') {
      startTs = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 180, 0, 0, 0, timezone);
    } else if (timeFilter === 'this_year') {
      startTs = getTimestampFromParts(nowParts.year, 1, 1, 0, 0, 0, timezone);
    } else if (timeFilter === 'custom') {
      if (customStartDate) {
        const [y, m, d] = customStartDate.split('-').map(Number);
        startTs = getTimestampFromParts(y, m, d, 0, 0, 0, timezone);
      }
      if (customEndDate) {
        const [y, m, d] = customEndDate.split('-').map(Number);
        endTs = getTimestampFromParts(y, m, d, 23, 59, 59, timezone);
      }
    } else {
      // all time: start from oldest tx
      const sortedAll = [...transactions].sort((a, b) => a.booking_date - b.booking_date);
      startTs = sortedAll.length > 0 ? sortedAll[0].booking_date : ledgerCreatedAt;
    }

    const rangeDays = (endTs - startTs) / (1000 * 60 * 60 * 24);
    const dataPoints: { 
      date: number; 
      label: string; 
      balance: number; 
      income: number; 
      expense: number;
      intervalIncome: number;
      intervalExpense: number;
      intervalNet: number;
    }[] = [];

    // Grouping strategy: Daily for < 45 days, Weekly for < 180 days, Monthly otherwise
    if (rangeDays < 45) {
      // Daily points
      const count = Math.ceil(rangeDays);
      const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      
      for (let i = 0; i <= count; i++) {
        const dateStart = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - count + i, 0, 0, 0, timezone);
        const dateEnd = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - count + i + 1, 0, 0, 0, timezone);
        const p = getTimezoneDateParts(dateStart, timezone);
        const label = `${monthsAbbr[p.month - 1]} ${p.day}`;

        // Get transactions up to this dateEnd
        const balanceAtEnd = calculateBalanceAt(dateEnd, allIncomes, allExpenses) / 100;
        
        // Cumulative inflow & outflow strictly inside this period
        const incVal = allIncomes
          .filter(t => t.booking_date >= startTs && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
        const expVal = allExpenses
          .filter(t => t.booking_date >= startTs && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;

        // Interval net flow (daily)
        const intInc = allIncomes
          .filter(t => t.booking_date >= dateStart && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
        const intExp = allExpenses
          .filter(t => t.booking_date >= dateStart && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;

        dataPoints.push({
          date: dateEnd,
          label,
          balance: Math.round(balanceAtEnd),
          income: Math.round(incVal),
          expense: Math.round(expVal),
          intervalIncome: Math.round(intInc),
          intervalExpense: Math.round(intExp),
          intervalNet: Math.round(intInc - intExp)
        });
      }
    } else if (rangeDays < 180) {
      // Weekly points
      const weeks = Math.ceil(rangeDays / 7);
      const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      
      for (let i = 0; i <= weeks; i++) {
        const dateStart = i === 0 ? startTs : startTs + ((i - 1) * 7 * 24 * 60 * 60 * 1000);
        const dateEnd = startTs + (i * 7 * 24 * 60 * 60 * 1000);
        const p = getTimezoneDateParts(dateEnd, timezone);
        const label = `${monthsAbbr[p.month - 1]} ${p.day}`;

        const balanceAtEnd = calculateBalanceAt(dateEnd, allIncomes, allExpenses) / 100;
        const incVal = allIncomes
          .filter(t => t.booking_date >= startTs && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
        const expVal = allExpenses
          .filter(t => t.booking_date >= startTs && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;

        // Interval net flow (weekly)
        const intInc = allIncomes
          .filter(t => t.booking_date >= dateStart && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
        const intExp = allExpenses
          .filter(t => t.booking_date >= dateStart && t.booking_date < dateEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;

        dataPoints.push({
          date: dateEnd,
          label,
          balance: Math.round(balanceAtEnd),
          income: Math.round(incVal),
          expense: Math.round(expVal),
          intervalIncome: Math.round(intInc),
          intervalExpense: Math.round(intExp),
          intervalNet: Math.round(intInc - intExp)
        });
      }
    } else {
      // Monthly points
      // We calculate month by month
      const startParts = getTimezoneDateParts(startTs, timezone);
      const endParts = getTimezoneDateParts(endTs, timezone);
      const totalMonths = (endParts.year - startParts.year) * 12 + (endParts.month - startParts.month);
      const monthsAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      for (let i = 0; i <= totalMonths; i++) {
        const monthStart = getTimestampFromParts(startParts.year, startParts.month + i, 1, 0, 0, 0, timezone);
        const monthEnd = getTimestampFromParts(startParts.year, startParts.month + i + 1, 1, 0, 0, 0, timezone);
        const mParts = getTimezoneDateParts(monthStart, timezone);
        const label = `${monthsAbbr[mParts.month - 1]} '${String(mParts.year).slice(-2)}`;

        const balanceAtEnd = calculateBalanceAt(monthEnd, allIncomes, allExpenses) / 100;
        const incVal = allIncomes
          .filter(t => t.booking_date >= startTs && t.booking_date < monthEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
        const expVal = allExpenses
          .filter(t => t.booking_date >= startTs && t.booking_date < monthEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;

        // Interval net flow (monthly)
        const intInc = allIncomes
          .filter(t => t.booking_date >= monthStart && t.booking_date < monthEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;
        const intExp = allExpenses
          .filter(t => t.booking_date >= monthStart && t.booking_date < monthEnd)
          .reduce((sum, t) => sum + t.amount, 0) / 100;

        dataPoints.push({
          date: monthEnd,
          label,
          balance: Math.round(balanceAtEnd),
          income: Math.round(incVal),
          expense: Math.round(expVal),
          intervalIncome: Math.round(intInc),
          intervalExpense: Math.round(intExp),
          intervalNet: Math.round(intInc - intExp)
        });
      }
    }

    return dataPoints;
  }, [filteredTransactions, transactions, timeFilter, customStartDate, customEndDate, allIncomes, allExpenses, ledgerCreatedAt, timezone, currentLedgerBalance]);

  return (
    <div ref={containerRef} className="min-h-screen bg-surface-dark flex flex-col relative overflow-y-auto selection:bg-nature-green selection:text-surface-dark pb-16">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-nature-green/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-ocean-blue/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-white/5 sticky top-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={onBack}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer shrink-0"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-sm sm:text-lg font-black text-on-surface tracking-tight leading-none truncate">Reserves Flow Analysis</h1>
              <span className="text-[9px] sm:text-[10px] text-on-surface-variant/70 font-mono uppercase tracking-widest mt-1 truncate">
                Vault: {activeVaultName}
              </span>
            </div>
          </div>
          <button 
            onClick={() => setIsFixedConfigOpen(true)}
            className="h-8 sm:h-9 px-3 sm:px-4.5 rounded-full flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/10 hover:border-nature-green/30 transition-all cursor-pointer shrink-0"
            title="Configure Fixed Base Categories"
          >
            <Settings2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Pillar Settings</span>
          </button>
        </div>
      </header>

      {/* Main Flow Content */}
      <main className="flex-grow flex flex-col px-4 sm:px-6 max-w-5xl mx-auto w-full py-6 sm:py-8 z-10 gap-6 sm:gap-8">
        
        {/* Metric Summary Cards Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* Available Reserves Card */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between min-h-28 relative overflow-hidden lg:col-span-2">
            <div className="absolute top-0 right-0 w-32 h-32 bg-nature-green/5 blur-2xl rounded-full pointer-events-none" />
            <div>
              <h2 className="text-[9px] font-bold text-on-surface-variant tracking-[0.18em] uppercase mb-1">Available Reserves</h2>
              <div className="text-3xl font-light tracking-tight text-on-surface font-sans flex items-baseline gap-1">
                <span className="text-lg text-on-surface-variant">{currency}</span>
                {formatAmount(currentNetReserves, '', thousandsSeparator, true)}
              </div>
            </div>
            <div className="text-[10px] text-on-surface-variant/80 font-mono mt-3 pt-2 border-t border-white/5">
              Math: {formatAmount(startingBalanceCents, currency, thousandsSeparator, false)} (Starting) + {formatAmount(allIncomes.reduce((sum, tx) => sum + tx.amount, 0), currency, thousandsSeparator, false)} In - {formatAmount(allExpenses.reduce((sum, tx) => sum + tx.amount, 0), currency, thousandsSeparator, false)} Out
            </div>
          </div>

          {/* Period Net Flow Card */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between min-h-28">
            <div>
              <h2 className="text-[9px] font-bold text-on-surface-variant tracking-[0.18em] uppercase mb-1">Period Net Flow</h2>
              <div className={cn("text-2xl font-semibold tracking-tight font-sans flex items-baseline gap-0.5", periodNetFlow >= 0 ? "text-nature-green" : "text-earth-clay")}>
                <span>{periodNetFlow >= 0 ? '+' : ''}</span>
                {formatAmount(periodNetFlow, currency, thousandsSeparator, true)}
              </div>
            </div>
            <div className="flex gap-3 text-[10px] text-on-surface-variant mt-3 font-medium">
              <span className="flex items-center gap-0.5 text-nature-green"><ArrowUp className="w-3 h-3"/>{formatAmount(periodInflow, '', thousandsSeparator, false)}</span>
              <span className="flex items-center gap-0.5 text-earth-clay"><ArrowDown className="w-3 h-3"/>{formatAmount(periodOutflow, '', thousandsSeparator, false)}</span>
            </div>
          </div>

          {/* Reserves Runway Card */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between min-h-28 relative overflow-hidden">
            {runwayStatus === 'danger' && (
              <div className="absolute top-0 right-0 w-2 h-full bg-earth-clay" />
            )}
            {runwayStatus === 'warning' && (
              <div className="absolute top-0 right-0 w-2 h-full bg-sand-gold" />
            )}
            <div>
              <h2 className="text-[9px] font-bold text-on-surface-variant tracking-[0.18em] uppercase mb-1">Reserves Runway</h2>
              <div className="text-2xl font-semibold tracking-tight text-on-surface font-sans flex items-baseline gap-1">
                {runwayMonths === Infinity ? (
                  <span className="text-nature-green">Infinite</span>
                ) : (
                  <>
                    <span>{runwayMonths.toFixed(1)}</span>
                    <span className="text-xs text-on-surface-variant font-normal">months</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-[9px] font-mono tracking-wide uppercase mt-3 flex items-center gap-1">
              {runwayStatus === 'danger' && <span className="text-earth-clay font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Critical Scope</span>}
              {runwayStatus === 'warning' && <span className="text-sand-gold font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Moderate runway</span>}
              {runwayStatus === 'safe' && <span className="text-nature-green font-bold flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Safe runway</span>}
            </div>
          </div>

          {/* Period Savings Rate Card */}
          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between min-h-28">
            <div>
              <h2 className="text-[9px] font-bold text-on-surface-variant tracking-[0.18em] uppercase mb-1">Period Savings Rate</h2>
              <div className={cn("text-2xl font-semibold tracking-tight font-sans", savingsRate >= 0 ? "text-nature-green" : "text-earth-clay")}>
                {savingsRate.toFixed(1)}%
              </div>
            </div>
            <div className="text-[10px] text-on-surface-variant mt-3 font-medium truncate">
              Burn rate: {formatAmount(monthlyBurnRate, currency, thousandsSeparator, false)}/mo
            </div>
          </div>

        </section>

        {/* Advanced Filters Card */}
        <section className="glass-card rounded-3xl p-5 sm:p-6 border border-white/5 flex flex-col gap-0 overflow-hidden">
          <div 
            onClick={() => setIsFiltersExpanded(prev => !prev)}
            className="flex items-center justify-between cursor-pointer select-none py-1"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-on-surface-variant" />
              <h3 className="text-xs font-bold text-on-surface uppercase tracking-widest font-mono">Scope Filters</h3>
              {activeFiltersCount > 0 && (
                <span className="bg-nature-green/10 border border-nature-green/20 text-nature-green text-[9px] font-mono px-2.5 py-0.5 rounded-full font-bold">
                  {activeFiltersCount} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {activeFiltersCount > 0 && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetFilters();
                  }}
                  className="text-[9px] font-mono uppercase tracking-wider text-nature-green hover:underline cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
              <motion.div
                animate={{ rotate: isFiltersExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-on-surface-variant" />
              </motion.div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isFiltersExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                className="overflow-hidden flex flex-col gap-4 border-t border-white/5 pt-4"
              >
                {/* Row 1: Search & Time Period */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* Store search */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Text Search</label>
                    <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Search merchant, ID, raw logs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-nature-green/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Time preset */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Date Range</label>
                    <div className="relative group">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors pointer-events-none" />
                      <select 
                        value={timeFilter}
                        onChange={e => setTimeFilter(e.target.value as any)}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="all">All Time</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="180d">Last 180 Days</option>
                        <option value="this_year">This Year</option>
                        <option value="custom">Custom Date Range...</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                    </div>
                  </div>

                  {/* Pillar Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Financial Pillar</label>
                    <div className="relative group">
                      <Bookmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors pointer-events-none" />
                      <select 
                        value={pillarFilter}
                        onChange={e => setPillarFilter(e.target.value as any)}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="all">All Pillars</option>
                        <option value="fixed">Fixed Base (Expenses)</option>
                        <option value="agile">Agile Spend (Expenses)</option>
                        <option value="retained">Retained (Income)</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                    </div>
                  </div>

                </div>

                {/* Row 2: Type, Category, Amount & Recurrence */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-white/5 pt-4">
                  
                  {/* Flow Type */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Flow Type</label>
                    <div className="relative group">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors pointer-events-none" />
                      <select 
                        value={typeFilter}
                        onChange={e => {
                          setTypeFilter(e.target.value as any);
                          setSelectedCategory('all'); // Clear category to avoid conflicts
                        }}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="all">All Flows</option>
                        <option value="income">Inflow (Income)</option>
                        <option value="expense">Outflow (Expense)</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                    </div>
                  </div>

                  {/* Category Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Category</label>
                    <div className="relative group">
                      <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors pointer-events-none" />
                      <select 
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl pl-9 pr-4 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="all">All Categories</option>
                        {typeFilter !== 'expense' && (
                          <option value="income">Income Stream</option>
                        )}
                        {typeFilter !== 'income' && categories.filter(c => c.id !== 'income').map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
                    </div>
                  </div>

                  {/* Amount Range */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Amount Range ({currency})</label>
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                      <input 
                        type="number" 
                        placeholder="Min"
                        value={minAmount}
                        onChange={e => setMinAmount(e.target.value)}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2.5 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-nature-green/50 transition-colors"
                      />
                      <input 
                        type="number" 
                        placeholder="Max"
                        value={maxAmount}
                        onChange={e => setMaxAmount(e.target.value)}
                        className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2.5 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-nature-green/50 transition-colors"
                      />
                      <div className="relative col-span-2 sm:col-span-auto sm:shrink-0">
                        <select 
                          value={recurrenceFilter}
                          onChange={e => setRecurrenceFilter(e.target.value as any)}
                          className="w-full sm:w-auto bg-surface-dark border border-white/10 rounded-xl px-3 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 appearance-none pr-8 cursor-pointer"
                        >
                          <option value="all">All Freq</option>
                          <option value="recurring">Recurring</option>
                          <option value="onetime">One-time</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
                      </div>
                    </div>
                  </div>

                </div>

                {/* Custom Date Selection Panel */}
                <AnimatePresence>
                  {timeFilter === 'custom' && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4 overflow-hidden"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Start Date</label>
                        <input 
                          type="date" 
                          value={customStartDate}
                          onChange={e => setCustomStartDate(e.target.value)}
                          className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-2 text-xs text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors scheme-dark font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">End Date</label>
                        <input 
                          type="date" 
                          value={customEndDate}
                          onChange={e => setCustomEndDate(e.target.value)}
                          className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-2 text-xs text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors scheme-dark font-mono"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Dynamic Trend Area Chart Section */}
        <section className="w-full space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
            <h3 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase font-mono">Reserves Trend & Growth</h3>
            
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-on-surface-variant">Presets:</span>
              <div className="flex bg-white/5 p-0.5 rounded-full border border-white/5 shrink-0">
                <button
                  onClick={() => applyPreset('balance')}
                  className={cn(
                    "px-3.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                    chartPreset === 'balance'
                      ? "bg-nature-green text-surface-dark shadow-[0_2px_10px_rgba(123,160,91,0.3)]"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  Reserves
                </button>
                <button
                  onClick={() => applyPreset('cumulative')}
                  className={cn(
                    "px-3.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                    chartPreset === 'cumulative'
                      ? "bg-ocean-blue text-surface-dark shadow-[0_2px_10px_rgba(92,124,138,0.3)]"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  Cumulative
                </button>
                <button
                  onClick={() => applyPreset('interval')}
                  className={cn(
                    "px-3.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                    chartPreset === 'interval'
                      ? "bg-plum-purple text-surface-dark shadow-[0_2px_10px_rgba(139,107,123,0.3)]"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  Intervals
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Checkbox Filters for Custom Layers */}
          <div className="glass-card rounded-2xl p-4 border border-white/5 flex flex-wrap gap-x-6 gap-y-2.5 text-[10px] font-mono text-on-surface-variant select-none">
            <span className="font-bold text-on-surface uppercase tracking-wider pr-3 border-r border-white/10 flex items-center shrink-0">
              Graph Layers
            </span>
            
            <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
              <input 
                type="checkbox"
                checked={showReservesArea}
                onChange={e => {
                  setShowReservesArea(e.target.checked);
                  setChartPreset('custom');
                }}
                className="rounded border-white/10 text-nature-green focus:ring-0 focus:ring-offset-0 bg-surface-dark w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-nature-green shrink-0"/>Reserves Area (Left Y)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
              <input 
                type="checkbox"
                checked={showNetBars}
                onChange={e => {
                  setShowNetBars(e.target.checked);
                  setChartPreset('custom');
                }}
                className="rounded border-white/10 text-nature-green focus:ring-0 focus:ring-offset-0 bg-surface-dark w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-nature-green opacity-40 shrink-0"/>Net Flow Bars (Right Y)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
              <input 
                type="checkbox"
                checked={showInflowLine}
                onChange={e => {
                  setShowInflowLine(e.target.checked);
                  setChartPreset('custom');
                }}
                className="rounded border-white/10 text-nature-green focus:ring-0 focus:ring-offset-0 bg-surface-dark w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-sky-teal shrink-0"/>Interval Inflow (Right Y)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
              <input 
                type="checkbox"
                checked={showOutflowLine}
                onChange={e => {
                  setShowOutflowLine(e.target.checked);
                  setChartPreset('custom');
                }}
                className="rounded border-white/10 text-nature-green focus:ring-0 focus:ring-offset-0 bg-surface-dark w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-earth-clay shrink-0"/>Interval Outflow (Right Y)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
              <input 
                type="checkbox"
                checked={showCumInflow}
                onChange={e => {
                  setShowCumInflow(e.target.checked);
                  setChartPreset('custom');
                }}
                className="rounded border-white/10 text-nature-green focus:ring-0 focus:ring-offset-0 bg-surface-dark w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-sky-teal opacity-30 shrink-0"/>Cum. Inflow Area (Left Y)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer hover:text-on-surface transition-colors">
              <input 
                type="checkbox"
                checked={showCumOutflow}
                onChange={e => {
                  setShowCumOutflow(e.target.checked);
                  setChartPreset('custom');
                }}
                className="rounded border-white/10 text-nature-green focus:ring-0 focus:ring-offset-0 bg-surface-dark w-3.5 h-3.5 cursor-pointer"
              />
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-earth-clay opacity-30 shrink-0"/>Cum. Outflow Area (Left Y)</span>
            </label>
          </div>

          <div className="h-80 w-full glass-card rounded-[2rem] p-6 relative overflow-hidden group pb-8">
            {chartData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant/60 text-xs font-mono">
                No matching transactions to generate data points.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 15, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-nature-green)" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="var(--color-nature-green)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-sky-teal)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--color-sky-teal)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-earth-clay)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--color-earth-clay)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid stroke="rgba(255,255,255,0.015)" strokeDasharray="3 3" vertical={false} />
                  
                  <XAxis 
                    dataKey="label" 
                    stroke="var(--color-on-surface-variant)" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10}
                    fontFamily="monospace"
                  />
                  
                  <YAxis 
                    yAxisId="balance"
                    stroke="var(--color-nature-green)" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false}
                    dx={-10}
                    fontFamily="monospace"
                    tickFormatter={(value) => `${currency}${value.toLocaleString()}`}
                  />

                  <YAxis 
                    yAxisId="flow"
                    orientation="right"
                    stroke="var(--color-ocean-blue)" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false}
                    dx={10}
                    fontFamily="monospace"
                    tickFormatter={(value) => `${currency}${value.toLocaleString()}`}
                  />
                  
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Reference line for baseline flow at y=0 */}
                  {showNetBars && (
                    <ReferenceLine yAxisId="flow" y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                  )}

                  {/* 1. Reserves Area (Left Axis) */}
                  {showReservesArea && (
                    <Area 
                      yAxisId="balance"
                      type="monotone" 
                      dataKey="balance" 
                      stroke="var(--color-nature-green)" 
                      strokeWidth={2.5}
                      fillOpacity={1} 
                      fill="url(#colorBalance)" 
                      animationDuration={600}
                    />
                  )}

                  {/* 2. Cumulative Inflow (Left Axis) */}
                  {showCumInflow && (
                    <Area 
                      yAxisId="balance"
                      type="monotone" 
                      dataKey="income" 
                      stroke="var(--color-sky-teal)" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorIncome)" 
                      animationDuration={600}
                    />
                  )}

                  {/* 3. Cumulative Outflow (Left Axis) */}
                  {showCumOutflow && (
                    <Area 
                      yAxisId="balance"
                      type="monotone" 
                      dataKey="expense" 
                      stroke="var(--color-earth-clay)" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorExpense)" 
                      animationDuration={600}
                    />
                  )}

                  {/* 4. Interval Net Flow Bars (Right Axis) */}
                  {showNetBars && (
                    <Bar 
                      yAxisId="flow"
                      dataKey="intervalNet" 
                      radius={[4, 4, 0, 0]}
                      animationDuration={600}
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.intervalNet >= 0 ? "var(--color-nature-green)" : "var(--color-earth-clay)"} 
                          opacity={0.35}
                        />
                      ))}
                    </Bar>
                  )}

                  {/* 5. Interval Inflow Line (Right Axis) */}
                  {showInflowLine && (
                    <Line 
                      yAxisId="flow"
                      type="monotone" 
                      dataKey="intervalIncome" 
                      stroke="var(--color-sky-teal)" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      animationDuration={600}
                    />
                  )}

                  {/* 6. Interval Outflow Line (Right Axis) */}
                  {showOutflowLine && (
                    <Line 
                      yAxisId="flow"
                      type="monotone" 
                      dataKey="intervalExpense" 
                      stroke="var(--color-earth-clay)" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      animationDuration={600}
                    />
                  )}

                  {/* Slider brush for timeframe zooming */}
                  <Brush 
                    dataKey="label" 
                    height={20} 
                    stroke="rgba(255,255,255,0.06)" 
                    fill="var(--surface-dark)"
                    tickFormatter={() => ''}
                  />

                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Ledger Transaction History */}
        <section ref={txListRef} className="scroll-mt-24 flex flex-col gap-3">
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase font-mono">
              Ledger Flow ({filteredTransactions.length} items)
            </h3>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant text-xs border border-white/5 border-dashed rounded-3xl font-mono">
              No transactions match the selected filters.
            </div>
          ) : (
            paginatedTransactions.map(tx => {
              const pillar = getTransactionPillar(tx);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={tx.id}
                  onClick={() => setActiveTx(tx)}
                  className="glass-card rounded-2xl p-4 border border-white/5 flex flex-col md:flex-row md:items-center justify-between hover:bg-white/[0.02] transition-all cursor-pointer gap-4 md:gap-0"
                >
                  {/* Left block: Icon, Name and Date */}
                  <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                    <div className="w-10 h-10 rounded-full bg-surface-dark border border-white/5 flex items-center justify-center shrink-0">
                      {tx.type === 'income' ? (
                        <ArrowUp className="w-4 h-4 text-nature-green" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-earth-clay" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-on-surface truncate max-w-full">{tx.counterparty}</span>
                        
                        {/* Pillar Badge */}
                        {pillar === 'fixed' && (
                          <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-ocean-blue/15 text-ocean-blue border border-ocean-blue/20">
                            Fixed Base
                          </span>
                        )}
                        {pillar === 'agile' && (
                          <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-earth-clay/15 text-earth-clay border border-earth-clay/20">
                            Agile Spend
                          </span>
                        )}
                        {pillar === 'retained' && (
                          <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-nature-green/15 text-nature-green border border-nature-green/20">
                            Retained
                          </span>
                        )}

                        {/* Recurrence Indicator */}
                        {tx.recurrence && (
                          <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-white/5 text-on-surface-variant flex items-center gap-1 border border-white/5">
                            <Clock className="w-2.5 h-2.5" /> Recur
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
                        {formatDate(tx.booking_date, dateFormat, timezone)}
                      </div>
                    </div>
                  </div>

                  {/* Right block: Category Selector and Amount */}
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto shrink-0" onClick={e => e.stopPropagation()}>
                    <select
                      value={tx.type === 'income' ? 'income' : (tx.category_id || 'other')}
                      onChange={e => handleCategoryChange(tx, e.target.value)}
                      className="w-32 bg-surface-dark border border-white/10 rounded-lg px-2 py-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface focus:outline-none focus:border-nature-green/30 transition-colors appearance-none cursor-pointer text-center"
                    >
                      <option value="income">Income</option>
                      {categories.filter(c => c.id !== 'income').map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>

                    <div className={cn("font-mono font-bold text-right md:w-32 shrink-0 text-sm", tx.type === 'income' ? 'text-nature-green' : 'text-on-surface')}>
                      {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount, currency, thousandsSeparator, true)}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}

          {/* Pagination Controls */}
          {filteredTransactions.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-2 py-4 border-t border-white/5 font-mono">
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-surface-dark border border-white/10 rounded-lg px-2.5 py-1 text-xs text-on-surface hover:text-nature-green focus:outline-none focus:border-nature-green/30 transition-all cursor-pointer font-bold"
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>items per page</span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <button
                  disabled={currentPage === 1}
                  onClick={() => {
                    setCurrentPage(prev => Math.max(1, prev - 1));
                    txListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant cursor-pointer font-bold"
                >
                  Prev
                </button>
                <span className="text-[11px] font-bold text-on-surface-variant">
                  Page {currentPage} of {Math.max(1, totalPages)}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => {
                    setCurrentPage(prev => Math.min(totalPages, prev + 1));
                    txListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant cursor-pointer font-bold"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

      </main>

      {/* Fixed Pillar Configuration Modal */}
      <AnimatePresence>
        {isFixedConfigOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-dark/80 backdrop-blur-md" onClick={() => setIsFixedConfigOpen(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-md bg-surface-container rounded-[2rem] p-8 border border-white/5 shadow-2xl flex flex-col gap-6"
            >
              <button 
                onClick={() => setIsFixedConfigOpen(false)} 
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant flex items-center justify-center transition-all cursor-pointer hover:text-on-surface"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1.5 text-center sm:text-left">
                <h3 className="text-lg font-bold text-on-surface">Pillar Classification Settings</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Select which expense categories should be classified as part of your **Fixed Base** pillar. Other categories default to **Agile Spend**.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-4 border border-white/5 max-h-60 overflow-y-auto space-y-2.5">
                {categories.filter(c => c.id !== 'income').map(cat => {
                  const isFixed = fixedCategories.includes(cat.id);
                  const Icon = ICON_MAP[cat.icon] || ICON_MAP['Tag'];
                  return (
                    <div 
                      key={cat.id}
                      onClick={() => toggleFixedCategory(cat.id)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none",
                        isFixed 
                          ? "bg-ocean-blue/10 border-ocean-blue/30 text-on-surface"
                          : "bg-surface-dark/40 border-white/5 text-on-surface-variant hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center bg-white/5", cat.color)}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold">{cat.label}</span>
                      </div>
                      
                      <div className="flex items-center">
                        <div className={cn("w-4.5 h-4.5 rounded border flex items-center justify-center transition-all", isFixed ? "bg-ocean-blue border-ocean-blue" : "border-white/20")}>
                          {isFixed && <div className="w-2 h-2 bg-surface-dark rounded-full" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => setIsFixedConfigOpen(false)}
                className="w-full h-11 rounded-2xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-mono font-bold uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-md"
              >
                Apply & Save Changes
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Raw Details Modal */}
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
                    <h3 className="text-base font-bold text-on-surface">{activeTx.counterparty}</h3>
                    <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-wider mt-0.5">
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
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-mono">Amount</span>
                  <span className={cn("font-mono font-bold text-base", activeTx.type === 'income' ? 'text-nature-green' : 'text-on-surface')}>
                    {activeTx.type === 'income' ? '+' : '-'}{formatAmount(activeTx.amount, currency, thousandsSeparator, true)}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/5">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-mono">Pillar Category</span>
                  <span className="font-bold text-on-surface text-xs font-mono uppercase tracking-wider">
                    {getTransactionPillar(activeTx)}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/5">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-mono">Recurrence</span>
                  <span className="font-bold text-on-surface text-xs font-mono uppercase tracking-wider">
                    {activeTx.recurrence ? `${activeTx.recurrence.interval} ${activeTx.recurrence.unit}` : 'None'}
                  </span>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest font-mono flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5" /> Raw Source Data
                  </span>
                  <code className="bg-surface-dark rounded-lg p-3 text-[10px] text-on-surface-variant font-mono break-all whitespace-pre-wrap leading-relaxed select-text cursor-text border border-white/5">
                    {activeTx.raw_data || 'Manual Entry Record'}
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
