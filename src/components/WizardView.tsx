import { motion, AnimatePresence } from 'motion/react';
import { Lock, Shield, ArrowLeft, ArrowRight, Eye, EyeOff, CheckCircle, RefreshCw, CloudUpload, Sparkles, X, AlertCircle, Coins, Globe, Hash, Calendar } from 'lucide-react';
import React, { useState, useRef } from 'react';
import { cn } from '@/src/lib/utils';
import { deriveEncryptionKey, hashPasswordForChallenge, encryptPayload, decryptPayload, generateSalt, bytesToHex, hexToBytes } from '../lib/crypto';
import { saveConfig, getConfig, saveEncryptedTransaction, clearAllLocalData } from '../lib/db';
import { signInWithGoogle, getCloudManifest, saveCloudManifest, getCloudVaultData, saveCloudVaultData, VaultProfile, GoogleUser } from '../lib/googleDriveSync';
import { parseCSVStatement } from '../lib/csv';
import { Transaction } from '../types';

interface WizardViewProps {
  onComplete: (key: CryptoKey, txs: Transaction[]) => void;
  onCancel: (targetView?: 'landing' | 'unlock') => void;
}

export default function WizardView({ onComplete, onCancel }: WizardViewProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Step 1: Master Key State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Derived key inside Wizard State once computed
  const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null);

  // Google Drive Sync & Ledger Vault profile management states
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [cloudVaults, setCloudVaults] = useState<VaultProfile[]>([]);
  const [vaultName, setVaultName] = useState('Personal Ledger');
  const [vaultId, setVaultId] = useState(() => crypto.randomUUID());
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ').filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      if (parts.length > 0) {
        return parts[0][0].toUpperCase();
      }
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  // Step 2: Regional & Display Settings State
  const [currency, setCurrency] = useState('$');
  const [thousandsSeparator, setThousandsSeparator] = useState(',');
  const [dateFormat, setDateFormat] = useState('MMM DD, YYYY');

  // Step 3: Ledger Configuration & Backup State
  const [startingBalance, setStartingBalance] = useState('0');
  const [autoSync, setAutoSync] = useState(true);

  React.useEffect(() => {
    async function loadGoogleUser() {
      try {
        const storedGoogleUser = await getConfig('google_user');
        if (storedGoogleUser) {
          setGoogleUser(storedGoogleUser);
          const manifest = await getCloudManifest(storedGoogleUser.email);
          setCloudVaults(manifest.vaults);
        }
      } catch (err) {
        console.error('Failed to load Google user in Wizard:', err);
      }
    }
    loadGoogleUser();
  }, []);

  // Step 4: CSV Import State
  const [parsedTxs, setParsedTxs] = useState<Partial<Transaction>[]>([]);
  const [fileName, setFileName] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Step 5: AI Insights State
  const [aiConsent, setAiConsent] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishProgress, setFinishProgress] = useState('');

  // Password strength checker helper
  const handlePasswordChange = (val: string) => {
    setPassword(val);
    let strength = 0;
    if (val.length >= 6) strength = 1;
    if (val.length >= 8) strength = 2;
    if (val.length >= 10 && /[A-Z]/.test(val) && /\d/.test(val)) strength = 3;
    if (val.length >= 12 && /[!@#$%^&*(),.?":{}|<>]/.test(val)) strength = 4;
    setPasswordStrength(strength);
  };

  // CSV Drag/Drop Handlers
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
      processCSVFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCSVFile(e.target.files[0]);
    }
  };

  const processCSVFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setImportStatus('error');
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
        setImportStatus('success');
      } catch (err) {
        console.error('CSV Parsing Error:', err);
        setImportStatus('error');
        setFileName('Failed to parse statement logs.');
      }
    };
    reader.readAsText(file);
  };

  const handleGoogleConnect = async () => {
    setKeyError('');
    setIsLoadingCloud(true);
    try {
      const user = await signInWithGoogle();
      setGoogleUser(user);
      setAvatarError(false);
      const manifest = await getCloudManifest(user.email);
      setCloudVaults(manifest.vaults);
    } catch (err: any) {
      console.error(err);
      setKeyError(err.message || 'Google authentication failed.');
    } finally {
      setIsLoadingCloud(false);
    }
  };

  // Validate step values before advancing
  const handleNext = async () => {
    setKeyError('');

    if (step === 1) {
      if (password.length < 8) {
        setKeyError('Master password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setKeyError('Passwords do not match.');
        return;
      }

      try {
        const saltBytes = generateSalt(16);
        const saltHex = bytesToHex(saltBytes);
        const challenge = await hashPasswordForChallenge(password, saltBytes);
        const key = await deriveEncryptionKey(password, saltBytes);

        await saveConfig('encryption_salt', saltHex);
        await saveConfig('challenge_hash', challenge);

        setDerivedKey(key);
        setStep(2);
      } catch (err) {
        console.error('Cryptographic key derivation error:', err);
        setKeyError('Failed to initialize local cryptosystem.');
      }
    } else if (step === 2) {
      // Store regional configurations
      await saveConfig('currency', currency);
      await saveConfig('thousands_separator', thousandsSeparator);
      await saveConfig('date_format', dateFormat);
      await saveConfig('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
      await saveConfig('language', 'en');
      setStep(3);
    } else if (step === 3) {
      // Store backup configurations
      await saveConfig('starting_balance', startingBalance);
      await saveConfig('backup_enabled', autoSync);
      await saveConfig('backup_interval', 60000);
      await saveConfig('keep_cloud_vault_local', false);
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      // Finalize Onboarding Setup
      setIsFinishing(true);
      await saveConfig('ai_consent', aiConsent);

      try {
        setFinishProgress('Encrypting database ledger...');
        
        let finalTransactions: Transaction[] = [];

        // Check if we have transactions imported from Step 4
        if (parsedTxs.length > 0 && derivedKey) {
          const listToSave: Transaction[] = parsedTxs.map((partial) => ({
            id: crypto.randomUUID(),
            booking_date: partial.booking_date || Date.now(),
            amount: partial.amount || 0,
            currency: partial.currency || currency,
            counterparty: partial.counterparty || 'Unknown Merchant',
            category_id: partial.category_id || 'other',
            type: partial.type || 'expense',
            raw_data: partial.raw_data,
          }));

          // Trigger AI Categorization via Express Secure Backend if consented
          if (aiConsent) {
            setFinishProgress('Running secure Gemini AI categorization...');
            try {
              const unclassified = listToSave.filter(t => t.category_id === 'other');
              const uniqueMerchants = Array.from(new Set(unclassified.map((t) => t.counterparty))).filter(Boolean);

              if (uniqueMerchants.length > 0) {
                const response = await fetch('/api/categorize', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ merchants: uniqueMerchants }),
                });

                if (response.ok) {
                  const classifications: Record<string, string> = await response.json();
                  
                  // Map category names back to standard ID tags (e.g., 'food', 'transport')
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
              console.error('Failed to fetch secure Gemini classifications:', aiErr);
              // Fallback: keep existing categories
            }
          }

          finalTransactions.push(...listToSave);
        }

        const startingAmount = parseFloat(startingBalance);
        if (!isNaN(startingAmount) && startingAmount > 0) {
          finalTransactions.push({
            id: crypto.randomUUID(),
            booking_date: Date.now(),
            amount: Math.round(startingAmount * 100),
            currency: currency,
            counterparty: 'Initial Balance',
            category_id: 'income',
            type: 'income',
            raw_data: 'Manual Initial Balance Setup',
          });
        }

        if (derivedKey) {
          // Encrypt and save transaction logs to IndexedDB store
          setFinishProgress('Saving encrypted ledger logs to browser...');
          for (const tx of finalTransactions) {
            const payload = JSON.stringify(tx);
            const { cipherText, iv } = await encryptPayload(payload, derivedKey);
            await saveEncryptedTransaction(tx.id, cipherText, iv);
          }

          if (googleUser) {
            setFinishProgress('Registering Ledger Vault to Google Drive...');
            const saltHex = await getConfig('encryption_salt');
            const challenge = await getConfig('challenge_hash');

            const newProfile: VaultProfile = {
              id: vaultId,
              name: vaultName,
              salt: saltHex,
              challenge: challenge,
              lastSaved: Date.now(),
              config: {
                currency: currency,
                thousands_separator: thousandsSeparator,
                date_format: dateFormat,
                backup_interval: 60000,
                backup_enabled: autoSync,
                keep_cloud_vault_local: false,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                language: 'en'
              }
            };

            const currentManifest = await getCloudManifest(googleUser.email);
            currentManifest.vaults = currentManifest.vaults.filter(v => v.id !== vaultId);
            currentManifest.vaults.push(newProfile);
            await saveCloudManifest(googleUser.email, currentManifest);

            setFinishProgress('Uploading encrypted ledger payload to cloud...');
            const cloudTxs = [];
            for (const t of finalTransactions) {
              const payload = JSON.stringify(t);
              const { cipherText, iv } = await encryptPayload(payload, derivedKey);
              cloudTxs.push({ id: t.id, payload: cipherText, iv });
            }
            await saveCloudVaultData(googleUser.email, vaultId, { transactions: cloudTxs });

            // Save local active vault reference in configuration
            await saveConfig('google_user', googleUser);
            await saveConfig('active_vault_id', vaultId);
            await saveConfig('active_vault_name', vaultName);
          }
        }

        setFinishProgress('Setup complete!');
        setTimeout(() => {
          if (derivedKey) {
            onComplete(derivedKey, finalTransactions);
          }
        }, 800);
      } catch (err) {
        console.error('Finalization setup failed:', err);
        setIsFinishing(false);
        setKeyError('Failed to complete onboarding storage.');
      }
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
    else onCancel();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <header className="flex flex-col gap-3">
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div 
                      key={s} 
                      className={cn(
                        "h-1.5 w-8 md:w-12 rounded-full transition-all duration-500",
                        s === 1 ? "bg-nature-green shadow-[0_0_15px_rgba(0,242,234,0.5)]" : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
                <button onClick={() => onCancel()} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-xl md:text-2xl font-bold text-on-surface tracking-tight">
                  Master Key
                </h1>
                <p className="text-xs text-on-surface-variant max-w-[90%] mx-auto">
                  Set your primary encryption password. This unlocks your VaultFlow data.
                </p>
              </div>
            </header>

            {/* Google Drive Connection Section */}
            <div className="mx-1 p-3 bg-surface-dark/40 border border-white/5 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-on-surface">Google Cloud Sync</h3>
                  <p className="text-[10px] text-on-surface-variant">Sync projects and profiles securely.</p>
                </div>
                {!googleUser ? (
                  <button
                    onClick={handleGoogleConnect}
                    disabled={isLoadingCloud}
                    className="h-8 px-3 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-on-surface border border-white/10 hover:border-white/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingCloud ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.19-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        Link Account
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    {avatarError ? (
                      <div className="w-5 h-5 rounded-full bg-nature-green/10 text-nature-green border border-nature-green/30 flex items-center justify-center text-[8px] font-mono font-bold shrink-0">
                        {getInitials(googleUser.name, googleUser.email)}
                      </div>
                    ) : (
                      <img
                        src={googleUser.avatar}
                        onError={() => setAvatarError(true)}
                        className="w-5 h-5 rounded-full border border-nature-green/30 object-cover shrink-0"
                        alt={googleUser.name}
                      />
                    )}
                    <span className="text-[10px] font-mono text-nature-green font-bold truncate max-w-[80px]">{googleUser.name}</span>
                    <button
                      onClick={() => {
                        setGoogleUser(null);
                        setCloudVaults([]);
                      }}
                      className="text-[9px] font-mono uppercase tracking-wider text-earth-clay hover:underline cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              {googleUser && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex gap-3 items-center">
                    <span className="text-[9px] uppercase font-bold text-on-surface-variant font-mono tracking-wider shrink-0">Vault Name:</span>
                    <input
                      type="text"
                      value={vaultName}
                      onChange={(e) => setVaultName(e.target.value)}
                      placeholder="e.g. Personal Vault"
                      className="flex-1 bg-surface-dark/30 border border-on-surface-variant/20 rounded-lg px-2.5 py-1 text-xs text-on-surface font-mono outline-none focus:bg-surface-dark/85 focus:border-nature-green/50 transition-all duration-200"
                    />
                  </div>

                  {cloudVaults.length > 0 && (
                    <div className="group text-left pt-1">
                      <p className="text-[10px] leading-normal text-on-surface-variant">
                        We found {cloudVaults.length} existing vault{cloudVaults.length > 1 ? 's' : ''} in Google Drive.
                        <button
                          onClick={() => onCancel('unlock')}
                          className="inline-flex items-center gap-0.5 ml-1 text-ocean-blue font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer align-baseline"
                        >
                          Restore instead <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <section className="space-y-2.5 px-1">
              <div className="relative group">
                <div className="absolute inset-0 glass-card rounded-xl transition-colors group-hover:border-nature-green/30 group-focus-within:border-nature-green/50" />
                <div className="relative flex items-center p-3 gap-3">
                  <Lock className="w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter master password" 
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    autoFocus
                    className="flex-1 bg-transparent border-none outline-none font-mono text-sm tracking-widest text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0"
                  />
                  <button 
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="text-on-surface-variant hover:text-nature-green transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 glass-card rounded-xl transition-colors group-hover:border-nature-green/30 group-focus-within:border-nature-green/50" />
                <div className="relative flex items-center p-3 gap-3">
                  <Lock className="w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none font-mono text-sm tracking-widest text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0"
                  />
                </div>
              </div>

              {password.length > 0 && (
                <div className="flex items-center gap-3 px-2">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Strength:</span>
                  <div className="flex-1 flex gap-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={cn(
                          "h-full flex-1 transition-colors duration-500",
                          level <= passwordStrength
                            ? passwordStrength === 1
                              ? "bg-earth-clay"
                              : passwordStrength === 2
                              ? "bg-amber-500"
                              : passwordStrength === 3
                              ? "bg-indigo-400"
                              : "bg-nature-green shadow-[0_0_8px_rgba(0,242,234,0.5)]"
                            : "bg-white/5"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {keyError && (
                <div className="flex items-center gap-2 text-earth-clay text-xs px-2 animate-pulse mt-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{keyError}</span>
                </div>
              )}

              <div className="flex items-start gap-2 p-2.5 bg-earth-clay/5 border border-earth-clay/15 rounded-xl text-left">
                <AlertCircle className="w-3.5 h-3.5 text-earth-clay shrink-0 mt-0.5" />
                <p className="text-[10px] leading-normal text-earth-clay/90">
                  <span className="font-bold font-mono uppercase tracking-wider text-[9px]">Recovery Warning:</span> Local sandboxed keys. If lost, your data cannot be recovered (no server backups exist).
                </p>
              </div>
            </section>
          </div>
        );

      case 2:
        return (
          <div className="space-y-8">
            <header className="flex flex-col items-center gap-6">
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div 
                      key={s} 
                      className={cn(
                        "h-1.5 w-8 md:w-12 rounded-full transition-all duration-500",
                        s <= 2 ? (s === 2 ? "bg-nature-green shadow-[0_0_15px_rgba(0,242,234,0.5)]" : "bg-nature-green/50") : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
                <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="text-center space-y-2 mt-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass-card border-white/10 mb-2">
                  <Globe className="w-9 h-9 text-nature-green fill-nature-green/20" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight">Regional Settings</h1>
                <p className="text-on-surface-variant">Customize how currency, numbers, and dates are displayed.</p>
              </div>
            </header>

            <section className="flex flex-col gap-5 py-2 px-2">
              {/* Currency Selector */}
              <div className="relative group">
                <div className="absolute inset-0 glass-card rounded-2xl transition-colors group-hover:border-nature-green/30 focus-within:border-nature-green/50" />
                <div className="relative flex items-center p-5 gap-4">
                  <Coins className="w-5 h-5 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Base Currency</label>
                    <select 
                      value={currency} 
                      onChange={(e) => setCurrency(e.target.value)}
                      className="bg-transparent border-none outline-none font-mono text-base text-on-surface focus:ring-0 p-0 mt-1 cursor-pointer w-full"
                    >
                      <option className="bg-surface-dark text-on-surface" value="$">USD ($)</option>
                      <option className="bg-surface-dark text-on-surface" value="€">EUR (€)</option>
                      <option className="bg-surface-dark text-on-surface" value="£">GBP (£)</option>
                      <option className="bg-surface-dark text-on-surface" value="CHF">CHF (CHF)</option>
                      <option className="bg-surface-dark text-on-surface" value="¥">JPY (¥)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Thousands Separator Selector */}
              <div className="relative group">
                <div className="absolute inset-0 glass-card rounded-2xl transition-colors group-hover:border-nature-green/30 focus-within:border-nature-green/50" />
                <div className="relative flex items-center p-5 gap-4">
                  <Hash className="w-5 h-5 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Thousands Separator</label>
                    <select 
                      value={thousandsSeparator} 
                      onChange={(e) => setThousandsSeparator(e.target.value)}
                      className="bg-transparent border-none outline-none font-mono text-base text-on-surface focus:ring-0 p-0 mt-1 cursor-pointer w-full"
                    >
                      <option className="bg-surface-dark text-on-surface" value=",">Comma (e.g. 10,000.00)</option>
                      <option className="bg-surface-dark text-on-surface" value=".">Period (e.g. 10.000,00)</option>
                      <option className="bg-surface-dark text-on-surface" value="'">Apostrophe (e.g. 10'000.00)</option>
                      <option className="bg-surface-dark text-on-surface" value=" ">Space (e.g. 10 000,00)</option>
                      <option className="bg-surface-dark text-on-surface" value="">None (e.g. 10000.00)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Date Format Selector */}
              <div className="relative group">
                <div className="absolute inset-0 glass-card rounded-2xl transition-colors group-hover:border-nature-green/30 focus-within:border-nature-green/50" />
                <div className="relative flex items-center p-5 gap-4">
                  <Calendar className="w-5 h-5 text-on-surface-variant group-focus-within:text-nature-green transition-colors" />
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Display Date Format</label>
                    <select 
                      value={dateFormat} 
                      onChange={(e) => setDateFormat(e.target.value)}
                      className="bg-transparent border-none outline-none font-mono text-base text-on-surface focus:ring-0 p-0 mt-1 cursor-pointer w-full"
                    >
                      <option className="bg-surface-dark text-on-surface" value="MMM DD, YYYY">May 19, 2026</option>
                      <option className="bg-surface-dark text-on-surface" value="DD.MM.YYYY">19.05.2026</option>
                      <option className="bg-surface-dark text-on-surface" value="DD/MM/YYYY">19/05/2026</option>
                      <option className="bg-surface-dark text-on-surface" value="YYYY-MM-DD">2026-05-19</option>
                      <option className="bg-surface-dark text-on-surface" value="MM/DD/YYYY">05/19/2026</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8">
            <header className="flex flex-col items-center gap-6">
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div 
                      key={s} 
                      className={cn(
                        "h-1.5 w-8 md:w-12 rounded-full transition-all duration-500",
                        s <= 3 ? (s === 3 ? "bg-nature-green shadow-[0_0_15px_rgba(0,242,234,0.5)]" : "bg-nature-green/50") : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
                <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="text-center space-y-2 mt-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass-card border-white/10 mb-2">
                  <Shield className="w-9 h-9 text-nature-green fill-nature-green/20" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight">Ledger Backup</h1>
                <p className="text-on-surface-variant">Configure initial balance and secure cloud synchronization.</p>
              </div>
            </header>

            <section className="flex flex-col gap-6 py-2 px-2">
              <div className="relative group">
                <div className="absolute inset-0 glass-card rounded-2xl transition-colors group-hover:border-nature-green/30 focus-within:border-nature-green/50" />
                <div className="relative flex flex-col p-5 gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider font-mono">Starting Income / Balance</label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-on-surface-variant font-mono">{currency}</span>
                    <input 
                      type="number"
                      value={startingBalance}
                      onChange={(e) => setStartingBalance(e.target.value)}
                      className="w-full bg-transparent border-none outline-none font-mono text-lg text-on-surface focus:ring-0 p-0"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div 
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAutoSync(!autoSync); } }}
                className="glass-card rounded-2xl p-5 flex items-center justify-between hover:border-nature-green/30 transition-all cursor-pointer group" 
                onClick={() => setAutoSync(!autoSync)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-nature-green/10 flex items-center justify-center">
                    <RefreshCw className={cn("w-5 h-5 text-nature-green", autoSync && "animate-spin")} style={{ animationDuration: '6s' }} />
                  </div>
                  <div>
                    <div className="font-bold text-on-surface flex items-center gap-2 text-sm md:text-base">
                      Auto-Sync Google Drive
                    </div>
                    <div className={cn("font-mono text-[10px] uppercase tracking-wider font-bold", autoSync ? "text-nature-green" : "text-on-surface-variant/40")}>
                      {autoSync ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>
                <button className={cn(
                  "relative inline-flex h-7 w-13 items-center rounded-full transition-colors border",
                  autoSync 
                    ? "bg-nature-green border-transparent" 
                    : "bg-on-surface/15 border-on-surface/25"
                )}>
                  <div className={cn(
                    "h-5 w-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-300",
                    autoSync ? "translate-x-7" : "translate-x-1"
                  )}>
                    {autoSync && <CheckCircle className="w-3 h-3 text-nature-green" />}
                  </div>
                </button>
              </div>

              {autoSync && (
                <div className="space-y-3">
                  <p className="text-[11px] leading-relaxed text-on-surface-variant/60 px-2">
                    ✨ Cloud backup will sync your encrypted ledger to your connected Google Drive automatically.
                  </p>
                </div>
              )}
            </section>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8">
             <header className="flex flex-col items-center gap-6">
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div 
                      key={s} 
                      className={cn(
                        "h-1.5 w-8 md:w-12 rounded-full transition-all duration-500",
                        s <= 4 ? (s === 4 ? "bg-nature-green shadow-[0_0_15px_rgba(0,242,234,0.5)]" : "bg-nature-green/50") : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
                <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="text-center space-y-2 mt-2">
                <h1 className="text-2xl md:text-3xl font-bold text-nature-green tracking-tight">Data Import</h1>
                <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest font-bold">Step 4 of 5</p>
              </div>
            </header>

            <section className="flex flex-col items-center justify-center gap-6 py-2 px-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".csv, text/csv, application/csv, text/comma-separated-values, application/vnd.ms-excel" 
                className="hidden" 
              />
              
              <div 
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full h-56 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all group px-4 text-center",
                  dragActive ? "border-nature-green bg-nature-green/10" : "border-white/10 hover:border-nature-green hover:bg-nature-green/5"
                )}
              >
                <div className="w-16 h-16 rounded-full glass-card flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CloudUpload className={cn("w-8 h-8 text-on-surface-variant group-hover:text-nature-green", importStatus === 'success' && 'text-nature-green')} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-on-surface mb-1 group-hover:text-nature-green transition-colors">
                    {importStatus === 'success' ? 'Statement Loaded!' : 'Drop bank CSV statement here'}
                  </h2>
                  <p className="text-xs text-on-surface-variant max-w-[280px] mx-auto">
                    {importStatus === 'success' 
                      ? `${parsedTxs.length} transaction entries detected in CSV ledger.` 
                      : 'Upload standard statements. Clean merchant extraction and currency parsing is automatic.'}
                  </p>
                </div>
              </div>

              {importStatus === 'success' && (
                <div className="flex items-center justify-between w-full bg-surface-container-low rounded-2xl p-4 border border-white/5 font-mono text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2 truncate max-w-[80%]">
                    <CheckCircle className="w-4 h-4 text-nature-green shrink-0 animate-bounce" />
                    <span className="truncate">{fileName}</span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setParsedTxs([]);
                      setFileName('');
                      setImportStatus('idle');
                    }}
                    className="text-earth-clay font-bold hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              {importStatus === 'error' && (
                <div className="flex items-center gap-2 text-earth-clay font-mono text-xs bg-earth-clay/10 p-4 border border-earth-clay/20 rounded-2xl w-full">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fileName}</span>
                </div>
              )}

              {importStatus === 'idle' && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-3.5 rounded-full glass-card border-white/10 text-on-surface text-xs font-bold uppercase tracking-wider hover:border-nature-green hover:text-nature-green transition-all"
                >
                  Browse Files
                </button>
              )}
            </section>
          </div>
        );
      case 5:
        return (
          <div className="space-y-8">
             <header className="flex flex-col items-center gap-6">
              <div className="flex items-center justify-between w-full">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div 
                      key={s} 
                      className={cn(
                        "h-1.5 w-8 md:w-12 rounded-full transition-all duration-500",
                        s <= 5 ? (s === 5 ? "bg-nature-green shadow-[0_0_15px_rgba(0,242,234,0.5)]" : "bg-nature-green/50") : "bg-white/10"
                      )} 
                    />
                  ))}
                </div>
                <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </header>

            <section className="flex flex-col items-center text-center gap-6 py-2 px-2">
              <div className="relative group">
                <div className="absolute inset-0 bg-nature-green/20 blur-2xl rounded-full scale-150 transition-transform duration-500 animate-pulse" />
                <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center border border-nature-green/30 relative z-10">
                  <Sparkles className="w-10 h-10 text-nature-green fill-nature-green/20" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-on-surface">Enable AI Insights</h2>
                <p className="text-on-surface-variant text-sm max-w-sm">
                  Let secure Gemini server intelligence auto-classify imported merchant transactions into clean spending divisions.
                </p>
              </div>

              <div className="w-full bg-surface-container-low rounded-3xl p-6 border border-white/5 flex flex-col gap-4 text-left">
                <div 
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAiConsent(!aiConsent); } }}
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setAiConsent(!aiConsent)}
                >
                  <span className="font-bold text-on-surface uppercase tracking-tight text-xs font-mono select-none">Gemini AI Auto-Categorize</span>
                  <button 
                    tabIndex={-1}
                    className={cn(
                      "relative inline-flex h-7 w-13 items-center rounded-full transition-colors border",
                      aiConsent 
                        ? "bg-nature-green border-transparent" 
                        : "bg-on-surface/15 border-on-surface/25"
                    )}
                  >
                    <div className={cn(
                      "h-5 w-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-300",
                      aiConsent ? "translate-x-7" : "translate-x-1"
                    )}>
                      {aiConsent && <CheckCircle className="w-3 h-3 text-nature-green" />}
                    </div>
                  </button>
                </div>
                <div className="flex gap-3 p-4 bg-black/20 rounded-xl border border-white/5">
                  <Shield className="w-5 h-5 text-on-surface-variant shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed text-on-surface-variant/80">
                    🔒 Zero Exposure Cryptographic Privacy: The categorization runs via secure backend Express routes. Your personal identifiers, account keys, and transaction raw payloads are never sent.
                  </p>
                </div>
              </div>

              {isFinishing && (
                <div className="w-full flex flex-col items-center gap-3 pt-2">
                  <RefreshCw className="w-6 h-6 text-nature-green animate-spin" />
                  <span className="font-mono text-[10px] text-nature-green uppercase tracking-widest font-bold">
                    {finishProgress}
                  </span>
                </div>
              )}
            </section>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      
      <motion.main 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-[560px] max-h-[calc(100vh-2rem)] bg-surface-container rounded-[36px] p-6 md:py-8 md:px-10 shadow-[0_0_80px_rgba(0,242,234,0.1)] border border-white/5 flex flex-col"
      >
        <div className="flex-1 overflow-y-auto pr-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ x: 15, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -15, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className={cn("flex items-center mt-6 pt-4 border-t border-white/5 shrink-0", step === 5 ? "justify-center" : "justify-between")}>
          {step < 5 && (
            <button 
              onClick={prevStep} 
              disabled={isFinishing}
              className="group flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-all text-xs font-mono uppercase tracking-widest font-bold p-2 disabled:opacity-30"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
          )}
          
          <button 
            onClick={handleNext}
            disabled={isFinishing}
            className={cn(
              "bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark rounded-2xl flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(0,242,234,0.2)] font-bold disabled:opacity-30",
              step === 5 ? "w-full py-4 text-lg font-black h-16 mt-2" : "px-8 py-3.5 text-base h-14"
            )}
          >
            {step === 5 ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Finish Setup
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </footer>
      </motion.main>
    </div>
  );
}
