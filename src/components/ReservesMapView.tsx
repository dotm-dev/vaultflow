import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Calendar, Filter, DollarSign, Activity, Info, TrendingUp, 
  Wallet, ChevronRight, Briefcase, Lock, ShoppingBag, Coins, HelpCircle, RefreshCw
} from 'lucide-react';
import { Transaction, Category } from '../types';
import { useCategories, ICON_MAP } from '../lib/categories';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { formatAmount, getTimezoneDateParts, getTimestampFromParts } from '../lib/formatters';

interface ReservesMapViewProps {
  transactions: Transaction[];
  onBack: () => void;
  currency: string;
  thousandsSeparator: string;
  dateFormat: string;
  timezone: string;
  currentLedgerBalance: number;
  ledgerCreatedAt: number;
  fixedCategories: string[];
  activeVaultName: string;
}

interface SankeyNode {
  id: string;
  label: string;
  value: number;
  column: number;
  color: string;
  icon?: string;
  y: number;
  height: number;
  finalY: number;
}

interface SankeyLink {
  id: string;
  source: string;
  target: string;
  value: number;
  color: string;
  sourceY: number;
  targetY: number;
  height: number;
}

const COLOR_MAP: Record<string, string> = {
  'nature-green': '#7BA05B',
  'ocean-blue': '#5C7C8A',
  'earth-clay': '#D9735A',
  'sand-gold': '#D4AE5E',
  'plum-purple': '#8B6B7B',
  'sky-teal': '#7AA89F',
  'bark-brown': '#9E806E',
  'forest-moss': '#506655',
  'white': '#FFFFFF',
};

const getThemeColor = (colorClass: string) => {
  const name = colorClass.replace('text-', '').replace('bg-', '');
  return COLOR_MAP[name] || '#5C7C8A';
};

export default function ReservesMapView({
  transactions,
  onBack,
  currency,
  thousandsSeparator,
  dateFormat,
  timezone,
  currentLedgerBalance,
  ledgerCreatedAt,
  fixedCategories,
  activeVaultName
}: ReservesMapViewProps) {
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const [timePreset, setTimePreset] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('3M');
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, number>>({});
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<{ id: string; startY: number; startOffset: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);

  // Global theme detection (reads the class on document element)
  const [isLightMode, setIsLightMode] = useState(false);
  useEffect(() => {
    const checkTheme = () => {
      setIsLightMode(document.documentElement.classList.contains('light'));
    };
    checkTheme();
    
    // Set up observer for HTML class updates
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Reset node offsets when preset changes to avoid misaligned layouts
  useEffect(() => {
    setNodeOffsets({});
  }, [timePreset]);

  // Handle global dragging events
  useEffect(() => {
    if (!draggedNode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.pageY - draggedNode.startY;
      setNodeOffsets(prev => ({
        ...prev,
        [draggedNode.id]: draggedNode.startOffset + deltaY
      }));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const deltaY = e.touches[0].pageY - draggedNode.startY;
      setNodeOffsets(prev => ({
        ...prev,
        [draggedNode.id]: draggedNode.startOffset + deltaY
      }));
    };

    const handleMouseUp = () => {
      setDraggedNode(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('touchcancel', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchcancel', handleMouseUp);
    };
  }, [draggedNode]);

  // Helper to calculate balance at a specific time `t`
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

  // 1. Filter Transactions based on preset
  const filteredTransactions = useMemo(() => {
    if (timePreset === 'ALL') return transactions;

    const nowParts = getTimezoneDateParts(Date.now(), timezone);
    let startTimestamp = 0;
    
    if (timePreset === '1M') {
      startTimestamp = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 30, 0, 0, 0, timezone);
    } else if (timePreset === '3M') {
      startTimestamp = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 90, 0, 0, 0, timezone);
    } else if (timePreset === '6M') {
      startTimestamp = getTimestampFromParts(nowParts.year, nowParts.month, nowParts.day - 180, 0, 0, 0, timezone);
    } else if (timePreset === '1Y') {
      startTimestamp = getTimestampFromParts(nowParts.year - 1, nowParts.month, nowParts.day, 0, 0, 0, timezone);
    }

    return transactions.filter(t => t.booking_date >= startTimestamp);
  }, [transactions, timePreset, timezone]);

  // Aggregate values
  const { incomes, expenses, totalInflow, totalOutflow, stats } = useMemo(() => {
    const inc = filteredTransactions.filter(t => t.type === 'income');
    const exp = filteredTransactions.filter(t => t.type === 'expense');

    const totalInc = inc.reduce((sum, t) => sum + t.amount, 0);
    const totalExp = exp.reduce((sum, t) => sum + t.amount, 0);

    return {
      incomes: inc,
      expenses: exp,
      totalInflow: totalInc,
      totalOutflow: totalExp,
      stats: {
        savings: Math.max(0, totalInc - totalExp),
        savingsRate: totalInc > 0 ? (Math.max(0, totalInc - totalExp) / totalInc) * 100 : 0
      }
    };
  }, [filteredTransactions]);

  // 2. Generate Sankey Data Model (Nodes & Links)
  const sankeyData = useMemo(() => {
    if (isCategoriesLoading || categories.length === 0) return { nodes: [], links: [] };

    const nodesList: Omit<SankeyNode, 'y' | 'height' | 'finalY'>[] = [];
    const linksList: Omit<SankeyLink, 'sourceY' | 'targetY' | 'height'>[] = [];

    // Helper to find category metadata
    const getCategoryMeta = (catId: string | null) => {
      const c = categories.find(cat => cat.id === catId);
      return c || { label: catId || 'Other', color: 'text-forest-moss', icon: 'OtherIcon' };
    };

    // Calculate Inflows deficit vs surplus
    const hasDeficit = totalOutflow > totalInflow;
    const deficitAmount = hasDeficit ? totalOutflow - totalInflow : 0;
    const balancedInflowTotal = hasDeficit ? totalOutflow : totalInflow;

    // --- COLUMN 0: INFLOWS ---
    const incomesByMerchant: Record<string, number> = {};
    incomes.forEach(tx => {
      const name = tx.counterparty.trim() || 'Salary / Inflow';
      incomesByMerchant[name] = (incomesByMerchant[name] || 0) + tx.amount;
    });

    const inflowNodes = Object.entries(incomesByMerchant)
      .map(([name, amount]) => ({
        id: `inflow_${name.toLowerCase().replace(/\s+/g, '_')}`,
        label: name,
        value: amount,
        column: 0,
        color: COLOR_MAP['nature-green'],
        icon: 'Briefcase'
      }))
      .sort((a, b) => b.value - a.value);

    nodesList.push(...inflowNodes);

    if (deficitAmount > 0) {
      nodesList.push({
        id: 'inflow_past_reserves',
        label: 'Past Reserves Drawdown',
        value: deficitAmount,
        column: 0,
        color: COLOR_MAP['ocean-blue'],
        icon: 'Wallet'
      });
    }

    // --- COLUMN 1: NET RESERVES ---
    nodesList.push({
      id: 'net_reserves',
      label: 'Net Reserves Pool',
      value: balancedInflowTotal,
      column: 1,
      color: COLOR_MAP['ocean-blue'],
      icon: 'Activity'
    });

    // --- COLUMN 2: FINANCIAL PILLARS ---
    const fixedExpensesTotal = expenses
      .filter(tx => fixedCategories.includes(tx.category_id || ''))
      .reduce((sum, tx) => sum + tx.amount, 0);

    const agileExpensesTotal = totalOutflow - fixedExpensesTotal;
    const retainedReservesTotal = hasDeficit ? 0 : totalInflow - totalOutflow;

    if (fixedExpensesTotal > 0) {
      nodesList.push({
        id: 'pillar_fixed',
        label: 'Fixed Base',
        value: fixedExpensesTotal,
        column: 2,
        color: COLOR_MAP['earth-clay'],
        icon: 'Lock'
      });
    }

    if (agileExpensesTotal > 0) {
      nodesList.push({
        id: 'pillar_agile',
        label: 'Agile Spend',
        value: agileExpensesTotal,
        column: 2,
        color: COLOR_MAP['sand-gold'],
        icon: 'ShoppingBag'
      });
    }

    if (retainedReservesTotal > 0) {
      nodesList.push({
        id: 'pillar_retained',
        label: 'Retained Reserves',
        value: retainedReservesTotal,
        column: 2,
        color: COLOR_MAP['nature-green'],
        icon: 'Coins'
      });
    }

    // --- COLUMN 3: CATEGORIES ---
    const expensesByCategory: Record<string, number> = {};
    expenses.forEach(tx => {
      const catId = tx.category_id || 'other';
      expensesByCategory[catId] = (expensesByCategory[catId] || 0) + tx.amount;
    });

    // Sort categories: Fixed ones first (by value descending), then Agile ones (by value descending)
    const fixedCategoryNodes = Object.entries(expensesByCategory)
      .filter(([catId]) => fixedCategories.includes(catId))
      .map(([catId, amount]) => {
        const meta = getCategoryMeta(catId);
        return {
          id: `category_${catId}`,
          label: meta.label,
          value: amount,
          column: 3,
          color: getThemeColor(meta.color),
          icon: meta.icon
        };
      })
      .sort((a, b) => b.value - a.value);

    const agileCategoryNodes = Object.entries(expensesByCategory)
      .filter(([catId]) => !fixedCategories.includes(catId))
      .map(([catId, amount]) => {
        const meta = getCategoryMeta(catId);
        return {
          id: `category_${catId}`,
          label: meta.label,
          value: amount,
          column: 3,
          color: getThemeColor(meta.color),
          icon: meta.icon
        };
      })
      .sort((a, b) => b.value - a.value);

    const categoryNodesSorted = [...fixedCategoryNodes, ...agileCategoryNodes];
    nodesList.push(...categoryNodesSorted);

    // --- COLUMN 4: MERCHANTS ---
    // For each active category, find top merchants and group others under < 1%
    const merchantNodesList: typeof nodesList = [];

    categoryNodesSorted.forEach(catNode => {
      const catId = catNode.id.replace('category_', '');
      const catTxs = expenses.filter(tx => (tx.category_id || 'other') === catId);
      const catTotal = catNode.value;

      const merchantAmounts: Record<string, number> = {};
      catTxs.forEach(tx => {
        const mName = tx.counterparty.trim() || 'Unknown Merchant';
        merchantAmounts[mName] = (merchantAmounts[mName] || 0) + tx.amount;
      });

      const threshold = catTotal * 0.01; // 1% threshold
      let otherTotal = 0;
      const specificMerchants: { name: string; amount: number }[] = [];

      Object.entries(merchantAmounts).forEach(([name, amount]) => {
        if (amount >= threshold) {
          specificMerchants.push({ name, amount });
        } else {
          otherTotal += amount;
        }
      });

      specificMerchants.sort((a, b) => b.amount - a.amount);

      specificMerchants.forEach(m => {
        const mNodeId = `merchant_${catId}_${m.name.toLowerCase().replace(/\s+/g, '_')}`;
        merchantNodesList.push({
          id: mNodeId,
          label: m.name,
          value: m.amount,
          column: 4,
          color: catNode.color,
          icon: 'Tag'
        });

        // Add link from category to merchant
        linksList.push({
          id: `${catNode.id}_${mNodeId}`,
          source: catNode.id,
          target: mNodeId,
          value: m.amount,
          color: `gradient_${catNode.id}_${mNodeId}`
        });
      });

      if (otherTotal > 0) {
        const otherNodeId = `merchant_${catId}_other`;
        merchantNodesList.push({
          id: otherNodeId,
          label: `Other (${catNode.label})`,
          value: otherTotal,
          column: 4,
          color: catNode.color,
          icon: 'Tag'
        });

        linksList.push({
          id: `${catNode.id}_${otherNodeId}`,
          source: catNode.id,
          target: otherNodeId,
          value: otherTotal,
          color: `gradient_${catNode.id}_${otherNodeId}`
        });
      }
    });

    nodesList.push(...merchantNodesList);

    // --- LINKS GENERATION (Columns 0, 1, 2) ---

    // Links: Column 0 -> Column 1 (Inflows to Net Reserves)
    nodesList.filter(n => n.column === 0).forEach(inNode => {
      linksList.push({
        id: `${inNode.id}_net_reserves`,
        source: inNode.id,
        target: 'net_reserves',
        value: inNode.value,
        color: `gradient_${inNode.id}_net_reserves`
      });
    });

    // Links: Column 1 -> Column 2 (Net Reserves to Pillars)
    if (fixedExpensesTotal > 0) {
      linksList.push({
        id: 'net_reserves_pillar_fixed',
        source: 'net_reserves',
        target: 'pillar_fixed',
        value: fixedExpensesTotal,
        color: 'gradient_net_reserves_pillar_fixed'
      });
    }
    if (agileExpensesTotal > 0) {
      linksList.push({
        id: 'net_reserves_pillar_agile',
        source: 'net_reserves',
        target: 'pillar_agile',
        value: agileExpensesTotal,
        color: 'gradient_net_reserves_pillar_agile'
      });
    }
    if (retainedReservesTotal > 0) {
      linksList.push({
        id: 'net_reserves_pillar_retained',
        source: 'net_reserves',
        target: 'pillar_retained',
        value: retainedReservesTotal,
        color: 'gradient_net_reserves_pillar_retained'
      });
    }

    // Links: Column 2 -> Column 3 (Pillars to Categories)
    fixedCategoryNodes.forEach(catNode => {
      linksList.push({
        id: `pillar_fixed_${catNode.id}`,
        source: 'pillar_fixed',
        target: catNode.id,
        value: catNode.value,
        color: `gradient_pillar_fixed_${catNode.id}`
      });
    });

    agileCategoryNodes.forEach(catNode => {
      linksList.push({
        id: `pillar_agile_${catNode.id}`,
        source: 'pillar_agile',
        target: catNode.id,
        value: catNode.value,
        color: `gradient_pillar_agile_${catNode.id}`
      });
    });

    return { nodes: nodesList, links: linksList };
  }, [filteredTransactions, categories, fixedCategories, isCategoriesLoading, incomes, expenses, totalInflow, totalOutflow]);

  // 3. Compute Coordinates (Fixed SVG Dimension: 960 x 550)
  const SVG_WIDTH = 960;
  const SVG_HEIGHT = 550;
  const paddingTop = 60;
  const paddingBottom = 40;
  const nodeWidth = 18;
  const nodeGap = 14;
  const columnX = [40, 260, 480, 700, 920];
  const usableHeight = SVG_HEIGHT - paddingTop - paddingBottom;

  const layout = useMemo(() => {
    if (sankeyData.nodes.length === 0) return { nodes: [], links: [] };

    // Group nodes by column
    const columns: Record<number, typeof sankeyData.nodes> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    sankeyData.nodes.forEach(n => {
      columns[n.column].push(n);
    });

    // Compute global scale
    let minScale = Infinity;
    Object.entries(columns).forEach(([colIndexStr, colNodes]) => {
      const colSum = colNodes.reduce((sum, n) => sum + n.value, 0);
      const gaps = colNodes.length - 1;
      const availableHeight = usableHeight - (gaps * nodeGap);
      const scale = colSum > 0 ? availableHeight / colSum : Infinity;
      if (scale < minScale) {
        minScale = scale;
      }
    });

    // Fallback if no valid transactions / incomes
    const globalScaleY = minScale === Infinity || minScale <= 0 ? 1 : minScale;

    // Calculate vertical coordinates for nodes in each column
    const computedNodes: SankeyNode[] = [];
    
    Object.entries(columns).forEach(([colIndexStr, colNodes]) => {
      const col = Number(colIndexStr);
      const colSum = colNodes.reduce((sum, n) => sum + n.value, 0);
      const gaps = colNodes.length - 1;
      const totalColHeight = (colSum * globalScaleY) + (gaps * nodeGap);
      
      let startY = paddingTop + (usableHeight - totalColHeight) / 2;

      colNodes.forEach(node => {
        const height = Math.max(8, node.value * globalScaleY); // Minimum height of 8px to keep nodes clickable/visible
        const y = startY;
        const finalY = y + (nodeOffsets[node.id] || 0);

        computedNodes.push({
          ...node,
          y,
          height,
          finalY
        } as SankeyNode);

        startY += height + nodeGap;
      });
    });

    // Create a fast-lookup map for nodes
    const nodeMap = new Map<string, SankeyNode>();
    computedNodes.forEach(n => nodeMap.set(n.id, n));

    // Sort links to stack them in visual order without crossings
    const sortedLinks = [...sankeyData.links].sort((a, b) => {
      const nodeA_src = nodeMap.get(a.source);
      const nodeB_src = nodeMap.get(b.source);
      const nodeA_tgt = nodeMap.get(a.target);
      const nodeB_tgt = nodeMap.get(b.target);

      if (!nodeA_src || !nodeB_src || !nodeA_tgt || !nodeB_tgt) return 0;

      // Group 1: Col 0 -> Col 1
      if (nodeA_src.column === 0 && nodeB_src.column === 0) {
        return nodeA_src.finalY - nodeB_src.finalY;
      }
      // Group 2: Col 1 -> Col 2
      if (nodeA_src.column === 1 && nodeB_src.column === 1) {
        return nodeA_tgt.finalY - nodeB_tgt.finalY;
      }
      // Group 3: Col 2 -> Col 3
      if (nodeA_src.column === 2 && nodeB_src.column === 2) {
        if (a.source === b.source) {
          return nodeA_tgt.finalY - nodeB_tgt.finalY;
        }
        return nodeA_src.finalY - nodeB_src.finalY;
      }
      // Group 4: Col 3 -> Col 4
      if (nodeA_src.column === 3 && nodeB_src.column === 3) {
        if (a.source === b.source) {
          return nodeA_tgt.finalY - nodeB_tgt.finalY;
        }
        return nodeA_src.finalY - nodeB_src.finalY;
      }
      return 0;
    });

    // Track stacked offsets for source and target node connections
    const sourceOccupied: Record<string, number> = {};
    const targetOccupied: Record<string, number> = {};

    const computedLinks = sortedLinks.map(link => {
      const s = nodeMap.get(link.source);
      const t = nodeMap.get(link.target);

      if (!s || !t) return null;

      const linkHeight = Math.max(1, link.value * globalScaleY);

      const sY = s.finalY + (sourceOccupied[s.id] || 0);
      const tY = t.finalY + (targetOccupied[t.id] || 0);

      sourceOccupied[s.id] = (sourceOccupied[s.id] || 0) + linkHeight;
      targetOccupied[t.id] = (targetOccupied[t.id] || 0) + linkHeight;

      return {
        ...link,
        sourceY: sY,
        targetY: tY,
        height: linkHeight
      } as SankeyLink;
    }).filter((l): l is SankeyLink => l !== null);

    return { nodes: computedNodes, links: computedLinks };
  }, [sankeyData, nodeOffsets, usableHeight]);

  // Tooltip rendering helper
  const handleMouseEnterLink = (e: React.MouseEvent, link: SankeyLink, sNode: SankeyNode, tNode: SankeyNode) => {
    setHoveredLinkId(link.id);
    const amountStr = formatAmount(link.value, currency, thousandsSeparator, false);
    
    // Calculate tooltip coordinates relative to window
    setTooltip({
      x: e.clientX,
      y: e.clientY - 10,
      content: (
        <div className="space-y-1">
          <div className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.1em]">Cash Stream</div>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span style={{ color: sNode.color }} className="font-semibold">{sNode.label}</span>
            <span className="text-on-surface-variant/50">➔</span>
            <span style={{ color: tNode.color }} className="font-semibold">{tNode.label}</span>
          </div>
          <div className="text-sm font-mono font-bold text-on-surface pt-0.5">{amountStr}</div>
        </div>
      )
    });
  };

  const handleMouseEnterNode = (e: React.MouseEvent, node: SankeyNode) => {
    setHoveredNodeId(node.id);
    const amountStr = formatAmount(node.value, currency, thousandsSeparator, false);
    const pctStr = node.column === 3 && totalOutflow > 0 
      ? ` (${((node.value / totalOutflow) * 100).toFixed(1)}% of expenses)` 
      : node.column === 0 && totalInflow > 0
      ? ` (${((node.value / totalInflow) * 100).toFixed(1)}% of incomes)`
      : '';

    setTooltip({
      x: e.clientX,
      y: e.clientY - 10,
      content: (
        <div className="space-y-0.5">
          <div className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.1em]">
            {node.column === 0 ? 'Inflow Source' : node.column === 1 ? 'Central Pool' : node.column === 2 ? 'Financial Pillar' : node.column === 3 ? 'Category Limit' : 'Merchant'}
          </div>
          <div className="text-xs font-bold text-on-surface" style={{ color: node.color }}>
            {node.label}
          </div>
          <div className="text-xs font-mono font-semibold text-on-surface pt-0.5">
            {amountStr}<span className="text-on-surface-variant/70 font-sans font-normal text-[10px]">{pctStr}</span>
          </div>
        </div>
      )
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltip) {
      setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY - 10 } : null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredNodeId(null);
    setHoveredLinkId(null);
    setTooltip(null);
  };

  // Node Drag Trigger
  const handleNodeDragStart = (e: React.MouseEvent | React.TouchEvent, node: SankeyNode) => {
    e.preventDefault();
    const pageY = 'touches' in e ? e.touches[0].pageY : e.pageY;
    setDraggedNode({
      id: node.id,
      startY: pageY,
      startOffset: nodeOffsets[node.id] || 0
    });
  };

  // Node connectedness lookup for styling highlighting
  const isNodeConnectedToHovered = (node: SankeyNode) => {
    if (!hoveredNodeId) return true;
    if (node.id === hoveredNodeId) return true;

    // Direct connections
    const connected = layout.links.some(l => 
      (l.source === hoveredNodeId && l.target === node.id) ||
      (l.target === hoveredNodeId && l.source === node.id)
    );

    if (connected) return true;

    // Indirect: Inflows to Categories/Pillars through Net Reserves
    if (hoveredNodeId === 'net_reserves') return true;
    if (node.id === 'net_reserves') return true;

    if (node.column === 0 && hoveredNodeId.startsWith('pillar_')) {
      return true; // Keep incomes lit up when hovering pillars
    }
    if (hoveredNodeId.startsWith('inflow_') && node.column === 2) {
      return true; // Keep pillars lit up when hovering income sources
    }

    return false;
  };

  const isLinkConnectedToHovered = (link: SankeyLink) => {
    if (hoveredLinkId) {
      return link.id === hoveredLinkId;
    }
    if (hoveredNodeId) {
      return link.source === hoveredNodeId || link.target === hoveredNodeId;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col">
      {/* Dynamic backdrop glow decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-nature-green/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-ocean-blue/5 blur-[130px]"></div>
      </div>

      {/* Header */}
      <header className="w-full border-b border-white/5 bg-surface-dark/65 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-full border border-white/5 hover:border-white/10 bg-white/3 hover:bg-white/5 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-nature-green bg-nature-green/10 border border-nature-green/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Interactive Map
              </span>
              <span className="text-[10px] font-mono text-on-surface-variant tracking-wider uppercase">
                {activeVaultName}
              </span>
            </div>
            <h1 className="text-xl font-bold text-on-surface tracking-tight mt-0.5">
              Reserves Distribution Map
            </h1>
          </div>
        </div>

        {/* Period Filters */}
        <div className="flex items-center gap-1.5 bg-white/5 p-1.5 rounded-full border border-white/5 self-start sm:self-center">
          {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map(preset => (
            <button
              key={preset}
              onClick={() => setTimePreset(preset)}
              className={cn(
                "px-4.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                timePreset === preset
                  ? "bg-nature-green text-surface-dark font-extrabold shadow-[0_2px_15px_rgba(123,160,91,0.3)]"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white/3"
              )}
            >
              {preset === 'ALL' ? 'All Time' : preset}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6 z-10">
        
        {/* KPI Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase">
              Period Inflow
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-nature-green">
                {formatAmount(totalInflow, currency, thousandsSeparator, false)}
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant/60 font-mono mt-1">
              Active cash deposits & revenue
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase">
              Period Expenses
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-earth-clay">
                {formatAmount(totalOutflow, currency, thousandsSeparator, false)}
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant/60 font-mono mt-1">
              Fixed costs & flexible spends
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase">
              Retained Reserves
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-ocean-blue">
                {formatAmount(stats.savings, currency, thousandsSeparator, false)}
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant/60 font-mono mt-1">
              Net balance surplus (savings)
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase">
              Retained Ratio
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-sky-teal">
                {stats.savingsRate.toFixed(1)}%
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant/60 font-mono mt-1">
              Percent of inflows saved
            </span>
          </div>
        </div>

        {/* Interactive Diagram Card */}
        <div className="glass-card rounded-3xl p-6 border border-white/5 relative">
          
          {/* Instructions banner */}
          <div className="flex items-center gap-2.5 px-4.5 py-3 rounded-2xl bg-white/3 border border-white/5 text-[11px] text-on-surface-variant/80 font-mono leading-relaxed mb-6 select-none">
            <Info className="w-4 h-4 text-nature-green shrink-0" />
            <span>
              <strong>Layout Adjustment:</strong> Drag the node blocks vertically to align flows. Hover over the ribbon connections or nodes to track path distributions.
            </span>
          </div>

          {/* Diagram Container */}
          <div className="w-full overflow-x-auto scrollbar-thin select-none relative" onMouseMove={handleMouseMove}>
            <div className="min-w-[960px] relative">
              
              {/* SVG Sankey Diagram */}
              {layout.nodes.length === 0 ? (
                <div className="h-[400px] w-full flex flex-col items-center justify-center gap-4 text-on-surface-variant/60">
                  <RefreshCw className="w-8 h-8 animate-spin text-nature-green" />
                  <span className="font-mono text-xs uppercase tracking-wider">
                    Analyzing ledger logs...
                  </span>
                </div>
              ) : (
                <svg 
                  viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} 
                  className="w-full h-auto"
                >
                  <defs>
                    {/* Dynamic linear gradients for links mapping source color -> target color */}
                    {layout.links.map(link => {
                      const sNode = layout.nodes.find(n => n.id === link.source);
                      const tNode = layout.nodes.find(n => n.id === link.target);
                      if (!sNode || !tNode) return null;
                      return (
                        <linearGradient 
                          key={link.id} 
                          id={link.color} 
                          x1="0%" 
                          y1="0%" 
                          x2="100%" 
                          y2="0%"
                        >
                          <stop offset="0%" stopColor={sNode.color} />
                          <stop offset="100%" stopColor={tNode.color} />
                        </linearGradient>
                      );
                    })}
                  </defs>

                  {/* Render Links (Paths) first so they sit behind nodes */}
                  <g className="links-group">
                    {layout.links.map(link => {
                      const sNode = layout.nodes.find(n => n.id === link.source);
                      const tNode = layout.nodes.find(n => n.id === link.target);
                      if (!sNode || !tNode) return null;

                      // Control points for cubic S-Bezier curve ribbon
                      const x0 = columnX[sNode.column] + nodeWidth;
                      const x1 = columnX[tNode.column];
                      const y0 = link.sourceY;
                      const y1 = link.targetY;
                      const h = link.height;
                      const dx = (x1 - x0) * 0.5;

                      const pathData = `
                        M ${x0} ${y0}
                        C ${x0 + dx} ${y0}, ${x1 - dx} ${y1}, ${x1} ${y1}
                        L ${x1} ${y1 + h}
                        C ${x1 - dx} ${y1 + h}, ${x0 + dx} ${y0 + h}, ${x0} ${y0 + h}
                        Z
                      `;

                      const isHovered = hoveredLinkId === link.id;
                      const isConnected = isLinkConnectedToHovered(link);
                      
                      // Calculate opacity based on highlight state
                      let opacity = 0.22;
                      if (hoveredNodeId || hoveredLinkId) {
                        opacity = isConnected ? 0.65 : 0.04;
                      }

                      return (
                        <path
                          key={link.id}
                          d={pathData}
                          fill={`url(#${link.color})`}
                          opacity={opacity}
                          className="transition-all duration-300 ease-out cursor-pointer hover:opacity-85"
                          onMouseEnter={(e) => handleMouseEnterLink(e, link, sNode, tNode)}
                          onMouseLeave={handleMouseLeave}
                        />
                      );
                    })}
                  </g>

                  {/* Render Nodes (Rectangles and Labels) */}
                  <g className="nodes-group">
                    {layout.nodes.map(node => {
                      const isLeftLabel = node.column < 4;
                      const labelX = isLeftLabel 
                        ? columnX[node.column] - 10 
                        : columnX[node.column] + nodeWidth + 10;
                      const labelAnchor = isLeftLabel ? 'end' : 'start';
                      
                      const isHovered = hoveredNodeId === node.id;
                      const isConnected = isNodeConnectedToHovered(node);
                      
                      let rectOpacity = 1;
                      let textOpacity = 0.85;
                      if (hoveredNodeId || hoveredLinkId) {
                        rectOpacity = isConnected ? 1 : 0.25;
                        textOpacity = isConnected ? 1 : 0.2;
                      }

                      // Find matching icon component
                      let IconComponent = null;
                      if (node.icon) {
                        IconComponent = ICON_MAP[node.icon] || null;
                      }

                      // Special colors for layout borders
                      const activeGlow = isHovered 
                        ? `filter drop-shadow-[0_0_8px_${node.color}cc]`
                        : '';

                      return (
                        <g 
                          key={node.id} 
                          className="transition-all duration-200"
                        >
                          {/* Node Main Rectangle */}
                          <rect
                            x={columnX[node.column]}
                            y={node.finalY}
                            width={nodeWidth}
                            height={node.height}
                            fill={node.color}
                            rx={4}
                            ry={4}
                            opacity={rectOpacity}
                            className={cn(
                              "cursor-grab active:cursor-grabbing hover:brightness-110 border border-white/10 transition-all",
                              activeGlow
                            )}
                            onMouseDown={(e) => handleNodeDragStart(e, node)}
                            onTouchStart={(e) => handleNodeDragStart(e, node)}
                            onMouseEnter={(e) => handleMouseEnterNode(e, node)}
                            onMouseLeave={handleMouseLeave}
                          />

                          {/* Node Icon inside/beside the node */}
                          {IconComponent && node.height >= 14 && (
                            <g
                              transform={`translate(${
                                isLeftLabel 
                                  ? columnX[node.column] - 22 
                                  : columnX[node.column] + nodeWidth + 8
                              }, ${node.finalY + (node.height / 2) - 6})`}
                              opacity={textOpacity}
                              className="pointer-events-none"
                            >
                              <IconComponent 
                                size={12} 
                                style={{ color: node.color }} 
                              />
                            </g>
                          )}

                          {/* Node Label Text */}
                          <text
                            x={
                              isLeftLabel 
                                ? labelX - 16 // shift left to clear icon
                                : labelX + 16 // shift right to clear icon
                            }
                            y={node.finalY + (node.height / 2) + 4}
                            textAnchor={labelAnchor}
                            fill={isLightMode ? '#2E3833' : '#E6EDE9'}
                            opacity={textOpacity}
                            className="text-[10px] font-mono font-bold tracking-tight select-none pointer-events-none"
                          >
                            {node.label}
                          </text>

                          {/* Secondary value tag on large enough nodes */}
                          {node.height >= 26 && (
                            <text
                              x={
                                isLeftLabel 
                                  ? labelX - 16
                                  : labelX + 16
                              }
                              y={node.finalY + (node.height / 2) + 14}
                              textAnchor={labelAnchor}
                              fill={isLightMode ? '#6B7A72' : '#A4B5AC'}
                              opacity={textOpacity * 0.75}
                              className="text-[8px] font-mono select-none pointer-events-none"
                            >
                              {formatAmount(node.value, currency, thousandsSeparator, false)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                </svg>
              )}

              {/* Floating Portal Tooltip */}
              <AnimatePresence>
                {tooltip && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{ 
                      position: 'fixed', 
                      left: tooltip.x + 15, 
                      top: tooltip.y + 15,
                      pointerEvents: 'none'
                    }}
                    className="z-50 bg-surface-container/95 border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-md"
                  >
                    {tooltip.content}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
