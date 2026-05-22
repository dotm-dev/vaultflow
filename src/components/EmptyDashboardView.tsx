import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Shield, Plus, CloudUpload, Target, CloudOff, Sun, Moon, LogOut, FileText, Code, Lock, X, Edit2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface EmptyDashboardViewProps {
  onImport: () => void;
  onManualExpense: () => void;
  onSetBudget: () => void;
  onConfigureBackup: () => void;
  onSettings: () => void;
  onLock: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currency: string;
  isCloudConnected: boolean;
  activeVaultName: string;
  onUpdateVaultName: (name: string) => Promise<void>;
}

export default function EmptyDashboardView({ 
  onImport, 
  onManualExpense, 
  onSetBudget, 
  onConfigureBackup, 
  onSettings, 
  onLock, 
  theme, 
  onToggleTheme, 
  currency, 
  isCloudConnected,
  activeVaultName,
  onUpdateVaultName
}: EmptyDashboardViewProps) {
  const [activeModal, setActiveModal] = useState<'docs' | 'security' | 'manifest' | 'source' | null>(null);
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
    docs: {
      title: 'Ledger Documentation',
      subtitle: 'HOW OFFLINE CRYPTOGRAPHY SAFEGUARDS YOUR LEDGER',
      icon: FileText,
      color: 'text-nature-green',
      body: 'Learn how VaultFlow’s visual-first offline architecture structures your finance records. By normalizing bank statement CSVs locally and routing tags via your private node classification agent, we completely bypass server storage. Explore standard encrypted backup recovery, recurring schedule intervals, and sub-second rendering.'
    },
    security: {
      title: 'Cryptographic Engine Audit',
      subtitle: 'NATIVE AES-GCM 256-BIT SECURE ENVELOPES',
      icon: Shield,
      color: 'text-ocean-blue',
      body: 'Your master passcode acts as the absolute derivation source. VaultFlow triggers the native browser Web Cryptography API (`subtle`) using HMAC-SHA256 PBKDF2 with 100,000 iterations to derive an ephemeral 256-bit symmetric key. Payloads are encrypted with unique 96-bit initialization vectors before resting safely inside your browser sandboxed IndexedDB.'
    },
    manifest: {
      title: 'VaultFlow Privacy Manifest',
      subtitle: 'ZERO STORAGE. ZERO TRACKING. 100% OFF-CHAIN.',
      icon: Lock,
      color: 'text-sand-gold',
      body: 'Your finances are private. We do not integrate tracking SDKs, analytical hooks, or telemetry scripts. No registration details, session keys, balances, or transaction details ever exit your local device context. Your ledger is owned by you, saved by you, and decrypted solely by you.'
    },
    source: {
      title: 'Open Source Assurance',
      subtitle: 'TRANSPARENT ARCHITECTURE AND BUILD VERIFICATION',
      icon: Code,
      color: 'text-nature-green',
      body: 'VaultFlow is engineered on open standard runtimes: React, Vite, Framer Motion, and Tailwind CSS. The code builds directly into client-side static bundles with no proprietary libraries. You can audit the codebase and verify the local proxy parameters to ensure absolutely zero backdoors exist.'
    }
  };

  return (
    <div className="h-screen flex flex-col antialiased bg-surface-dark overflow-y-auto selection:bg-nature-green selection:text-surface-dark relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-nature-green/5 blur-[120px] rounded-full pointer-events-none" />

      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-white/5 shrink-0 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center relative">
          {/* Left Side: Logo & Sync Badge */}
          <div className="flex items-center gap-3">
            <span className="text-xl font-black text-nature-green tracking-tighter hover:scale-105 transition-transform duration-300 leading-none">
              VaultFlow
            </span>
            <div className={cn("px-2 py-0.5 rounded flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest border shrink-0", isCloudConnected ? "bg-ocean-blue/10 text-ocean-blue border-ocean-blue/20" : "bg-earth-clay/10 text-earth-clay border-earth-clay/20")}>
              {isCloudConnected ? <CloudUpload className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {isCloudConnected ? 'Cloud Synced' : 'Local Only'}
            </div>
          </div>

          {/* Middle Side: Ledger Name */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10">
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

          {/* Right Side: Buttons */}
          <div className="flex items-center gap-3">
            <button 
              onClick={onToggleTheme}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-nature-green transition-all cursor-pointer"
              title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
            </button>
            <button 
              onClick={onSettings}
              title="Settings"
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-nature-green transition-all cursor-pointer"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={onLock}
              title="Lock Session"
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col justify-center px-6 max-w-7xl mx-auto w-full py-8 md:py-12 z-10 gap-10 min-h-0">


        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-grow shrink-0">
          <motion.div 
            whileHover={{ scale: 1.01 }}
            onClick={onImport}
            className="md:col-span-8 group relative glass-card rounded-[32px] p-8 cursor-pointer overflow-hidden flex flex-col justify-between min-h-[340px] border border-white/5 hover:border-nature-green/20 transition-all"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-nature-green/5 rounded-full blur-[80px] group-hover:bg-nature-green/10 transition-colors duration-500" />
            <div className="flex justify-end relative z-10">
              <CloudUpload className="w-24 h-24 text-nature-green/80 group-hover:scale-110 transition-transform duration-500 fill-nature-green/10 drop-shadow-[0_0_15px_rgba(0,242,234,0.3)]" />
            </div>
            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-black text-on-surface group-hover:text-nature-green transition-colors mb-3 tracking-tight">Import First Report</h2>
              <p className="text-on-surface-variant max-w-md text-lg">Securely upload your financial history to initialize your dashboard.</p>
            </div>
          </motion.div>

          <div className="md:col-span-4 flex flex-col gap-6">
            <motion.div 
              whileHover={{ scale: 1.02, x: 4 }}
              onClick={onSetBudget}
              className="flex-1 glass-card rounded-[28px] p-8 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[160px] group border border-white/5 hover:border-ocean-blue/20 transition-all"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-ocean-blue/5 rounded-full blur-[40px] group-hover:bg-ocean-blue/10 transition-colors" />
              <div className="flex justify-end relative z-10">
                <Target className="w-10 h-10 text-ocean-blue group-hover:scale-110 transition-transform drop-shadow-[0_0_10px_rgba(142,84,255,0.3)]" />
              </div>
              <h3 className="text-2xl font-bold text-on-surface group-hover:text-ocean-blue transition-colors tracking-tight relative z-10">Set First Budget</h3>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.02, x: 4 }}
              onClick={onManualExpense}
              className="flex-1 glass-card rounded-[28px] p-8 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[160px] group border border-white/5 hover:border-nature-green/20 transition-all"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-nature-green/5 rounded-full blur-[40px] group-hover:bg-nature-green/10 transition-colors" />
              <div className="flex justify-end relative z-10">
                <Plus className="w-10 h-10 text-nature-green group-hover:scale-110 transition-transform drop-shadow-[0_0_10px_rgba(123,160,91,0.3)]" />
              </div>
              <h3 className="text-2xl font-bold text-on-surface group-hover:text-nature-green transition-colors tracking-tight relative z-10">Add Manual Record</h3>
            </motion.div>
          </div>

          <motion.div 
            whileHover={{ y: -4 }}
            onClick={onConfigureBackup}
            className="md:col-span-12 glass-card rounded-[28px] p-8 cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between group border border-white/5 hover:border-sand-gold/20 transition-all gap-4"
          >
            <div className="space-y-1">
              <h3 className="text-2xl font-bold text-sand-gold tracking-tight">Configure Backup</h3>
              <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest font-bold">Ensure local data persistence.</p>
            </div>
            <div className="h-14 w-14 rounded-full bg-surface-dark border border-white/5 flex items-center justify-center group-hover:border-sand-gold/30 transition-colors shrink-0">
              <CloudOff className="w-6 h-6 text-on-surface-variant group-hover:text-sand-gold transition-colors" />
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="w-full py-6 md:py-8 px-8 flex flex-col md:flex-row justify-between items-center gap-6 bg-surface-dark border-t border-white/5 z-20 shrink-0 mt-auto">
        <div className="text-lg font-black text-nature-green select-none">VaultFlow</div>
        <div className="font-mono text-[10px] text-on-surface-variant font-medium select-none">
          © 2026 VaultFlow. Visual-First Privacy.
        </div>
        <nav className="flex flex-wrap justify-center gap-6 font-mono text-[10px] uppercase tracking-wider font-semibold">
          <button onClick={() => setActiveModal('docs')} className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors cursor-pointer">
            Documentation
          </button>
          <button onClick={() => setActiveModal('security')} className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors cursor-pointer">
            Security Audit
          </button>
          <button onClick={() => setActiveModal('manifest')} className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors cursor-pointer">
            Privacy Manifest
          </button>
          <button onClick={() => setActiveModal('source')} className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors cursor-pointer">
            Source Code
          </button>
        </nav>
      </footer>

      {/* Slide-In Glassmorphism Modal Overlay */}
      <AnimatePresence>
        {activeModal && modalContent[activeModal as keyof typeof modalContent] && (() => {
          const content = modalContent[activeModal as keyof typeof modalContent];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-[500px] bg-surface-container rounded-[32px] p-8 md:p-10 border border-white/10 shadow-2xl flex flex-col items-center gap-6"
              >
                <button
                  onClick={() => setActiveModal(null)}
                  className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-white/5 flex items-center justify-center shrink-0">
                  <content.icon className={cn("w-8 h-8", content.color)} />
                </div>

                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-black text-on-surface tracking-tight leading-none">
                    {content.title}
                  </h2>
                  <p className="font-mono text-[9px] text-on-surface-variant tracking-[0.2em] font-bold uppercase">
                    {content.subtitle}
                  </p>
                </div>

                <p className="text-sm text-on-surface-variant/80 text-center leading-relaxed font-normal">
                  {content.body}
                </p>

                <button
                  onClick={() => setActiveModal(null)}
                  className="w-full h-12 rounded-xl border border-white/10 text-on-surface hover:text-nature-green hover:border-nature-green hover:bg-nature-green/5 font-bold text-xs uppercase tracking-wider active:scale-95 transition-all font-mono cursor-pointer"
                >
                  Acknowledged & Secure
                </button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onManualExpense}
        className="fixed bottom-10 right-10 w-16 h-16 rounded-full bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark flex items-center justify-center shadow-[0_0_30px_rgba(0,242,234,0.3)] z-40 hover:shadow-[0_0_40px_rgba(0,242,234,0.5)] cursor-pointer"
      >
        <Plus className="w-8 h-8 text-surface-dark" />
      </motion.button>
    </div>
  );
}
