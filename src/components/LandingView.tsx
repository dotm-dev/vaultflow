import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Key, Settings, User, Lock, Zap, Award, Shield, FileText, Code, ArrowRight, X, Sun, Moon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LandingViewProps {
  hasVault: boolean;
  onStart: () => void;
  onUnlock: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

type ModalType = 'docs' | 'security' | 'manifest' | 'source' | 'profile' | 'settings' | null;

export default function LandingView({ hasVault, onStart, onUnlock, theme, onToggleTheme }: LandingViewProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Content helper for interactive educational modals
  const modalContent = {
    docs: {
      title: 'Ledger Documentation',
      subtitle: 'HOW OFFLINE CRYPTOGRAPHY SAFEGUARDS YOUR LEDGER',
      icon: FileText,
      color: 'text-nature-green',
      body: 'Learn how VaultFlow\'s visual-first offline architecture structures your finance records. By normalizing bank statement CSVs locally and routing tags via your private node classification agent, we completely bypass server storage. Explore standard encrypted backup recovery, recurring schedule intervals, and sub-second rendering.'
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
    },
    profile: {
      title: 'User Profile Context',
      subtitle: 'LOCAL CREDENTIAL STORAGE',
      icon: User,
      color: 'text-nature-green',
      body: 'Because VaultFlow runs 100% offline, there are no remote accounts or user profiles. Your master password in this browser session is your identity. To backup your profile, use the Export Backup feature inside your dashboard.'
    },
    settings: {
      title: 'System Preferences',
      subtitle: 'LOCAL ENGINE OPTIONS',
      icon: Settings,
      color: 'text-ocean-blue',
      body: 'Manage encryption parameters, adjust Gemini category proxies, or clear the sandbox storage. Adjust these settings directly inside your dashboard once your local vault is successfully decrypted.'
    }
  };

  return (
    <div className="h-screen md:h-screen md:max-h-screen flex flex-col relative bg-surface-dark overflow-y-auto md:overflow-hidden selection:bg-nature-green selection:text-surface-dark">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-nature-green/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <button 
            onClick={() => setActiveModal('manifest')}
            className="text-2xl font-black text-nature-green tracking-tighter hover:scale-105 transition-transform"
          >
            VaultFlow
          </button>
          
          <button 
            onClick={onToggleTheme}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-on-surface-variant hover:text-nature-green active:scale-90 transition-all cursor-pointer relative"
            title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            <motion.div
              key={theme}
              initial={{ rotate: -90, scale: 0.8, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </motion.div>
          </button>
        </div>
      </header>

      {/* Single Viewport Hero & Bento Grid */}
      <main className="flex-grow flex flex-col justify-center px-6 max-w-7xl mx-auto w-full py-4 md:py-6 z-10 gap-4 md:gap-6">
        
        {/* Centered Wide Hero Layout */}
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center justify-center space-y-4 md:space-y-5 py-3 md:py-4">
          

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-on-surface tracking-tight leading-[1.05] text-center">
            Visual-First <br/>
            <span className="bg-gradient-to-r from-nature-green via-ocean-blue to-sand-gold bg-clip-text text-transparent">
              Privacy Ledger.
            </span>
          </h1>

          <p className="text-xs md:text-sm lg:text-base text-on-surface-variant leading-relaxed max-w-2xl mx-auto text-center">
            An offline cryptographically secure financial environment. VaultFlow maps bank statement logs, schedules manual recurring entries, and analyzes trends local-only. Zero servers. Zero-knowledge.
          </p>

          {/* Single CTA */}
          <div className="flex flex-col items-center gap-4 w-full max-w-sm pt-2">
            <button
              onClick={onUnlock}
              className="w-full max-w-[280px] h-12 px-6 rounded-2xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark font-black text-sm flex items-center justify-center gap-2.5 hover:scale-[1.03] active:scale-[0.97] transition-all shadow-[0_4px_20px_rgba(0,242,234,0.3)] cursor-pointer"
            >
              {hasVault ? (
                <>
                  <Key className="w-4.5 h-4.5 text-surface-dark" />
                  Unlock Vault
                </>
              ) : (
                <>
                  <ArrowRight className="w-4.5 h-4.5 text-surface-dark" />
                  Enter VaultFlow
                </>
              )}
            </button>
          </div>

        </div>

        {/* Bento Props Row (Scaled height to fit single viewport) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: 'Local Encryption', subtitle: 'ZERO-KNOWLEDGE', icon: Lock, color: 'text-nature-green', glow: 'hover:border-nature-green/30', action: 'security' },
            { title: 'Auto-Magic', subtitle: 'SMART CATEGORIZATION', icon: Zap, color: 'text-ocean-blue', glow: 'hover:border-ocean-blue/30', action: 'docs' },
            { title: 'Milestones', subtitle: 'GAMIFIED GOALS', icon: Award, color: 'text-sand-gold', glow: 'hover:border-sand-gold/30', action: 'manifest' },
          ].map((prop, i) => (
            <motion.div
              key={prop.title}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveModal(prop.action as ModalType); } }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                ease: 'easeOut',
                delay: 0.15 + i * 0.1
              }}
              onClick={() => setActiveModal(prop.action as ModalType)}
              className={cn(
                "glass-card rounded-2xl p-3.5 flex items-center gap-3.5 group cursor-pointer border border-white/5",
                prop.glow
              )}
            >
              <div className="w-9 h-9 shrink-0 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <prop.icon className={cn("w-4.5 h-4.5", prop.color)} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black text-on-surface leading-tight mb-0.5">{prop.title}</h3>
                <p className="font-mono text-[9px] text-on-surface-variant tracking-[0.15em] font-medium uppercase leading-none">{prop.subtitle}</p>
              </div>
            </motion.div>
          ))}
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full py-6 bg-surface-dark border-t border-white/5 z-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-lg font-black text-nature-green select-none">VaultFlow</div>
          <div className="font-mono text-[10px] text-on-surface-variant font-medium select-none">
            © 2026 VaultFlow. Visual-First Privacy.
          </div>
          <nav className="flex gap-6 font-mono text-[10px] uppercase tracking-wider font-semibold">
            <button 
              onClick={() => setActiveModal('docs')}
              className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors"
            >
              Documentation
            </button>
            <button 
              onClick={() => setActiveModal('security')}
              className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors"
            >
              Security Audit
            </button>
            <button 
              onClick={() => setActiveModal('manifest')}
              className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors"
            >
              Privacy Manifest
            </button>
            <button 
              onClick={() => setActiveModal('source')}
              className="text-on-surface-variant hover:text-nature-green underline underline-offset-4 transition-colors"
            >
              Source Code
            </button>
          </nav>
        </div>
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
                {/* Close Button */}
                <button
                  onClick={() => setActiveModal(null)}
                  className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-on-surface flex items-center justify-center active:scale-90 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="w-16 h-16 rounded-2xl bg-surface-container-low border border-white/5 flex items-center justify-center">
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
                  className="w-full h-12 rounded-xl border border-white/10 text-on-surface hover:text-nature-green hover:border-nature-green hover:bg-nature-green/5 font-bold text-xs uppercase tracking-wider active:scale-95 transition-all font-mono"
                >
                  Acknowledged & Secure
                </button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
