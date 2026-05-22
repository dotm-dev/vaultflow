import { useState, useEffect } from 'react';
import { ArrowLeft, Check, AlertCircle, Plus, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getConfig, saveConfig } from '../lib/db';
import { useCategories, ICON_MAP, COLOR_OPTIONS } from '../lib/categories';

interface BudgetViewProps {
  onBack: () => void;
  onSaved?: () => void;
  currency: string;
  thousandsSeparator: string;
}


export default function BudgetView({ onBack, onSaved, currency, thousandsSeparator }: BudgetViewProps) {
  const { categories, isLoading: isCategoriesLoading, saveCustomCategory } = useCategories();
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Custom Category State
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Tag');
  const [newCatColor, setNewCatColor] = useState('text-on-surface');

  useEffect(() => {
    if (isCategoriesLoading) return;
    
    async function loadBudgets() {
      try {
        const storedStr = await getConfig('category_budgets');
        let loadedBudgets: Record<string, number> = {};
        if (typeof storedStr === 'string') {
          loadedBudgets = JSON.parse(storedStr);
        }
        
        // Populate from categories if missing in loadedBudgets
        categories.forEach(c => {
          if (loadedBudgets[c.id] === undefined) {
            loadedBudgets[c.id] = c.budget;
          }
        });

        setBudgets(loadedBudgets);
        
        // Convert to dollar strings for inputs
        const initialInputs: Record<string, string> = {};
        for (const [key, val] of Object.entries(loadedBudgets)) {
          const dollars = Math.round(val / 100);
          initialInputs[key] = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator || ',');
        }
        setInputs(initialInputs);
      } catch (err) {
        console.error('Failed to load budgets:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadBudgets();
  }, [isCategoriesLoading, categories, thousandsSeparator]);

  const handleInputChange = (id: string, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      setInputs(prev => ({ ...prev, [id]: '' }));
      return;
    }
    const num = parseInt(digits, 10);
    const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator || ',');
    setInputs(prev => ({ ...prev, [id]: formatted }));
  };

  const adjustBudget = (id: string, amountDelta: number) => {
    setInputs(prev => {
      const raw = prev[id] || '0';
      const clean = raw.replace(/\D/g, '');
      const current = parseInt(clean, 10) || 0;
      const next = Math.max(0, current + amountDelta);
      const formatted = next.toString().replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator || ',');
      return { ...prev, [id]: formatted };
    });
  };

  const handleSave = async () => {
    setError('');
    setIsSaving(true);
    
    try {
      const newBudgets: Record<string, number> = {};
      
      for (const id of Object.keys(inputs)) {
        const clean = (inputs[id] || '0').replace(/\D/g, '');
        const val = parseInt(clean, 10);
        if (isNaN(val) || val < 0) {
          setError(`Invalid amount for ${categories.find(c => c.id === id)?.label || 'category'}`);
          setIsSaving(false);
          return;
        }
        newBudgets[id] = val * 100;
      }

      await saveConfig('category_budgets', JSON.stringify(newBudgets));
      setBudgets(newBudgets);
      
      if (onSaved) {
        onSaved();
      }
    } catch (err) {
      console.error('Failed to save budgets', err);
      setError('Failed to save budgets. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatLabel.trim()) {
      setError('Please provide a category name.');
      return;
    }
    const id = newCatLabel.trim().toLowerCase().replace(/\s+/g, '-');
    await saveCustomCategory({
      id,
      label: newCatLabel.trim(),
      icon: newCatIcon,
      color: newCatColor,
      budget: 0
    });
    setInputs(prev => ({ ...prev, [id]: '0' }));
    setIsAddingCat(false);
    setNewCatLabel('');
    setNewCatIcon('Tag');
    setNewCatColor('text-on-surface');
  };

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col relative overflow-y-auto selection:bg-nature-green selection:text-surface-dark pb-10">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-sand-gold/5 blur-[120px] rounded-full pointer-events-none" />

      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-white/5 sticky top-0">
        <div className="max-w-3xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
            <div className="text-xl font-black text-on-surface tracking-tight">Set Budgets</div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-5 py-2 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark font-bold text-sm shadow-[0_5px_15px_rgba(0,242,234,0.15)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3px]" />
                Save Limits
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center px-6 max-w-3xl mx-auto w-full py-8 z-10 gap-6">
        <div className="w-full text-center mb-4 space-y-2">
          <h1 className="text-3xl font-black text-on-surface">Monthly Allocations</h1>
          <p className="text-on-surface-variant max-w-md mx-auto">
            Set your target maximum spend per category. This drives your VaultFlow Health Score and utilization analytics.
          </p>
        </div>

        {error && (
          <div className="w-full flex items-center gap-2 text-earth-clay font-mono text-xs bg-earth-clay/10 py-3 px-4 rounded-xl border border-earth-clay/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Savings Target Section */}
        {!isLoading && !isCategoriesLoading && (() => {
          const incomeCat = categories.find(c => c.id === 'income');
          if (!incomeCat) return null;
          const IconComponent = ICON_MAP[incomeCat.icon] || ICON_MAP['DollarSign'];
          return (
            <div className="w-full space-y-3 mb-6">
              <div className="w-full flex items-center justify-between px-2">
                <h2 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase">Savings Goal</h2>
              </div>
              <div className="w-full glass-card rounded-2xl p-5 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-white/10 transition-colors relative overflow-hidden">
                {/* Soft backdrop glow matching nature-green theme color */}
                <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-nature-green/5 blur-[40px] rounded-full pointer-events-none" />
                
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-nature-green/10">
                    <IconComponent className="w-5 h-5 text-nature-green" />
                  </div>
                  <div>
                    <div className="font-bold text-on-surface">Monthly Savings Target</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">Set a target amount to save up each month.</div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[24px] p-1 w-[170px] relative z-10 self-end sm:self-auto">
                  <button onClick={() => adjustBudget('income', -50)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-colors active:scale-95 text-xl font-light">-</button>
                  <div className="flex items-baseline justify-center flex-1">
                    <span className="text-slate-400 mr-0.5 font-mono text-sm">{currency}</span>
                    <input 
                      type="text"
                      value={inputs['income'] || ''}
                      onChange={(e) => handleInputChange('income', e.target.value)}
                      className="bg-transparent border-none outline-none focus:ring-0 text-slate-800 font-mono font-bold w-18 p-0 text-center"
                    />
                  </div>
                  <button onClick={() => adjustBudget('income', 50)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-colors active:scale-95 text-xl font-light">+</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Category Budgets Grid */}
        <div className="w-full space-y-3">
          <div className="w-full flex items-center justify-between px-2">
            <h2 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase">Category Budgets</h2>
          </div>
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            {!isLoading && !isCategoriesLoading && categories.filter(c => c.id !== 'income').map(cat => {
              const IconComponent = ICON_MAP[cat.icon] || ICON_MAP['Tag'];
              return (
              <div key={cat.id} className="glass-card rounded-2xl p-5 border border-white/5 flex items-center justify-between group hover:border-white/10 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white/5", cat.color.replace('text-', 'bg-').replace('text', 'bg').concat('/10'))}>
                    <IconComponent className={cn("w-5 h-5", cat.color)} />
                  </div>
                  <div className="font-bold text-on-surface">{cat.label}</div>
                </div>
                
                <div className="flex items-center justify-between bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[24px] p-1 w-[170px]">
                  <button onClick={() => adjustBudget(cat.id, -50)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-colors active:scale-95 text-xl font-light">-</button>
                  <div className="flex items-baseline justify-center flex-1">
                    <span className="text-slate-400 mr-0.5 font-mono text-sm">{currency}</span>
                    <input 
                      type="text"
                      value={inputs[cat.id] || ''}
                      onChange={(e) => handleInputChange(cat.id, e.target.value)}
                      className="bg-transparent border-none outline-none focus:ring-0 text-slate-800 font-mono font-bold w-18 p-0 text-center"
                    />
                  </div>
                  <button onClick={() => adjustBudget(cat.id, 50)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-colors active:scale-95 text-xl font-light">+</button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {!isAddingCat ? (
          <button 
            onClick={() => setIsAddingCat(true)}
            className="w-full md:w-auto mt-4 px-6 py-4 glass-card rounded-2xl flex items-center justify-center gap-3 text-on-surface-variant hover:text-on-surface transition-colors border border-white/5 border-dashed hover:border-white/20"
          >
            <Plus className="w-5 h-5" />
            <span className="font-bold">Add Custom Category</span>
          </button>
        ) : (
          <div className="w-full glass-card p-6 rounded-2xl border border-white/10 flex flex-col gap-5 mt-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-on-surface">New Category</h3>
              <button onClick={() => setIsAddingCat(false)} className="text-on-surface-variant hover:text-on-surface"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Name</label>
                <input 
                  type="text" 
                  value={newCatLabel}
                  onChange={e => setNewCatLabel(e.target.value)}
                  placeholder="e.g. Subscriptions"
                  className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Icon</label>
                <select 
                  value={newCatIcon}
                  onChange={e => setNewCatIcon(e.target.value)}
                  className="w-full bg-surface-dark border border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 transition-colors appearance-none"
                >
                  {Object.keys(ICON_MAP).map(iconName => (
                    <option key={iconName} value={iconName}>{iconName}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Color Theme</label>
                <div className="flex gap-3 mt-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewCatColor(c)}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        c.replace('text-', 'bg-'),
                        newCatColor === c ? 'border-white scale-110' : 'border-transparent'
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleAddCategory}
              className="mt-2 w-full py-3 rounded-xl bg-nature-green text-surface-dark font-bold text-sm transition-all hover:opacity-90"
            >
              Create Category
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
