import { motion, AnimatePresence } from 'motion/react';
import { X, Store, Calendar, Repeat, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { useCategories, ICON_MAP } from '../lib/categories';
import { formatTime } from '../lib/formatters';

interface ManualExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  currency: string;
  timezone: string;
}

export default function ManualExpenseModal({ isOpen, onClose, onSave, currency, timezone }: ManualExpenseModalProps) {
  const [amount, setAmount] = useState('0');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [counterparty, setCounterparty] = useState('');
  const [activeCategory, setActiveCategory] = useState('food');
  const [isRepeating, setIsRepeating] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceUnit, setRecurrenceUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('months');
  const [errorMessage, setErrorMessage] = useState('');

  const { categories } = useCategories();

  // Reset error on open/type switch
  useEffect(() => {
    setErrorMessage('');
  }, [isOpen, type]);

  if (!isOpen) return null;

  const handleSave = () => {
    setErrorMessage('');
    const parsedAmount = parseFloat(amount);
    
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    const cents = Math.round(parsedAmount * 100);

    const tx: Transaction = {
      id: crypto.randomUUID(),
      booking_date: Date.now(),
      amount: cents,
      currency: currency,
      counterparty: counterparty.trim() || (type === 'expense' ? 'Manual Expense' : 'Manual Income'),
      category_id: type === 'expense' ? activeCategory : null,
      type: type,
      ...(isRepeating && {
        recurrence: {
          interval: recurrenceInterval,
          unit: recurrenceUnit
        }
      })
    };

    onSave(tx);
    
    // Reset states on successful save
    setAmount('0');
    setCounterparty('');
    setActiveCategory('food');
    setIsRepeating(false);
    setRecurrenceInterval(1);
    setRecurrenceUnit('months');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#0D1311]/80 backdrop-blur-md" 
        />
        
        <motion.main 
          initial={{ scale: 0.95, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 15, opacity: 0 }}
          className="relative w-full max-w-[420px] bg-surface-container border border-white/10 light:border-black/5 p-6 rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
        >
          {/* Dynamic Background Glow based on type */}
          <div className={cn(
            "absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[70px] pointer-events-none transition-all duration-700 opacity-20",
            type === 'expense' ? "bg-earth-clay" : "bg-nature-green"
          )} />

          {/* Header */}
          <header className="flex justify-between items-center mb-6 z-10 relative">
            <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-on-surface-variant">Add Record</h3>
            <button 
              onClick={onClose} 
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Type Toggle Selector */}
          <div className="flex justify-center mb-6 z-10 relative">
            <div className="flex bg-surface-dark border border-white/5 light:border-black/5 rounded-full p-1 shadow-inner">
              <button 
                onClick={() => setType('expense')}
                className={cn(
                  "px-6 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded-full transition-all duration-300 cursor-pointer",
                  type === 'expense' 
                    ? "bg-earth-clay text-[#1A2521] shadow-md scale-102" 
                    : "text-on-surface-variant hover:text-earth-clay"
                )}
              >
                Expense
              </button>
              <button 
                onClick={() => setType('income')}
                className={cn(
                  "px-6 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded-full transition-all duration-300 cursor-pointer",
                  type === 'income' 
                    ? "bg-nature-green text-[#1A2521] shadow-md scale-102" 
                    : "text-on-surface-variant hover:text-nature-green"
                )}
              >
                Income
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <section className="flex flex-col items-center justify-center mb-6 py-4 bg-surface-dark/40 rounded-2xl border border-white/5 light:border-black/5 z-10 relative">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2">Transaction Amount</span>
            <div className={cn(
              "flex items-baseline transition-colors duration-500",
              type === 'expense' ? "text-earth-clay" : "text-nature-green"
            )}>
              <span className="text-3xl font-black mr-1 opacity-40">{currency}</span>
              <input 
                autoFocus
                type="text" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "bg-transparent border-none outline-none focus:ring-0 text-5xl font-black w-[180px] text-center p-0 placeholder-on-surface-variant/30 transition-colors duration-500",
                  type === 'expense' ? "text-earth-clay caret-earth-clay" : "text-nature-green caret-nature-green"
                )}
              />
            </div>
          </section>

          {/* Context Inputs */}
          <section className="flex flex-col gap-3.5 mb-6 z-10 relative">
            <div className={cn(
              "flex items-center bg-surface-dark border border-white/5 light:border-black/5 rounded-2xl px-4 h-14 transition-all group",
              type === 'expense' 
                ? "focus-within:border-earth-clay/50" 
                : "focus-within:border-nature-green/50"
            )}>
              <Store className={cn(
                "w-4 h-4 mr-3 transition-colors",
                type === 'expense' ? "text-on-surface-variant group-focus-within:text-earth-clay" : "text-on-surface-variant group-focus-within:text-nature-green"
              )} />
              <input 
                type="text" 
                placeholder="Merchant or description..."
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                className="bg-transparent border-none outline-none focus:ring-0 w-full text-sm text-on-surface placeholder:text-on-surface-variant/30 p-0"
              />
            </div>
            
            <div className="flex items-center bg-surface-dark border border-white/5 light:border-black/5 rounded-2xl px-4 h-14 text-left">
              <Calendar className="w-4 h-4 text-on-surface-variant mr-3" />
              <span className="text-on-surface text-xs flex-1 font-mono">Today, {formatTime(Date.now(), timezone)}</span>
            </div>

            <div 
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsRepeating(!isRepeating); } }}
              onClick={() => setIsRepeating(!isRepeating)}
              className="flex items-center justify-between bg-surface-dark border border-white/5 light:border-black/5 rounded-2xl px-4 h-14 transition-all group cursor-pointer"
            >
              <div className="flex items-center select-none">
                <Repeat className="w-4 h-4 text-on-surface-variant mr-3" />
                <span className="text-on-surface text-sm">Repeat Transaction</span>
              </div>
              <button 
                tabIndex={-1}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors border border-on-surface/20",
                  isRepeating ? (type === 'expense' ? "bg-earth-clay border-transparent" : "bg-nature-green border-transparent") : "bg-on-surface/15"
                )}
              >
                <div className={cn(
                  "h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-300",
                  isRepeating ? "translate-x-4.5" : "translate-x-0.5"
                )} />
              </button>
            </div>

            {isRepeating && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="flex items-center gap-3 bg-surface-dark border border-white/5 light:border-black/5 rounded-2xl p-4 transition-all"
              >
                <span className="text-xs text-on-surface-variant font-mono font-bold uppercase shrink-0">Every</span>
                
                <input 
                  type="number" 
                  min="1" 
                  max="365"
                  value={recurrenceInterval}
                  onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 h-10 bg-surface-container border border-white/5 rounded-xl font-mono text-center text-sm text-on-surface focus:ring-1 focus:ring-nature-green focus:border-nature-green outline-none"
                />

                <select 
                  value={recurrenceUnit}
                  onChange={(e) => setRecurrenceUnit(e.target.value as any)}
                  className="flex-1 h-10 bg-surface-container border border-white/5 rounded-xl font-mono text-xs px-3 text-on-surface focus:ring-1 focus:ring-nature-green focus:border-nature-green outline-none cursor-pointer"
                >
                  <option value="days">Day(s)</option>
                  <option value="weeks">Week(s)</option>
                  <option value="months">Month(s)</option>
                  <option value="years">Year(s)</option>
                </select>
              </motion.div>
            )}
          </section>

          {/* Category Grid (Shown only for expenses) */}
          {type === 'expense' ? (
            <div className="space-y-2 mb-6 z-10 relative">
              <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Category</label>
              <div className="grid grid-cols-4 gap-2 max-h-[140px] overflow-y-auto pr-1">
                {categories.filter(cat => cat.id !== 'income').map((cat) => {
                  const isActive = activeCategory === cat.id;
                  const IconComponent = ICON_MAP[cat.icon] || ICON_MAP['Tag'];
                  return (
                    <button 
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={cn(
                        "py-2 px-1 flex flex-col gap-1 items-center justify-center rounded-xl transition-all duration-300 border text-xs cursor-pointer",
                        isActive 
                          ? cn(cat.color.replace('text-', 'bg-').concat('/10 border-current'), cat.color) 
                          : "bg-surface-dark border-white/5 text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                      )}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span className="text-[8px] uppercase tracking-wider font-bold truncate w-full text-center">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mb-6 py-4 flex flex-col items-center justify-center gap-2 text-center text-on-surface-variant/40 select-none z-10 relative bg-surface-dark/20 rounded-2xl border border-white/5">
              <Check className="w-6 h-6 opacity-30 text-nature-green animate-pulse" />
              <p className="text-[10px] uppercase font-bold tracking-wider font-mono">Income allocated to reserve pool</p>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 flex justify-center z-30">
              <div className="flex items-center gap-2 text-earth-clay font-mono text-xs bg-earth-clay/10 py-2 px-4 rounded-xl border border-earth-clay/20 w-full">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex gap-3 mt-2 z-10 relative">
            <button 
              onClick={onClose}
              className="flex-1 h-12 rounded-xl border border-white/10 hover:border-white/20 text-xs font-mono font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className={cn(
                "flex-1 h-12 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg hover:scale-[1.02] active:scale-[0.98] text-[#1A2521]",
                type === 'expense'
                  ? "bg-earth-clay shadow-earth-clay/10"
                  : "bg-nature-green shadow-nature-green/10"
              )}
            >
              Save {type === 'expense' ? 'Expense' : 'Income'}
            </button>
          </div>
        </motion.main>
      </div>
    </AnimatePresence>
  );
}
