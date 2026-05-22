import { useState, useEffect } from 'react';
import { 
  Utensils, Car, Zap, ShoppingBag, Gamepad2, Home, Heart, MoreHorizontal as OtherIcon, 
  Tag, Briefcase, Coffee, Music, Plane, Cpu, Camera, Monitor, Smile, Bookmark, Star, Key, DollarSign
} from 'lucide-react';
import { Category } from '../types';
import { getConfig, saveConfig } from './db';

// Map string identifiers to actual Lucide components
export const ICON_MAP: Record<string, any> = {
  Utensils, Car, Zap, ShoppingBag, Gamepad2, Home, Heart, OtherIcon,
  Tag, Briefcase, Coffee, Music, Plane, Cpu, Camera, Monitor, Smile, Bookmark, Star, Key, DollarSign
};

export const COLOR_OPTIONS = [
  'text-earth-clay',
  'text-nature-green',
  'text-ocean-blue',
  'text-sand-gold',
  'text-plum-purple',
  'text-sky-teal',
  'text-bark-brown',
  'text-forest-moss',
  'text-white',
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', icon: 'Utensils', color: 'text-earth-clay', budget: 50000 },
  { id: 'transport', label: 'Transport', icon: 'Car', color: 'text-nature-green', budget: 30000 },
  { id: 'utilities', label: 'Utilities', icon: 'Zap', color: 'text-ocean-blue', budget: 20000 },
  { id: 'shopping', label: 'Shopping', icon: 'ShoppingBag', color: 'text-sand-gold', budget: 40000 },
  { id: 'fun', label: 'Fun', icon: 'Gamepad2', color: 'text-plum-purple', budget: 30000 },
  { id: 'home', label: 'Home', icon: 'Home', color: 'text-bark-brown', budget: 100000 },
  { id: 'health', label: 'Health', icon: 'Heart', color: 'text-sky-teal', budget: 25000 },
  { id: 'other', label: 'Other', icon: 'OtherIcon', color: 'text-forest-moss', budget: 20000 },
  { id: 'income', label: 'Income', icon: 'DollarSign', color: 'text-nature-green', budget: 0 },
];

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const storedStr = await getConfig('custom_categories');
      let customCats: Category[] = [];
      if (typeof storedStr === 'string') {
        customCats = JSON.parse(storedStr);
      }

      // We also need to merge updated budgets from `category_budgets`
      // Wait, legacy `category_budgets` was stored as Record<string, number>
      const budgetsStr = await getConfig('category_budgets');
      let budgets: Record<string, number> = {};
      if (typeof budgetsStr === 'string') {
        budgets = JSON.parse(budgetsStr);
      }

      const merged = [...DEFAULT_CATEGORIES, ...customCats].map(cat => ({
        ...cat,
        budget: budgets[cat.id] !== undefined ? budgets[cat.id] : cat.budget
      }));

      setCategories(merged);
    } catch (err) {
      console.error('Failed to load custom categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCustomCategory = async (newCat: Category) => {
    const storedStr = await getConfig('custom_categories');
    let customCats: Category[] = [];
    if (typeof storedStr === 'string') {
      customCats = JSON.parse(storedStr);
    }
    
    // Check if modifying existing or adding new
    const existingIdx = customCats.findIndex(c => c.id === newCat.id);
    if (existingIdx >= 0) {
      customCats[existingIdx] = newCat;
    } else {
      customCats.push(newCat);
    }

    await saveConfig('custom_categories', JSON.stringify(customCats));
    
    // Also save budget in legacy `category_budgets` object to keep things consistent
    const budgetsStr = await getConfig('category_budgets');
    let budgets: Record<string, number> = typeof budgetsStr === 'string' ? JSON.parse(budgetsStr) : {};
    budgets[newCat.id] = newCat.budget;
    await saveConfig('category_budgets', JSON.stringify(budgets));

    await loadCategories();
  };

  return { categories, isLoading, saveCustomCategory, reload: loadCategories };
}

// Force Tailwind to include all background and text utility classes statically
export const TAILWIND_COLOR_PRESERVE = [
  'text-earth-clay', 'text-nature-green', 'text-ocean-blue', 'text-sand-gold',
  'text-plum-purple', 'text-sky-teal', 'text-bark-brown', 'text-forest-moss',
  'bg-earth-clay', 'bg-nature-green', 'bg-ocean-blue', 'bg-sand-gold',
  'bg-plum-purple', 'bg-sky-teal', 'bg-bark-brown', 'bg-forest-moss',
  'bg-earth-clay/10', 'bg-nature-green/10', 'bg-ocean-blue/10', 'bg-sand-gold/10',
  'bg-plum-purple/10', 'bg-sky-teal/10', 'bg-bark-brown/10', 'bg-forest-moss/10'
];
