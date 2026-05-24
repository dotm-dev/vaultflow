import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CloudUpload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { parseCSVStatement } from '../lib/csv';
import { Transaction } from '../types';
import { getConfig } from '../lib/db';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (txs: Transaction[]) => Promise<void>;
  currency: string;
}

export default function ImportModal({ isOpen, onClose, onImport, currency }: ImportModalProps) {
  const [parsedTxs, setParsedTxs] = useState<Partial<Transaction>[]>([]);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'importing'>('idle');
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setStatus('error');
      setFileName('Invalid format. Please upload a .csv file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const txs = parseCSVStatement(text);
        setParsedTxs(txs);
        setFileName(file.name);
        setStatus('success');
      } catch (err) {
        console.error('CSV Parsing Error:', err);
        setStatus('error');
        setFileName('Failed to parse statement logs.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    setStatus('importing');
    
    // Check if AI categorization is enabled
    const aiConsent = await getConfig('ai_consent');
    
    const listToSave: Transaction[] = parsedTxs.map(partial => ({
      id: crypto.randomUUID(),
      booking_date: partial.booking_date || Date.now(),
      amount: partial.amount || 0,
      currency: partial.currency || currency,
      counterparty: partial.counterparty || 'Unknown Merchant',
      category_id: partial.category_id || 'other',
      type: partial.type || 'expense',
      raw_data: partial.raw_data,
    }));

    if (aiConsent) {
      try {
        // Only classify ones that weren't already classified by the CSV adapter
        const unclassified = listToSave.filter(t => t.category_id === 'other');
        const uniqueMerchants = Array.from(new Set(unclassified.map(t => t.counterparty))).filter(Boolean);

        if (uniqueMerchants.length > 0) {
          const response = await fetch('/api/categorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchants: uniqueMerchants }),
          });

          if (response.ok) {
            const classifications: Record<string, string> = await response.json();
            for (const tx of listToSave) {
              if (tx.category_id === 'other') {
                const predictedName = classifications[tx.counterparty];
                if (predictedName) {
                  tx.category_id = predictedName.toLowerCase();
                }
              }
            }
          }
        }
      } catch (aiErr) {
        console.error('Failed to fetch Gemini classifications:', aiErr);
      }
    }

    await onImport(listToSave);
    
    // Reset and close
    setParsedTxs([]);
    setFileName('');
    setStatus('idle');
    onClose();
  };

  const resetState = () => {
    if (status === 'importing') return;
    setParsedTxs([]);
    setFileName('');
    setStatus('idle');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (status !== 'importing') onClose(); }}
            className="fixed inset-0 bg-surface-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            {/* Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div>
                  <h2 className="text-xl font-bold text-on-surface">Import Statement</h2>
                  <p className="text-sm text-on-surface-variant">Upload a bank CSV to append data</p>
                </div>
                <button 
                  onClick={onClose}
                  disabled={status === 'importing'}
                  className="p-2 rounded-full hover:bg-white/5 text-on-surface-variant transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".csv, text/csv, application/csv, text/comma-separated-values, application/vnd.ms-excel" 
                  className="hidden" 
                />
                
                <div 
                  role="button"
                  tabIndex={status === 'importing' ? -1 : 0}
                  aria-disabled={status === 'importing'}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (status !== 'importing') fileInputRef.current?.click(); } }}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleFileDrop}
                  onClick={() => status !== 'importing' && fileInputRef.current?.click()}
                  className={cn(
                    "w-full h-48 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 transition-all px-4 text-center",
                    status === 'importing' ? "opacity-50 cursor-not-allowed" : "cursor-pointer group",
                    dragActive ? "border-nature-green bg-nature-green/10" : "border-white/10 hover:border-nature-green hover:bg-nature-green/5"
                  )}
                >
                  <div className="w-16 h-16 rounded-full glass-card flex items-center justify-center transition-transform group-hover:scale-110">
                    {status === 'importing' ? (
                      <Loader2 className="w-8 h-8 text-nature-green animate-spin" />
                    ) : (
                      <CloudUpload className={cn("w-8 h-8 text-on-surface-variant group-hover:text-nature-green", status === 'success' && 'text-nature-green')} />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface mb-1 group-hover:text-nature-green transition-colors">
                      {status === 'success' ? 'Statement Loaded!' : status === 'importing' ? 'Importing...' : 'Drop CSV statement here'}
                    </h2>
                    <p className="text-xs text-on-surface-variant max-w-[280px] mx-auto">
                      {status === 'success' 
                        ? `${parsedTxs.length} transaction entries detected.` 
                        : status === 'importing' 
                          ? 'Categorizing and encrypting...' 
                          : 'Upload standard or PostFinance statements.'}
                    </p>
                  </div>
                </div>

                {status === 'success' && (
                  <div className="flex items-center justify-between w-full bg-surface-container-low rounded-2xl p-4 border border-white/5 font-mono text-xs text-on-surface-variant">
                    <div className="flex items-center gap-2 truncate max-w-[80%]">
                      <CheckCircle className="w-4 h-4 text-nature-green shrink-0 animate-bounce" />
                      <span className="truncate">{fileName}</span>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        resetState();
                      }}
                      className="text-earth-clay font-bold hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {status === 'error' && (
                  <div className="flex items-center justify-between gap-2 text-earth-clay font-mono text-xs bg-earth-clay/10 p-4 border border-earth-clay/20 rounded-2xl w-full">
                    <div className="flex items-center gap-2 truncate">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="truncate">{fileName}</span>
                    </div>
                    <button onClick={resetState} className="font-bold hover:underline shrink-0">Try Again</button>
                  </div>
                )}

                {status === 'idle' && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3.5 rounded-full glass-card border-white/10 text-on-surface text-xs font-bold uppercase tracking-wider hover:border-nature-green hover:text-nature-green transition-all"
                  >
                    Browse Files
                  </button>
                )}

                {status === 'success' && (
                  <button 
                    onClick={handleConfirmImport}
                    className="w-full py-3.5 rounded-full bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,242,234,0.2)] cursor-pointer"
                  >
                    Confirm Import
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
