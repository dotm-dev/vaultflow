import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { 
  ArrowLeft, Check, AlertCircle, Plus, Trash2, ChevronDown, ChevronUp, RefreshCw, GripVertical, ArrowUp, ArrowDown,
  Briefcase, Home, Shield, Car, Zap, Bookmark, Key, Utensils, Monitor, Gamepad2, Heart, Info, DollarSign, Edit, X,
  GraduationCap, Plane, ShoppingBag, TrendingUp, Gift, Sparkles, Coffee, PawPrint, Smartphone, Activity,
  ShoppingCart, Clapperboard, Tv, Gamepad, Wifi, Phone, Trash, Wrench, Plug, Flame, Droplet, Shirt, Scissors, 
  Train, Bus, Bike, Euro, Coins, PiggyBank, Wallet, Percent, Building, Warehouse, KeyRound, HeartPulse, Pill, 
  Stethoscope, Glasses, Baby, Hammer, Paintbrush, Leaf, Flower, Camera, Music, BookOpen, Ticket, Dumbbell, Beer, 
  Wine, UtensilsCrossed, UserRound, ShieldAlert, School, Crown, Moon, Sun, Umbrella
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getConfig, saveConfig } from '../lib/db';
import { formatAmount } from '../lib/formatters';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface BudgetItem {
  id: string;
  name: string;
  amount: number; // expected raw amount (e.g. 5100 or 1765)
  frequency: 'monthly' | 'yearly';
}

interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  items: BudgetItem[];
  type?: 'income' | 'expense';
}

interface BudgetVersion {
  id: string;
  name: string;
  createdAt: number;
  categories: BudgetCategory[];
}

const LOCAL_ICON_MAP: Record<string, any> = {
  Briefcase, Home, Shield, Car, Zap, Bookmark, Key, Utensils, Monitor, Gamepad2, Heart, DollarSign, ArrowUp, ArrowDown,
  GraduationCap, Plane, ShoppingBag, TrendingUp, Gift, Sparkles, Coffee, PawPrint, Smartphone, Activity,
  ShoppingCart, Clapperboard, Tv, Gamepad, Wifi, Phone, Trash, Wrench, Plug, Flame, Droplet, Shirt, Scissors,
  Train, Bus, Bike, Euro, Coins, PiggyBank, Wallet, Percent, Building, Warehouse, KeyRound, HeartPulse, Pill,
  Stethoscope, Glasses, Baby, Hammer, Paintbrush, Leaf, Flower, Camera, Music, BookOpen, Ticket, Dumbbell, Beer,
  Wine, UtensilsCrossed, UserRound, ShieldAlert, School, Crown, Moon, Sun, Umbrella
};

const CATEGORY_COLORS: Record<string, string> = {
  salary: '#7BA05B', // nature-green
  rent: '#9E806E',    // bark-brown
  insurance: '#5C7C8A', // ocean-blue
  car: '#7BA05B',     // nature-green
  motorbike: '#D4AE5E', // sand-gold
  savings: '#8B6B7B',  // plum-purple
  taxes: '#7AA89F',    // sky-teal
  survival: '#D9735A', // earth-clay
  utility: '#506655',  // forest-moss
  fun: '#8B6B7B',      // plum-purple
  health: '#7AA89F'    // sky-teal
};

const DEFAULT_BUDGET_CATEGORIES: BudgetCategory[] = [
  {
    id: 'salary',
    name: 'Salary',
    icon: 'Briefcase',
    color: 'text-nature-green',
    items: [],
    type: 'income'
  },
  {
    id: 'rent',
    name: 'Rent',
    icon: 'Home',
    color: 'text-bark-brown',
    items: [],
    type: 'expense'
  },
  {
    id: 'insurance',
    name: 'Insurance',
    icon: 'Shield',
    color: 'text-ocean-blue',
    items: [],
    type: 'expense'
  },
  {
    id: 'car',
    name: 'Car',
    icon: 'Car',
    color: 'text-nature-green',
    items: [],
    type: 'expense'
  },
  {
    id: 'motorbike',
    name: 'Motorbike',
    icon: 'Zap',
    color: 'text-sand-gold',
    items: [],
    type: 'expense'
  },
  {
    id: 'savings',
    name: 'Savings',
    icon: 'Bookmark',
    color: 'text-plum-purple',
    items: [],
    type: 'expense'
  },
  {
    id: 'taxes',
    name: 'Taxes',
    icon: 'Key',
    color: 'text-sky-teal',
    items: [],
    type: 'expense'
  },
  {
    id: 'survival',
    name: 'Survival',
    icon: 'Utensils',
    color: 'text-earth-clay',
    items: [],
    type: 'expense'
  },
  {
    id: 'utility',
    name: 'Utility',
    icon: 'Monitor',
    color: 'text-forest-moss',
    items: [],
    type: 'expense'
  },
  {
    id: 'fun',
    name: 'Fun',
    icon: 'Gamepad2',
    color: 'text-plum-purple',
    items: [],
    type: 'expense'
  },
  {
    id: 'health',
    name: 'Health',
    icon: 'Heart',
    color: 'text-sky-teal',
    items: [],
    type: 'expense'
  }
];

// Calculate subtotals
const getCategoryTotals = (cat: BudgetCategory) => {
  let monthlyTotal = 0;
  cat.items.forEach(item => {
    if (item.frequency === 'monthly') {
      monthlyTotal += item.amount;
    } else {
      monthlyTotal += item.amount / 12;
    }
  });
  return {
    monthly: monthlyTotal,
    yearly: monthlyTotal * 12
  };
};

interface ReorderableCategoryCardProps {
  key?: string;
  cat: BudgetCategory;
  index: number;
  currency: string;
  thousandsSeparator: string;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onItemChange: (catId: string, itemId: string, field: keyof BudgetItem, value: any) => void;
  onDeleteItem: (catId: string, itemId: string) => void;
  onAddItem: (catId: string, name: string, amount: number, freq: 'monthly' | 'yearly') => void;
}

function ReorderableCategoryCard({
  cat,
  index,
  currency,
  thousandsSeparator,
  isExpanded,
  onToggle,
  onDelete,
  onItemChange,
  onDeleteItem,
  onAddItem
}: ReorderableCategoryCardProps) {
  const dragControls = useDragControls();

  // Local state for the add item form
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemFreq, setItemFreq] = useState<'monthly' | 'yearly'>('monthly');

  const handleLocalAdd = () => {
    const name = itemName.trim();
    if (!name) {
      alert('Please specify a sub-item name.');
      return;
    }
    const amount = parseFloat(itemAmount);
    if (isNaN(amount) || amount < 0) {
      alert('Please specify a valid positive expected amount.');
      return;
    }
    onAddItem(cat.id, name, amount, itemFreq);
    setItemName('');
    setItemAmount('');
    setItemFreq('monthly');
  };

  const IconComponent = LOCAL_ICON_MAP[cat.icon] || Bookmark;
  const catTotals = getCategoryTotals(cat);

  return (
    <Reorder.Item
      value={cat}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        "glass-card rounded-[1.5rem] border overflow-hidden transition-all duration-300",
        isExpanded ? "border-on-surface/10 shadow-lg" : "border-on-surface/5 hover:border-on-surface/10"
      )}
    >
      {/* Category Header */}
      <div 
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        onClick={onToggle}
        className="p-4 flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          {/* Drag Handle */}
          <div 
            onPointerDown={(e) => {
              e.stopPropagation();
              dragControls.start(e);
            }}
            className="cursor-grab active:cursor-grabbing text-on-surface-variant/40 hover:text-on-surface p-1 rounded hover:bg-white/5 transition-colors shrink-0"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-white/5", cat.color.replace('text-', 'bg-').replace('text', 'bg').concat('/10'), cat.color)}>
            <IconComponent className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-on-surface">{cat.name}</h3>
            <span className="text-[10px] text-on-surface-variant font-mono">
              {cat.items.length} item{cat.items.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-mono text-xs font-bold text-on-surface">
              {formatAmount(Math.round(catTotals.monthly * 100), currency, thousandsSeparator, false)}
              <span className="text-[9px] text-on-surface-variant font-normal uppercase font-sans ml-0.5">/mo</span>
            </div>
            {catTotals.yearly > 0 && cat.items.some(i => i.frequency === 'yearly') && (
              <div className="font-mono text-[9px] text-on-surface-variant mt-0.5">
                {formatAmount(Math.round(catTotals.yearly * 100), currency, thousandsSeparator, false)}
                <span className="text-[7px] uppercase font-sans ml-0.5">/yr</span>
              </div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(cat.id);
            }}
            className="p-1.5 rounded-lg hover:bg-earth-clay/10 text-on-surface-variant hover:text-earth-clay transition-all cursor-pointer outline-none"
            title="Remove category"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-on-surface-variant" />
          ) : (
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          )}
        </div>
      </div>

      {/* Category Items List (Expanded) */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-4 border-t border-on-surface/5 bg-on-surface/[0.02] space-y-4">
              
              {cat.items.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[9px] font-mono font-bold uppercase tracking-wider text-on-surface-variant/50 px-2 pb-1.5 border-b border-on-surface/5">
                    <div className="col-span-5">Item Name</div>
                    <div className="col-span-3 text-right">Expected Amount</div>
                    <div className="col-span-3 text-center">Frequency</div>
                    <div className="col-span-1 text-center"></div>
                  </div>

                  <div className="space-y-1.5">
                    {cat.items.map(item => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center px-1.5 py-1 rounded-lg hover:bg-white/[0.02] group/row transition-colors">
                        {/* Item Name Input */}
                        <div className="col-span-5">
                          <input
                            type="text"
                            value={item.name}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => onItemChange(cat.id, item.id, 'name', e.target.value)}
                            className="w-full bg-transparent border-none outline-none font-mono text-xs text-on-surface focus:ring-0 p-0 focus:border-b focus:border-nature-green/50 placeholder:text-on-surface-variant/20"
                          />
                        </div>
                        
                        {/* Amount Input */}
                        <div className="col-span-3 flex items-center justify-end gap-1">
                          <span className="text-[10px] text-on-surface-variant/40 font-mono">{currency}</span>
                          <input
                            type="number"
                            value={item.amount || ''}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => onItemChange(cat.id, item.id, 'amount', e.target.value)}
                            placeholder="0"
                            className="bg-transparent border-none outline-none font-mono text-xs text-on-surface text-right w-16 focus:ring-0 p-0"
                          />
                        </div>

                        {/* Frequency Select */}
                        <div className="col-span-3 text-center">
                          <select
                            value={item.frequency}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => onItemChange(cat.id, item.id, 'frequency', e.target.value)}
                            className="bg-transparent border-none outline-none font-mono text-[10px] text-on-surface-variant/80 focus:ring-0 p-0 text-center w-full cursor-pointer uppercase tracking-wider font-bold"
                          >
                            <option className="bg-surface-dark text-on-surface" value="monthly">Monthly</option>
                            <option className="bg-surface-dark text-on-surface" value="yearly">Yearly</option>
                          </select>
                        </div>

                        {/* Delete Action */}
                        <div className="col-span-1 flex justify-center">
                          <button
                            onClick={() => onDeleteItem(cat.id, item.id)}
                            className="text-on-surface-variant hover:text-earth-clay p-1 cursor-pointer transition-colors opacity-30 group-hover/row:opacity-100"
                            title="Delete item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-on-surface-variant/50 text-center py-4 font-mono uppercase tracking-wider">
                  No items defined. Enter a sub-item below to begin forecasting.
                </p>
              )}

              {/* Add Item Row Form */}
              <div className="pt-2 border-t border-on-surface/5 flex gap-2 items-center flex-wrap sm:flex-nowrap">
                <input 
                  type="text"
                  placeholder="Add custom item (e.g. Netflix)"
                  value={itemName}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setItemName(e.target.value)}
                  className="flex-1 bg-surface-dark/50 border border-on-surface/10 focus:border-nature-green/50 focus:bg-surface-dark/85 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono outline-none placeholder:text-on-surface-variant/30 transition-all"
                />
                <div className="flex gap-1.5 items-center w-28 shrink-0">
                  <span className="text-[10px] text-on-surface-variant/40 font-mono">{currency}</span>
                  <input 
                    type="number"
                    placeholder="0.00"
                    value={itemAmount}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setItemAmount(e.target.value)}
                    className="w-full bg-surface-dark/50 border border-on-surface/10 focus:border-nature-green/50 focus:bg-surface-dark/85 rounded-lg px-2.5 py-1.5 text-xs text-on-surface font-mono text-right outline-none transition-all"
                  />
                </div>
                <select
                  value={itemFreq}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setItemFreq(e.target.value as any)}
                  className="bg-surface-dark/50 border border-on-surface/10 focus:border-nature-green/50 focus:bg-surface-dark/85 rounded-lg px-2 py-1.5 text-[10px] text-on-surface-variant font-mono uppercase tracking-wider font-bold shrink-0 w-24 cursor-pointer transition-all"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <button
                  onClick={handleLocalAdd}
                  className="h-8 px-3 rounded-lg bg-nature-green text-surface-dark font-bold text-xs uppercase tracking-wider flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

interface ExpectedBudgetViewProps {
  onBack: () => void;
  onSync?: () => Promise<boolean>;
  currency: string;
  thousandsSeparator: string;
}

// Maps ledger category IDs to Planner default category IDs
const mapLedgerIdToPlannerId = (id: string): string => {
  switch (id) {
    case 'income': return 'salary';
    case 'home': return 'rent';
    case 'utilities': return 'utility';
    case 'food': return 'survival';
    case 'transport': return 'car';
    default: return id;
  }
};

export default function ExpectedBudgetView({ onBack, onSync, currency, thousandsSeparator }: ExpectedBudgetViewProps) {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [versions, setVersions] = useState<BudgetVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>('');
  
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ salary: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);



  // New Custom Category States
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Bookmark');
  const [newCatColor, setNewCatColor] = useState('text-sky-teal');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function updatePosition() {
      if (isIconPickerOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownHeight = 256;
        let top = rect.top - dropdownHeight - 8;
        if (rect.top < dropdownHeight + 20) {
          top = rect.bottom + 8;
        }
        const dropdownWidth = 256;
        let left = rect.left;
        if (left + dropdownWidth > window.innerWidth) {
          left = window.innerWidth - dropdownWidth - 16;
        }
        left = Math.max(16, left);

        setPickerStyle({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          width: `${dropdownWidth}px`
        });
      }
    }

    if (isIconPickerOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    } else {
      setPickerStyle({});
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isIconPickerOpen]);

  // Click outside listener for the Portal-rendered dropdown
  useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      if (isIconPickerOpen && triggerRef.current) {
        if (triggerRef.current.contains(e.target as Node)) {
          return;
        }
        const dropdown = document.getElementById('icon-picker-dropdown');
        if (dropdown && dropdown.contains(e.target as Node)) {
          return;
        }
        setIsIconPickerOpen(false);
      }
    }

    if (isIconPickerOpen) {
      const timer = setTimeout(() => {
        document.addEventListener('click', handleDocumentClick);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleDocumentClick);
      };
    }
  }, [isIconPickerOpen]);

  // Scenario Manager Modal States
  const [isNewVersionModalOpen, setIsNewVersionModalOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionBaseline, setNewVersionBaseline] = useState<'zero' | 'ledger' | 'duplicate'>('duplicate');

  useEffect(() => {
    async function loadBudgetData() {
      try {
        const storedVersions = await getConfig('expected_budget_versions');
        const storedActiveId = await getConfig('active_expected_budget_version_id');
        
        let loadedVersions: BudgetVersion[] = [];
        let loadedActiveId = '';

        if (typeof storedVersions === 'string') {
          loadedVersions = JSON.parse(storedVersions);
        }
        if (typeof storedActiveId === 'string') {
          loadedActiveId = storedActiveId;
        }

        if (loadedVersions.length === 0) {
          // Backward compatibility check for deprecated expected_budget_data
          const legacyData = await getConfig('expected_budget_data');
          let initialCategories: BudgetCategory[] = [];
          if (typeof legacyData === 'string') {
            try {
              initialCategories = JSON.parse(legacyData);
            } catch (e) {
              console.error('Error parsing legacy budget data:', e);
            }
          }

          // If no versions exist, create the default baseline scenario
          const defaultVersion: BudgetVersion = {
            id: crypto.randomUUID(),
            name: 'Expected Budget',
            createdAt: Date.now(),
            categories: initialCategories
          };
          loadedVersions = [defaultVersion];
          loadedActiveId = defaultVersion.id;

          // Save immediately
          await saveConfig('expected_budget_versions', JSON.stringify(loadedVersions));
          await saveConfig('active_expected_budget_version_id', loadedActiveId);
        }

        setVersions(loadedVersions);
        setActiveVersionId(loadedActiveId);
        
        // Load active categories
        const active = loadedVersions.find(v => v.id === loadedActiveId);
        if (active) {
          setCategories(active.categories);
        }
      } catch (err) {
        console.error('Failed to load expected budget data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadBudgetData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      // Update the active version's categories inside the versions list
      const updatedVersions = versions.map(v => {
        if (v.id === activeVersionId) {
          return { ...v, categories };
        }
        return v;
      });
      await saveConfig('expected_budget_versions', JSON.stringify(updatedVersions));
      await saveConfig('active_expected_budget_version_id', activeVersionId);
      setVersions(updatedVersions);
      setSaveSuccess(true);

      // Sync with cloud if Google account is connected
      if (onSync) {
        try {
          await onSync();
        } catch (syncErr) {
          console.error('Failed to sync on save expected budget:', syncErr);
        }
      }

      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save expected budget:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchVersion = (id: string) => {
    // 1. Map current categories state back to the active version in memory
    const updatedVersions = versions.map(v => {
      if (v.id === activeVersionId) {
        return { ...v, categories };
      }
      return v;
    });

    const targetActive = updatedVersions.find(v => v.id === id);
    if (targetActive) {
      setVersions(updatedVersions);
      setActiveVersionId(id);
      setCategories(targetActive.categories);
      saveConfig('expected_budget_versions', JSON.stringify(updatedVersions));
      saveConfig('active_expected_budget_version_id', id);
    }
  };

  const handleCreateVersion = async () => {
    const name = newVersionName.trim();
    if (!name) {
      alert('Please specify a scenario name.');
      return;
    }

    let newCategories: BudgetCategory[] = [];

    if (newVersionBaseline === 'zero') {
      // Start from zero: empty categories array
      newCategories = [];
    } else if (newVersionBaseline === 'duplicate') {
      // Duplicate current categories
      newCategories = JSON.parse(JSON.stringify(categories));
    } else if (newVersionBaseline === 'ledger') {
      // Use ledger's budgets as baseline
      try {
        const budgetsStr = await getConfig('category_budgets');
        const customCatsStr = await getConfig('custom_categories');
        
        let budgets: Record<string, number> = {};
        if (typeof budgetsStr === 'string') {
          budgets = JSON.parse(budgetsStr);
        }
        
        let customCats: any[] = [];
        if (typeof customCatsStr === 'string') {
          customCats = JSON.parse(customCatsStr);
        }

        const allLedgerCategories = [
          { id: 'food', label: 'Food', icon: 'Utensils', color: 'text-earth-clay' },
          { id: 'transport', label: 'Transport', icon: 'Car', color: 'text-nature-green' },
          { id: 'utilities', label: 'Utilities', icon: 'Zap', color: 'text-ocean-blue' },
          { id: 'shopping', label: 'Shopping', icon: 'ShoppingBag', color: 'text-sand-gold' },
          { id: 'fun', label: 'Fun', icon: 'Gamepad2', color: 'text-plum-purple' },
          { id: 'home', label: 'Home', icon: 'Home', color: 'text-bark-brown' },
          { id: 'health', label: 'Health', icon: 'Heart', color: 'text-sky-teal' },
          { id: 'other', label: 'Other', icon: 'OtherIcon', color: 'text-forest-moss' },
          { id: 'income', label: 'Income', icon: 'DollarSign', color: 'text-nature-green' },
          ...customCats
        ];

        // Start with default planner categories (empty items)
        const plannerCats = DEFAULT_BUDGET_CATEGORIES.map(c => ({ ...c, items: [] as BudgetItem[] }));

        // Map ledger budgets into planner categories
        allLedgerCategories.forEach(lCat => {
          const budgetVal = budgets[lCat.id] || 0;
          if (budgetVal > 0) {
            const mappedId = mapLedgerIdToPlannerId(lCat.id);
            let plannerCat = plannerCats.find(c => c.id === mappedId);
            
            // If the planner doesn't have this category (e.g. custom category), create it
            if (!plannerCat) {
              plannerCat = {
                id: lCat.id,
                name: lCat.label,
                icon: lCat.icon,
                color: lCat.color || 'text-sky-teal',
                items: [],
                type: lCat.id === 'income' ? 'income' : 'expense'
              };
              plannerCats.push(plannerCat);
            }

            plannerCat.items.push({
              id: crypto.randomUUID(),
              name: `${lCat.label} Target`,
              amount: budgetVal / 100, // convert cents to raw currency
              frequency: 'monthly'
            });
          }
        });

        newCategories = plannerCats;
      } catch (err) {
        console.error('Failed to load ledger budgets:', err);
        alert('Could not read ledger budgets. Initializing with empty categories instead.');
        newCategories = [];
      }
    }

    const newVersion: BudgetVersion = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      categories: newCategories
    };

    const updatedVersions = [...versions, newVersion];
    setVersions(updatedVersions);
    setActiveVersionId(newVersion.id);
    setCategories(newCategories);

    // Save configurations immediately
    await saveConfig('expected_budget_versions', JSON.stringify(updatedVersions));
    await saveConfig('active_expected_budget_version_id', newVersion.id);

    setIsNewVersionModalOpen(false);
    setNewVersionName('');
  };

  const handleDeleteVersion = async (id: string) => {
    if (versions.length <= 1) {
      alert('You must keep at least one budget scenario.');
      return;
    }
    const targetName = versions.find(v => v.id === id)?.name || 'this scenario';
    if (window.confirm(`Are you sure you want to delete the scenario "${targetName}"?`)) {
      const remaining = versions.filter(v => v.id !== id);
      setVersions(remaining);
      
      // If we deleted the active one, switch to the first remaining one
      if (activeVersionId === id) {
        const nextActive = remaining[0];
        setActiveVersionId(nextActive.id);
        setCategories(nextActive.categories);
        await saveConfig('active_expected_budget_version_id', nextActive.id);
      }
      await saveConfig('expected_budget_versions', JSON.stringify(remaining));
    }
  };

  const handleRenameVersion = async () => {
    const active = versions.find(v => v.id === activeVersionId);
    if (!active) return;
    const newName = prompt('Enter new name for this scenario:', active.name);
    if (newName && newName.trim() && newName.trim() !== active.name) {
      const updated = versions.map(v => {
        if (v.id === activeVersionId) {
          return { ...v, name: newName.trim() };
        }
        return v;
      });
      setVersions(updated);
      await saveConfig('expected_budget_versions', JSON.stringify(updated));
    }
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    categories.forEach(c => {
      next[c.id] = expand;
    });
    setExpandedCategories(next);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all items from all categories in this scenario?')) {
      setCategories(prev => prev.map(cat => ({
        ...cat,
        items: []
      })));
    }
  };

  // Inline modifications
  const handleItemChange = (catId: string, itemId: string, field: keyof BudgetItem, value: any) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        items: cat.items.map(item => {
          if (item.id !== itemId) return item;
          if (field === 'amount') {
            const parsed = parseFloat(value);
            return { ...item, amount: isNaN(parsed) ? 0 : parsed };
          }
          return { ...item, [field]: value };
        })
      };
    }));
  };

  const handleDeleteItem = (catId: string, itemId: string) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        items: cat.items.filter(item => item.id !== itemId)
      };
    }));
  };

  const handleAddItem = (catId: string, name: string, amount: number, freq: 'monthly' | 'yearly') => {
    const newItem: BudgetItem = {
      id: crypto.randomUUID(),
      name,
      amount,
      frequency: freq
    };

    setCategories(prev => prev.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        items: [...cat.items, newItem]
      };
    }));
  };

  // Add custom category
  const handleCreateCategory = () => {
    if (!newCatName.trim()) {
      alert('Please enter a category name.');
      return;
    }
    const id = newCatName.trim().toLowerCase().replace(/\s+/g, '-');
    if (categories.some(c => c.id === id)) {
      alert('A category with this name already exists.');
      return;
    }

    const newCategory: BudgetCategory = {
      id,
      name: newCatName.trim(),
      icon: newCatIcon,
      color: newCatColor,
      type: newCatType,
      items: []
    };

    setCategories(prev => [...prev, newCategory]);
    setExpandedCategories(prev => ({ ...prev, [id]: true }));
    setIsAddingCategory(false);
    setNewCatName('');
    setNewCatType('expense');
  };

  const handleDeleteCategory = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;

    if (window.confirm(`Are you sure you want to remove the category "${cat.name}" and all its sub-items?`)) {
      setCategories(prev => prev.filter(c => c.id !== catId));
    }
  };



  // Totals calculations
  const totals = categories.reduce(
    (acc, cat) => {
      const catTotals = getCategoryTotals(cat);
      if (cat.type === 'income' || (cat.type === undefined && cat.id === 'salary')) {
        acc.incomeMonthly += catTotals.monthly;
      } else {
        acc.expensesMonthly += catTotals.monthly;
      }
      return acc;
    },
    { incomeMonthly: 0, expensesMonthly: 0 }
  );

  const netSurplusMonthly = totals.incomeMonthly - totals.expensesMonthly;
  const netSurplusYearly = netSurplusMonthly * 12;

  // Prepare chart data
  const chartData = categories
    .filter(cat => cat.id !== 'salary' && cat.type !== 'income')
    .map(cat => {
      const val = getCategoryTotals(cat).monthly;
      return {
        name: cat.name,
        value: Math.round(val),
        color: CATEGORY_COLORS[cat.id] || '#7AA89F'
      };
    })
    .filter(data => data.value > 0);

  return (
    <div className="h-screen bg-surface-dark flex flex-col relative overflow-y-auto lg:overflow-hidden selection:bg-nature-green selection:text-surface-dark">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-nature-green/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-on-surface/5 sticky top-0">
        <div className="max-w-5xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={async () => {
                try {
                  const updatedVersions = versions.map(v => {
                    if (v.id === activeVersionId) {
                      return { ...v, categories };
                    }
                    return v;
                  });
                  await saveConfig('expected_budget_versions', JSON.stringify(updatedVersions));
                  await saveConfig('active_expected_budget_version_id', activeVersionId);

                  // Sync with cloud on back navigation
                  if (onSync) {
                    try {
                      await onSync();
                    } catch (syncErr) {
                      console.error('Failed to sync on back expected budget:', syncErr);
                    }
                  }
                } catch (err) {
                  console.error('Failed to auto-save expected budget on back:', err);
                }
                onBack();
              }}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <div className="text-sm font-black text-on-surface tracking-tight whitespace-nowrap">Budget Planner</div>
              
              {/* Scenario Manager Dropdown and Actions */}
              {!isLoading && versions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 bg-on-surface/5 border border-on-surface/5 rounded-lg px-2.5 py-0.5">
                    <select
                      value={activeVersionId}
                      onChange={(e) => handleSwitchVersion(e.target.value)}
                      className="bg-transparent border-none outline-none font-mono text-[10px] text-nature-green font-bold focus:ring-0 p-0 cursor-pointer max-w-[130px]"
                    >
                      {versions.map(v => (
                        <option key={v.id} value={v.id} className="bg-surface-dark text-on-surface">{v.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <button 
                    onClick={() => setIsNewVersionModalOpen(true)}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-nature-green transition-colors cursor-pointer"
                    title="Create new scenario"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={handleRenameVersion}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                    title="Rename current scenario"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteVersion(activeVersionId)}
                    disabled={versions.length <= 1}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-earth-clay disabled:opacity-30 disabled:hover:text-on-surface-variant transition-colors cursor-pointer"
                    title="Delete current scenario"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className={cn(
                "px-5 py-2 rounded-xl text-surface-dark font-bold text-sm shadow-md transition-all flex items-center gap-2",
                saveSuccess
                  ? "bg-nature-green shadow-nature-green/10"
                  : "bg-linear-to-tr from-ocean-blue to-nature-green shadow-[0_5px_15px_rgba(0,242,234,0.15)] hover:scale-105 active:scale-95 disabled:opacity-50"
              )}
            >
              {isSaving ? (
                'Saving...'
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4 stroke-[3px]" />
                  Saved!
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3px]" />
                  Save Plan
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-5xl mx-auto w-full px-6 py-6 z-10 flex flex-col gap-6 lg:overflow-hidden min-h-0">
        
        {/* Page description */}
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-on-surface">Budget Forecast & Surplus Calculator</h1>
          <p className="text-xs text-on-surface-variant max-w-2xl">
            Configure expected monthly cash inflows and scheduled periodic outflows. Frequencies are standardized (Yearly totals are divided by 12) to calculate accurate monthly surpluses.
          </p>
        </div>

        {isLoading ? (
          <div className="w-full py-20 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-nature-green animate-spin" />
            <span className="font-mono text-xs text-on-surface-variant uppercase tracking-wider">Loading active plan...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 min-h-0 flex-grow">
            
            {/* Left side: Calculator & Allocation Breakdown */}
            <div className="space-y-6 lg:col-span-1">
              
              {/* Financial Dashboard Card */}
              <div className="glass-card rounded-[2rem] p-6 border border-on-surface/5 relative overflow-hidden flex flex-col gap-5">
                <div className="absolute top-0 right-0 w-[120px] h-[120px] bg-nature-green/5 blur-2xl rounded-full" />
                <h3 className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase font-mono">Monthly Budget Summary</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-on-surface-variant font-medium">Expected Income:</span>
                    <span className="text-sm font-bold text-nature-green font-mono">
                      {formatAmount(Math.round(totals.incomeMonthly * 100), currency, thousandsSeparator, false)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-on-surface-variant font-medium">Expected Outflows:</span>
                    <span className="text-sm font-bold text-on-surface font-mono">
                      {formatAmount(Math.round(totals.expensesMonthly * 100), currency, thousandsSeparator, false)}
                    </span>
                  </div>
                  <div className="border-t border-on-surface/5 pt-3 flex justify-between items-baseline">
                    <span className="text-xs font-bold text-on-surface uppercase font-mono tracking-wide">Net Surplus:</span>
                    <div className="text-right">
                      <div className={cn("text-2xl font-black font-mono", netSurplusMonthly >= 0 ? "text-nature-green" : "text-earth-clay")}>
                        {netSurplusMonthly < 0 ? '-' : ''}
                        {formatAmount(Math.round(Math.abs(netSurplusMonthly) * 100), currency, thousandsSeparator, false)}
                        <span className="text-[10px] text-on-surface-variant ml-1 font-normal uppercase font-sans">/mo</span>
                      </div>
                      <div className={cn("text-[10px] font-mono mt-0.5", netSurplusMonthly >= 0 ? "text-nature-green/70" : "text-earth-clay/70")}>
                        {netSurplusMonthly < 0 ? '-' : ''}
                        {formatAmount(Math.round(Math.abs(netSurplusYearly) * 100), currency, thousandsSeparator, false)}
                        <span className="ml-1 uppercase font-sans text-[8px]">/yr</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Allocation Chart */}
              {chartData.length > 0 && (
                <div className="glass-card rounded-[2rem] p-6 border border-on-surface/5 flex flex-col gap-4">
                  <h3 className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase font-mono">Outflow Allocations</h3>
                  <div className="h-44 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--surface-container)', border: 'none', borderRadius: '8px', boxShadow: '0 5px 15px rgba(0,0,0,0.15)' }}
                          itemStyle={{ color: 'var(--on-surface)', fontSize: '11px', fontFamily: 'monospace' }}
                          formatter={(value: number) => [`${currency}${value.toLocaleString()}`, 'Allocated']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>

            {/* Right side: Expandable Categories & Sub-items list (with drag-and-drop & subtle outline) */}
            <div className="lg:col-span-2 flex flex-col min-h-0 border border-on-surface/10 rounded-[2rem] p-5 relative">
              {/* Expand / Collapse Actions Toolbar */}
              <div className="flex justify-end gap-2.5 pb-3">
                <button 
                  onClick={() => toggleAll(true)}
                  className="px-3.5 py-1.5 bg-white/5 border border-on-surface/10 hover:bg-white/10 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider text-on-surface transition-all cursor-pointer"
                >
                  Expand All
                </button>
                <button 
                  onClick={() => toggleAll(false)}
                  className="px-3.5 py-1.5 bg-white/5 border border-on-surface/10 hover:bg-white/10 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider text-on-surface transition-all cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
              
              {/* Scrollable list wrapper */}
              <div className="flex-grow overflow-y-auto pr-2 pb-16 space-y-4 scrollbar-thin">
                  <Reorder.Group 
                    axis="y" 
                    values={categories} 
                    onReorder={setCategories} 
                    className="space-y-4"
                  >
                    {categories.map((cat, index) => (
                      <ReorderableCategoryCard
                        key={cat.id}
                        cat={cat}
                        index={index}
                        currency={currency}
                        thousandsSeparator={thousandsSeparator}
                        isExpanded={!!expandedCategories[cat.id]}
                        onToggle={() => toggleCategory(cat.id)}
                        onDelete={handleDeleteCategory}
                        onItemChange={handleItemChange}
                        onDeleteItem={handleDeleteItem}
                        onAddItem={handleAddItem}
                      />
                    ))}
                  </Reorder.Group>

                  {/* Add Custom Category section (scrolls with cards) */}
                  <div className="pt-2">
                    {!isAddingCategory ? (
                      <button 
                        onClick={() => setIsAddingCategory(true)}
                        className="w-full py-4 glass-card rounded-2xl flex items-center justify-center gap-3 text-on-surface-variant hover:text-on-surface transition-colors border border-on-surface/5 border-dashed hover:border-on-surface/20 cursor-pointer"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="font-bold font-mono uppercase tracking-wider text-xs">Create Custom Category</span>
                      </button>
                    ) : (
                      <div className="glass-card p-5 rounded-2xl border border-on-surface/10 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold text-sm text-on-surface">New Custom Category</h3>
                          <button onClick={() => setIsAddingCategory(false)} className="text-on-surface-variant hover:text-on-surface"><Plus className="w-5 h-5 rotate-45" /></button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Category Name</label>
                            <input 
                              type="text" 
                              value={newCatName}
                              onChange={e => setNewCatName(e.target.value)}
                              placeholder="e.g. Travel, Kids"
                              className="w-full bg-surface-dark/50 border border-on-surface/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 focus:bg-surface-dark/85 transition-all outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Type</label>
                            <select 
                              value={newCatType}
                              onChange={e => setNewCatType(e.target.value as any)}
                              className="w-full bg-surface-dark/50 border border-on-surface/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 focus:bg-surface-dark/85 transition-all cursor-pointer outline-none"
                            >
                              <option value="expense">Expense (Negative)</option>
                              <option value="income">Income (Positive)</option>
                            </select>
                          </div>

                          <div className="space-y-1 relative">
                            <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Icon</label>
                            
                            {/* Trigger Button */}
                            <button
                              type="button"
                              ref={triggerRef}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isIconPickerOpen && triggerRef.current) {
                                  const rect = triggerRef.current.getBoundingClientRect();
                                  const dropdownHeight = 256;
                                  let top = rect.top - dropdownHeight - 8;
                                  if (rect.top < dropdownHeight + 20) {
                                    top = rect.bottom + 8;
                                  }
                                  const dropdownWidth = 256;
                                  let left = rect.left;
                                  if (left + dropdownWidth > window.innerWidth) {
                                    left = window.innerWidth - dropdownWidth - 16;
                                  }
                                  left = Math.max(16, left);

                                  setPickerStyle({
                                    position: 'fixed',
                                    top: `${top}px`,
                                    left: `${left}px`,
                                    width: `${dropdownWidth}px`
                                  });
                                }
                                setIsIconPickerOpen(prev => !prev);
                              }}
                              className="w-full flex items-center justify-between bg-surface-dark/50 border border-on-surface/10 rounded-xl px-3 py-2 text-left font-mono text-xs text-on-surface hover:border-nature-green/30 transition-all cursor-pointer h-[34px]"
                            >
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const IconComponent = LOCAL_ICON_MAP[newCatIcon] || Bookmark;
                                  return <IconComponent className="w-4 h-4 text-nature-green" />;
                                })()}
                                <span className="text-xs text-on-surface">{newCatIcon}</span>
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant/60" />
                            </button>

                            {/* Dropdown Popover */}
                            {createPortal(
                              <AnimatePresence>
                                {isIconPickerOpen && pickerStyle.top !== undefined && (
                                  <motion.div
                                    id="icon-picker-dropdown"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.1 }}
                                    style={pickerStyle}
                                    className="bg-surface-container border border-on-surface/10 rounded-2xl p-3 shadow-2xl z-50 grid grid-cols-4 gap-2 max-h-64 overflow-y-auto scrollbar-thin"
                                  >
                                    {Object.keys(LOCAL_ICON_MAP).map((iconName) => {
                                      const IconComponent = LOCAL_ICON_MAP[iconName];
                                      const isSelected = newCatIcon === iconName;
                                      return (
                                        <button
                                          key={iconName}
                                          type="button"
                                          onClick={() => {
                                            setNewCatIcon(iconName);
                                            setIsIconPickerOpen(false);
                                          }}
                                          title={iconName}
                                          className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer border",
                                            isSelected 
                                              ? "bg-nature-green/10 border-nature-green text-nature-green" 
                                              : "border-transparent hover:bg-white/5 text-on-surface-variant hover:text-on-surface"
                                          )}
                                        >
                                          <IconComponent className="w-6 h-6" />
                                        </button>
                                      );
                                    })}
                                  </motion.div>
                                )}
                              </AnimatePresence>,
                              document.body
                            )}
                          </div>
                        </div>
                        
                        <button 
                          onClick={handleCreateCategory}
                          className="w-full py-2.5 rounded-xl bg-nature-green text-surface-dark font-bold text-xs uppercase tracking-wider transition-all hover:opacity-90 mt-2 cursor-pointer"
                        >
                          Add Category
                        </button>
                      </div>
                    )}
                  </div>
                </div>

            </div>

          </div>
        )}

      </main>

      {/* New Scenario Modal */}
      <AnimatePresence>
        {isNewVersionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[420px] bg-surface-container rounded-[2rem] p-6 border border-on-surface/10 shadow-2xl flex flex-col gap-5 text-left"
            >
              <button 
                onClick={() => setIsNewVersionModalOpen(false)} 
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant flex items-center justify-center transition-all cursor-pointer hover:text-on-surface"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-on-surface">Create New Planning Scenario</h3>
                <p className="text-xs text-on-surface-variant">Name your scenario and choose a baseline template.</p>
              </div>

              <div className="space-y-4">
                {/* Scenario Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant font-mono tracking-wider">Scenario Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Budget Plan B"
                    value={newVersionName}
                    onChange={(e) => setNewVersionName(e.target.value)}
                    className="w-full bg-surface-dark/50 border border-on-surface/10 rounded-xl px-3 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 focus:bg-surface-dark/85 transition-all outline-none"
                  />
                </div>

                {/* Baseline Source */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant font-mono tracking-wider">Baseline Source</label>
                  <select
                    value={newVersionBaseline}
                    onChange={(e) => setNewVersionBaseline(e.target.value as any)}
                    className="w-full bg-surface-dark/50 border border-on-surface/10 rounded-xl px-3 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 focus:bg-surface-dark/85 transition-all cursor-pointer outline-none"
                  >
                    <option value="duplicate">Duplicate Current Plan</option>
                    <option value="ledger">Use Ledger Budgets as Baseline</option>
                    <option value="zero">Start from Zero (Empty Categories)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateVersion}
                className="w-full py-3 rounded-xl bg-nature-green text-surface-dark font-bold text-xs uppercase tracking-wider transition-all hover:opacity-90 mt-2 cursor-pointer"
              >
                Create Scenario
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
