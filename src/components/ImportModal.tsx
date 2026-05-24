import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CloudUpload, CheckCircle, AlertCircle, Loader2, Trash2, Info, Settings, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { parseCSVStatement, parseCSVPreview, parseCSVWithProfile } from '../lib/csv';
import { Transaction, CSVMappingProfile } from '../types';
import { getConfig, saveConfig } from '../lib/db';
import { formatAmount, formatDate, getTimezoneDateParts } from '../lib/formatters';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (txs: Transaction[]) => Promise<void>;
  currency: string;
  transactions?: Transaction[];
  timezone?: string;
}

function isDuplicateOfAny(tx: Transaction, existingList: Transaction[], timezone: string): boolean {
  return existingList.some(existing => {
    // 1. Same amount
    if (existing.amount !== tx.amount) return false;
    
    // 2. Same type
    if (existing.type !== tx.type) return false;
    
    // 3. Same currency
    if (existing.currency !== tx.currency) return false;
    
    // 4. Same counterparty (case-insensitive, trimmed)
    const cp1 = (existing.counterparty || '').trim().toLowerCase();
    const cp2 = (tx.counterparty || '').trim().toLowerCase();
    if (cp1 !== cp2) return false;
    
    // 5. Same calendar date (ignoring time)
    const p1 = getTimezoneDateParts(existing.booking_date, timezone);
    const p2 = getTimezoneDateParts(tx.booking_date, timezone);
    return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
  });
}

export default function ImportModal({ 
  isOpen, 
  onClose, 
  onImport, 
  currency, 
  transactions = [], 
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone 
}: ImportModalProps) {
  const [parsedTxs, setParsedTxs] = useState<Transaction[]>([]);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'importing'>('idle');
  const [dragActive, setDragActive] = useState(false);
  
  // Custom CSV Mapping states
  const [customProfiles, setCustomProfiles] = useState<CSVMappingProfile[]>([]);
  const [rawFileContent, setRawFileContent] = useState('');
  const [mappingMode, setMappingMode] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [csvDelimiter, setCsvDelimiter] = useState(',');
  
  // Mapping selectors
  const [dateHeader, setDateHeader] = useState('');
  const [descHeader, setDescHeader] = useState('');
  const [amountType, setAmountType] = useState<'single' | 'split'>('single');
  const [amountHeader, setAmountHeader] = useState('');
  const [debitHeader, setDebitHeader] = useState('');
  const [creditHeader, setCreditHeader] = useState('');
  
  const [shouldSaveProfile, setShouldSaveProfile] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [detectedProfile, setDetectedProfile] = useState<CSVMappingProfile | null>(null);

  // Load custom mapping profiles on mount
  useEffect(() => {
    if (isOpen) {
      const loadProfiles = async () => {
        try {
          const stored = await getConfig('csv_mapping_profiles');
          if (stored) {
            setCustomProfiles(stored);
          } else {
            setCustomProfiles([]);
          }
        } catch (e) {
          console.error('Failed to load mapping profiles:', e);
        }
      };
      loadProfiles();
    }
  }, [isOpen]);

  // Guess columns based on typical bank header keywords
  const guessHeaders = (headers: string[]) => {
    const lowercaseHeaders = headers.map(h => h.toLowerCase());
    
    // Guess Date
    const dateIdx = lowercaseHeaders.findIndex(h => h.includes('date') || h.includes('data') || h.includes('giorno') || h.includes('datum'));
    if (dateIdx !== -1) setDateHeader(headers[dateIdx]);
    else if (headers.length > 0) setDateHeader(headers[0]);
    
    // Guess Counterparty / Description
    const descIdx = lowercaseHeaders.findIndex(h => h.includes('desc') || h.includes('merchant') || h.includes('counterparty') || h.includes('payee') || h.includes('causale') || h.includes('subject') || h.includes('dettagli') || h.includes('beneficiary') || h.includes('notification'));
    if (descIdx !== -1) setDescHeader(headers[descIdx]);
    else if (headers.length > 1) setDescHeader(headers[1]);
    
    // Guess Amount Type (Single vs Split Debit/Credit)
    const debitIdx = lowercaseHeaders.findIndex(h => h.includes('debit') || h.includes('addebito') || h.includes('soll') || h.includes('uscita') || (h.includes('debit') && h.includes('chf')));
    const creditIdx = lowercaseHeaders.findIndex(h => h.includes('credit') || h.includes('accredito') || h.includes('haben') || h.includes('entrata') || (h.includes('credit') && h.includes('chf')));
    
    if (debitIdx !== -1 && creditIdx !== -1) {
      setAmountType('split');
      setDebitHeader(headers[debitIdx]);
      setCreditHeader(headers[creditIdx]);
    } else {
      setAmountType('single');
      const amountIdx = lowercaseHeaders.findIndex(h => h.includes('amount') || h.includes('importo') || h.includes('value') || h.includes('valore') || h.includes('betrag') || h.includes('sum') || h.includes('totale'));
      if (amountIdx !== -1) setAmountHeader(headers[amountIdx]);
      else if (headers.length > 2) setAmountHeader(headers[2]);
    }
  };

  // Helper to map and check duplicates
  const processParsedTransactions = (txs: Partial<Transaction>[]) => {
    const mappedTxs: Transaction[] = txs.map(partial => ({
      id: crypto.randomUUID(),
      booking_date: partial.booking_date || Date.now(),
      amount: partial.amount || 0,
      currency: partial.currency || currency,
      counterparty: partial.counterparty || 'Unknown Merchant',
      category_id: partial.category_id || 'other',
      type: partial.type || 'expense',
      raw_data: partial.raw_data,
    }));

    // Identify duplicates
    const dups = mappedTxs.filter(tx => isDuplicateOfAny(tx, transactions, timezone));
    const nonDups = mappedTxs.filter(tx => !isDuplicateOfAny(tx, transactions, timezone));

    setDuplicateCheckResult({
      duplicates: dups,
      nonDuplicates: nonDups,
      onlyDuplicates: dups.length === mappedTxs.length,
      hasDuplicates: dups.length > 0,
    });

    setSelectedDuplicateIds(new Set());
    setParsedTxs(mappedTxs);
    setStatus('success');
  };

  // Apply custom mapping profile
  const handleApplyMapping = async () => {
    if (!dateHeader || !descHeader) {
      alert('Please select both the Date and Merchant columns.');
      return;
    }
    if (amountType === 'single' && !amountHeader) {
      alert('Please select the Amount column.');
      return;
    }
    if (amountType === 'split' && (!debitHeader || !creditHeader)) {
      alert('Please select both the Debit and Credit columns.');
      return;
    }

    const profile: CSVMappingProfile = {
      id: crypto.randomUUID(),
      name: profileNameInput.trim() || `Profile (${fileName})`,
      headers: csvHeaders,
      delimiter: csvDelimiter,
      dateHeader,
      counterpartyHeader: descHeader,
      amountType,
      amountHeader: amountType === 'single' ? amountHeader : undefined,
      debitHeader: amountType === 'split' ? debitHeader : undefined,
      creditHeader: amountType === 'split' ? creditHeader : undefined,
    };

    if (shouldSaveProfile) {
      try {
        const updated = [...customProfiles, profile];
        await saveConfig('csv_mapping_profiles', updated);
        setCustomProfiles(updated);
      } catch (err) {
        console.error('Failed to save CSV profile:', err);
      }
    }

    try {
      const txs = parseCSVWithProfile(rawFileContent, profile);
      setMappingMode(false);
      processParsedTransactions(txs);
    } catch (err) {
      console.error('Failed to parse CSV with profile:', err);
      setStatus('error');
      setFileName('Failed to parse file with custom mapping.');
      setMappingMode(false);
    }
  };

  // Delete saved mapping profile
  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this saved bank format layout?')) return;
    try {
      const updated = customProfiles.filter(p => p.id !== id);
      await saveConfig('csv_mapping_profiles', updated);
      setCustomProfiles(updated);
      if (detectedProfile?.id === id) {
        setDetectedProfile(null);
        setMappingMode(true);
      }
    } catch (err) {
      console.error('Failed to delete mapping profile:', err);
    }
  };
  
  // Duplicate checking states
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<{
    duplicates: Transaction[];
    nonDuplicates: Transaction[];
    onlyDuplicates: boolean;
    hasDuplicates: boolean;
  } | null>(null);
  
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  
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
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        setRawFileContent(text);
        setFileName(file.name);
        
        // 1. Check if it's PostFinance or standard registered adapter
        const isPostFinance = text.includes('Date from:;=') || text.includes('Credit in CHF;Debit in CHF');
        if (isPostFinance) {
          const txs = parseCSVStatement(text);
          processParsedTransactions(txs);
          return;
        }

        // 2. Unrecognized CSV format. Parse headers & delimiter.
        const { headers, previewRows, delimiter } = parseCSVPreview(text);
        setCsvHeaders(headers);
        setCsvPreviewRows(previewRows);
        setCsvDelimiter(delimiter);

        if (headers.length === 0) {
          setStatus('error');
          setFileName('The CSV file appears to be empty or malformed.');
          return;
        }

        // 3. Look for a saved profile matching these headers
        const matchingProfile = customProfiles.find(p => {
          const hasDate = headers.map(h => h.toLowerCase()).includes(p.dateHeader.toLowerCase());
          const hasDesc = headers.map(h => h.toLowerCase()).includes(p.counterpartyHeader.toLowerCase());
          const hasAmount = p.amountType === 'single'
            ? headers.map(h => h.toLowerCase()).includes((p.amountHeader || '').toLowerCase())
            : headers.map(h => h.toLowerCase()).includes((p.debitHeader || '').toLowerCase()) &&
              headers.map(h => h.toLowerCase()).includes((p.creditHeader || '').toLowerCase());
          return hasDate && hasDesc && hasAmount;
        });

        if (matchingProfile) {
          setDetectedProfile(matchingProfile);
          const txs = parseCSVWithProfile(text, matchingProfile);
          processParsedTransactions(txs);
        } else {
          // No profile matched, trigger Mapping Mode UI
          setMappingMode(true);
          guessHeaders(headers);
        }
      } catch (err) {
        console.error('CSV Processing Error:', err);
        setStatus('error');
        setFileName('Failed to parse statement logs.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async (overrideTxs?: Transaction[]) => {
    setStatus('importing');
    
    // Check if AI categorization is enabled
    const aiConsent = await getConfig('ai_consent');
    
    const listToSave = overrideTxs || parsedTxs;

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
    resetState();
    onClose();
  };

  const resetState = () => {
    if (status === 'importing') return;
    setParsedTxs([]);
    setFileName('');
    setStatus('idle');
    setDuplicateCheckResult(null);
    setReviewMode(false);
    setSelectedDuplicateIds(new Set());
    setRawFileContent('');
    setMappingMode(false);
    setDetectedProfile(null);
    setShouldSaveProfile(false);
    setProfileNameInput('');
  };

  const handleClose = () => {
    if (status === 'importing') return;
    resetState();
    onClose();
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
            onClick={handleClose}
            className="fixed inset-0 bg-surface-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            {/* Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "glass-card rounded-3xl w-full overflow-hidden relative shadow-2xl transition-all duration-300",
                mappingMode ? "max-w-3xl" : reviewMode ? "max-w-xl" : "max-w-md"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div>
                  <h2 className="text-xl font-bold text-on-surface">
                    {mappingMode ? 'Map CSV Columns' : reviewMode ? 'Review Duplicates' : 'Import Statement'}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {mappingMode ? 'Align CSV columns with ledger fields' : reviewMode ? 'Choose which duplicates to import' : 'Upload a bank CSV to append data'}
                  </p>
                </div>
                <button 
                  onClick={mappingMode ? () => { setMappingMode(false); resetState(); } : reviewMode ? () => setReviewMode(false) : handleClose}
                  disabled={status === 'importing'}
                  className="p-2 rounded-full hover:bg-white/5 text-on-surface-variant transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                {reviewMode ? (
                  /* Review Mode UI */
                  <div className="space-y-4">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      The following transactions already exist in your ledger. By default, they are skipped. Select any you wish to import anyway.
                    </p>

                    <div className="overflow-y-auto space-y-2 pr-1 max-h-[300px] scrollbar-thin">
                      {duplicateCheckResult?.duplicates.map((tx) => {
                        const isSelected = selectedDuplicateIds.has(tx.id);
                        const isExpense = tx.type === 'expense';
                        
                        return (
                          <div 
                            key={tx.id}
                            onClick={() => {
                              setSelectedDuplicateIds(prev => {
                                const next = new Set(prev);
                                if (next.has(tx.id)) {
                                  next.delete(tx.id);
                                } else {
                                  next.add(tx.id);
                                }
                                return next;
                              });
                            }}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer select-none",
                              isSelected 
                                ? "bg-nature-green/10 border-nature-green/30 hover:bg-nature-green/15" 
                                : "bg-surface-container-low border-white/5 hover:border-white/10 hover:bg-white/5"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              {/* Custom Checkbox */}
                              <div className={cn(
                                "w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0",
                                isSelected 
                                  ? "bg-nature-green border-nature-green text-surface-dark" 
                                  : "border-on-surface-variant/30 text-transparent"
                              )}>
                                <CheckCircle className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                              <div className="flex flex-col truncate">
                                <span className="text-sm font-bold text-on-surface truncate">{tx.counterparty}</span>
                                <span className="text-[10px] font-mono text-on-surface-variant">
                                  {formatDate(tx.booking_date, 'MMM DD, YYYY', timezone)}
                                </span>
                              </div>
                            </div>
                            
                            <div className="text-right shrink-0">
                              <span className={cn(
                                "text-sm font-mono font-bold",
                                isExpense ? "text-earth-clay" : "text-nature-green"
                              )}>
                                {isExpense ? '-' : '+'}{formatAmount(tx.amount, currency, ',', true)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary Box */}
                    <div className="bg-surface-container-low border border-white/5 rounded-2xl p-4 flex flex-col gap-2 text-xs font-mono text-on-surface-variant">
                      <div className="flex justify-between">
                        <span>New Transactions:</span>
                        <span className="text-on-surface font-bold">{duplicateCheckResult?.nonDuplicates.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Selected Duplicates:</span>
                        <span className={cn("font-bold", selectedDuplicateIds.size > 0 ? "text-nature-green" : "text-on-surface-variant")}>
                          +{selectedDuplicateIds.size}
                        </span>
                      </div>
                      <div className="border-t border-white/5 pt-2 flex justify-between text-sm font-bold text-on-surface">
                        <span>Total to Import:</span>
                        <span>{(duplicateCheckResult?.nonDuplicates.length || 0) + selectedDuplicateIds.size}</span>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-2">
                      <button 
                        onClick={() => setReviewMode(false)}
                        className="flex-1 py-3.5 rounded-full glass-card border-white/10 text-on-surface text-xs font-bold uppercase tracking-wider hover:border-nature-green hover:text-nature-green transition-all cursor-pointer"
                      >
                        Back
                      </button>
                      <button 
                        onClick={() => {
                          const selectedDups = duplicateCheckResult?.duplicates.filter(tx => selectedDuplicateIds.has(tx.id)) || [];
                          const toImport = [...(duplicateCheckResult?.nonDuplicates || []), ...selectedDups];
                          handleConfirmImport(toImport);
                        }}
                        className="flex-1 py-3.5 rounded-full bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,242,234,0.2)] cursor-pointer"
                      >
                        Confirm Import
                      </button>
                    </div>
                  </div>
                ) : mappingMode ? (
                  /* Mapping Mode UI */
                  <div className="space-y-5 text-left">
                    <div className="bg-ocean-blue/10 border border-ocean-blue/20 rounded-2xl p-4 flex gap-3 items-start">
                      <Info className="w-5 h-5 text-ocean-blue shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Unrecognized CSV Format</h4>
                        <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                          We couldn't match this CSV file with our predefined bank templates. Map the columns below using the first 3 rows as a reference.
                        </p>
                      </div>
                    </div>

                    {/* CSV Preview Table */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">CSV File Sample Data</label>
                      <div className="overflow-x-auto border border-white/5 rounded-2xl max-h-40 scrollbar-thin">
                        <table className="w-full text-left font-mono text-[10px]">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              {csvHeaders.map((header, idx) => (
                                <th key={idx} className="p-2.5 text-on-surface font-bold whitespace-nowrap border-r border-white/5 last:border-r-0">
                                  {header || `Column ${idx + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreviewRows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="border-b border-white/5 bg-transparent last:border-b-0">
                                {csvHeaders.map((_, colIdx) => (
                                  <td key={colIdx} className="p-2.5 text-on-surface-variant whitespace-nowrap border-r border-white/5 last:border-r-0">
                                    {row[colIdx] || ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Selectors Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Date Column */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Date Column</label>
                        <select
                          value={dateHeader}
                          onChange={(e) => setDateHeader(e.target.value)}
                          className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                        >
                          <option value="">-- Select Column --</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>

                      {/* Merchant Column */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Merchant / Counterparty Column</label>
                        <select
                          value={descHeader}
                          onChange={(e) => setDescHeader(e.target.value)}
                          className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                        >
                          <option value="">-- Select Column --</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>

                      {/* Amount Layout Option */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Amount Column Layout</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setAmountType('single')}
                            className={cn(
                              "py-2 px-3 rounded-xl border font-mono text-xs text-center transition-all cursor-pointer",
                              amountType === 'single'
                                ? "bg-nature-green/10 border-nature-green/30 text-nature-green"
                                : "bg-surface-dark border-white/10 text-on-surface-variant hover:border-white/20"
                            )}
                          >
                            Single Column (+/-)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAmountType('split')}
                            className={cn(
                              "py-2 px-3 rounded-xl border font-mono text-xs text-center transition-all cursor-pointer",
                              amountType === 'split'
                                ? "bg-nature-green/10 border-nature-green/30 text-nature-green"
                                : "bg-surface-dark border-white/10 text-on-surface-variant hover:border-white/20"
                            )}
                          >
                            Separate Debit / Credit
                          </button>
                        </div>
                      </div>

                      {/* Amount Column selectors */}
                      {amountType === 'single' ? (
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Amount Column</label>
                          <select
                            value={amountHeader}
                            onChange={(e) => setAmountHeader(e.target.value)}
                            className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                          >
                            <option value="">-- Select Column --</option>
                            {csvHeaders.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Debit Column (Expenses)</label>
                            <select
                              value={debitHeader}
                              onChange={(e) => setDebitHeader(e.target.value)}
                              className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                            >
                              <option value="">-- Select Column --</option>
                              {csvHeaders.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Credit Column (Incomes)</label>
                            <select
                              value={creditHeader}
                              onChange={(e) => setCreditHeader(e.target.value)}
                              className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                            >
                              <option value="">-- Select Column --</option>
                              {csvHeaders.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Save Profile Section */}
                    <div className="border-t border-white/5 pt-4 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={shouldSaveProfile}
                          onChange={(e) => setShouldSaveProfile(e.target.checked)}
                          className="w-4 h-4 rounded-sm border border-white/10 bg-surface-dark text-nature-green focus:ring-0 outline-none cursor-pointer"
                        />
                        <span className="text-xs text-on-surface">Save this layout as a reusable template</span>
                      </label>

                      {shouldSaveProfile && (
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Profile Name</label>
                          <input
                            type="text"
                            placeholder="e.g. My Bank CSV Profile"
                            value={profileNameInput}
                            onChange={(e) => setProfileNameInput(e.target.value)}
                            className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50"
                          />
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMappingMode(false);
                          resetState();
                        }}
                        className="flex-1 py-3 rounded-xl border border-white/10 hover:border-earth-clay hover:text-earth-clay text-on-surface text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyMapping}
                        className="flex-1 py-3 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,242,234,0.2)] cursor-pointer"
                      >
                        Apply Mapping
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Mode UI */
                  <div className="space-y-6">
                    {/* Saved Templates Selector */}
                    {status === 'idle' && customProfiles.length > 0 && (
                      <div className="space-y-2 border border-white/5 rounded-2xl p-4 bg-white/[0.01]">
                        <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest font-mono flex items-center gap-1.5 text-left">
                          <Settings className="w-3.5 h-3.5 text-ocean-blue" />
                          Saved Bank Layouts
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto scrollbar-thin">
                          {customProfiles.map(p => (
                            <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container-low border border-white/5 text-[11px] font-mono">
                              <span className="text-on-surface truncate pr-2">{p.name}</span>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteProfile(p.id, e)}
                                className="p-1 text-on-surface-variant hover:text-earth-clay transition-colors cursor-pointer"
                                title="Delete mapping profile"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Auto-detected Profile Banner */}
                    {status === 'success' && detectedProfile && (
                      <div className="p-3.5 bg-nature-green/10 border border-nature-green/20 rounded-2xl flex items-center justify-between gap-3 text-xs text-left">
                        <div className="flex items-center gap-2 text-on-surface-variant">
                          <CheckCircle className="w-4 h-4 text-nature-green shrink-0" />
                          <span>Mapped using profile <strong>{detectedProfile.name}</strong>.</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            setMappingMode(true);
                            setDateHeader(detectedProfile.dateHeader);
                            setDescHeader(detectedProfile.counterpartyHeader);
                            setAmountType(detectedProfile.amountType);
                            if (detectedProfile.amountType === 'single') {
                              setAmountHeader(detectedProfile.amountHeader || '');
                            } else {
                              setDebitHeader(detectedProfile.debitHeader || '');
                              setCreditHeader(detectedProfile.creditHeader || '');
                            }
                            setProfileNameInput(detectedProfile.name);
                            setShouldSaveProfile(false);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface border border-white/10 hover:border-white/20 transition-all font-bold font-mono text-[10px] shrink-0 cursor-pointer"
                        >
                          Remap Columns
                        </button>
                      </div>
                    )}

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".csv, text/csv, application/csv, text/comma-separated-values, application/vnd.ms-excel" 
                      className="hidden" 
                    />
                    
                    {/* File Drop/Upload Box */}
                    {(status === 'idle' || status === 'error' || (status === 'success' && !duplicateCheckResult?.onlyDuplicates)) && (
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
                                : 'Upload standard or custom statements.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Loader view when active importing */}
                    {status === 'importing' && (
                      <div className="w-full h-48 flex flex-col items-center justify-center gap-4 text-center">
                        <div className="w-16 h-16 rounded-full glass-card flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-nature-green animate-spin" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-on-surface mb-1">Importing...</h2>
                          <p className="text-xs text-on-surface-variant">Categorizing and encrypting...</p>
                        </div>
                      </div>
                    )}

                    {/* Success state - Only Duplicates (Case 2) */}
                    {status === 'success' && duplicateCheckResult?.onlyDuplicates && (
                      <div className="space-y-6">
                        <div className="p-5 bg-earth-clay/10 border border-earth-clay/20 rounded-3xl flex flex-col items-center text-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-earth-clay/25 flex items-center justify-center text-earth-clay">
                            <AlertCircle className="w-6 h-6 animate-pulse" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-on-surface mb-1">Duplicate File Detected</h3>
                            <p className="text-xs text-on-surface-variant leading-relaxed">
                              All {parsedTxs.length} transactions in this statement already exist in your ledger. Would you like to import them anyway or stop the process?
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-4">
                          <button 
                            onClick={resetState}
                            className="flex-1 py-3.5 rounded-full glass-card border-white/10 text-on-surface text-xs font-bold uppercase tracking-wider hover:border-earth-clay hover:text-earth-clay transition-all cursor-pointer"
                          >
                            Stop Process
                          </button>
                          <button 
                            onClick={() => handleConfirmImport(parsedTxs)}
                            className="flex-1 py-3.5 rounded-full bg-earth-clay text-surface-dark text-xs font-bold uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                          >
                            Import anyway
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Success state - Some / No Duplicates (Case 1 & 3) */}
                    {status === 'success' && !duplicateCheckResult?.onlyDuplicates && (
                      <div className="space-y-4">
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

                        {/* Duplicates Warning Panel */}
                        {duplicateCheckResult?.hasDuplicates && (
                          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 text-on-surface-variant">
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                              <span>{duplicateCheckResult.duplicates.length} duplicate transactions detected.</span>
                            </div>
                            <button 
                              onClick={() => setReviewMode(true)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface border border-white/10 hover:border-white/20 transition-all font-bold shrink-0 cursor-pointer"
                            >
                              Review & Select
                            </button>
                          </div>
                        )}

                        <button 
                          onClick={() => {
                            if (duplicateCheckResult?.hasDuplicates) {
                              handleConfirmImport(duplicateCheckResult.nonDuplicates);
                            } else {
                              handleConfirmImport(parsedTxs);
                            }
                          }}
                          className="w-full py-3.5 rounded-full bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold uppercase tracking-wider hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,242,234,0.2)] cursor-pointer"
                        >
                          {duplicateCheckResult?.hasDuplicates 
                            ? `Import ${duplicateCheckResult.nonDuplicates.length} New Entries`
                            : 'Confirm Import'
                          }
                        </button>
                      </div>
                    )}

                    {/* Error State */}
                    {status === 'error' && (
                      <div className="flex items-center justify-between gap-2 text-earth-clay font-mono text-xs bg-earth-clay/10 p-4 border border-earth-clay/20 rounded-2xl w-full">
                        <div className="flex items-center gap-2 truncate">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span className="truncate">{fileName}</span>
                        </div>
                        <button onClick={resetState} className="font-bold hover:underline shrink-0">Try Again</button>
                      </div>
                    )}

                    {/* Idle State Browse Button */}
                    {status === 'idle' && (
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3.5 rounded-full glass-card border-white/10 text-on-surface text-xs font-bold uppercase tracking-wider hover:border-nature-green hover:text-nature-green transition-all cursor-pointer"
                      >
                        Browse Files
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
