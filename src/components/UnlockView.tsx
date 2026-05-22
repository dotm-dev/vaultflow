import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Key, Upload, ArrowLeft, Eye, EyeOff, AlertCircle, RefreshCw, Cloud, HardDrive, ArrowRight, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { deriveEncryptionKey, hashPasswordForChallenge, decryptPayload, hexToBytes } from '../lib/crypto';
import { clearAllLocalData, saveEncryptedTransaction, saveConfig, getConfig } from '../lib/db';
import { signInWithGoogle, signOutGoogle, getCloudManifest, getCloudVaultData, VaultProfile, GoogleUser, isGoogleConnected } from '../lib/googleDriveSync';
import { Transaction } from '../types';

interface UnlockViewProps {
  hasVault: boolean;
  localVaultId?: string;
  onUnlockLocal: (password: string, googleUserToLink?: any) => Promise<boolean>;
  onCloudUnlock: (
    key: CryptoKey,
    txs: Transaction[],
    vaultId: string,
    vaultName: string,
    currency: string,
    separator: string,
    dateFormat: string,
    lastSaved: number,
    backupInterval?: number,
    backupEnabled?: boolean,
    keepLocal?: boolean,
    timezone?: string,
    language?: string
  ) => void;
  onBack: () => void;
  onStartWizard: () => void;
  onRestore: (file: File) => Promise<boolean>;
  onWipe: () => void;
  theme: 'light' | 'dark';
}

type Tab = 'local' | 'cloud';

export default function UnlockView({
  hasVault,
  localVaultId,
  onUnlockLocal,
  onCloudUnlock,
  onBack,
  onStartWizard,
  onRestore,
  onWipe,
  theme,
}: UnlockViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>(hasVault ? 'local' : 'local');

  // ─── Local Tab State ────────────────────────────────────────────────────
  const [localPassword, setLocalPassword] = useState('');
  const [showLocalPassword, setShowLocalPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Cloud Tab State ────────────────────────────────────────────────────
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [cloudVaults, setCloudVaults] = useState<VaultProfile[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultProfile | null>(null);
  const [cloudPassword, setCloudPassword] = useState('');
  const [showCloudPassword, setShowCloudPassword] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);

  // ─── Cloud Link Local Flow State ─────────────────────────────────────────
  const [showLinkOption, setShowLinkOption] = useState(false);
  const [linkLocalMode, setLinkLocalMode] = useState(false);
  const [linkPassword, setLinkPassword] = useState('');
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Password Input Refs for Autofocus
  const localPasswordRef = useRef<HTMLInputElement>(null);
  const cloudPasswordRef = useRef<HTMLInputElement>(null);
  const linkPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'local') {
        localPasswordRef.current?.focus();
      } else if (activeTab === 'cloud') {
        if (linkLocalMode) {
          linkPasswordRef.current?.focus();
        } else {
          cloudPasswordRef.current?.focus();
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [activeTab, showLinkOption, linkLocalMode, cloudVaults.length, googleUser, selectedVault]);

  // Avatar and Session Expired States
  const [avatarError, setAvatarError] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

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

  useEffect(() => {
    async function loadStoredGoogleUser() {
      try {
        const storedGoogleUser = await getConfig('google_user');
        if (storedGoogleUser) {
          setGoogleUser(storedGoogleUser);
          
          if (!isGoogleConnected()) {
            setIsSessionExpired(true);
          } else {
            setIsLoadingCloud(true);
            try {
              const manifest = await getCloudManifest(storedGoogleUser.email);
              setCloudVaults(manifest.vaults);
              if (manifest.vaults.length > 0) {
                const activeVault = localVaultId ? manifest.vaults.find(v => v.id === localVaultId) : null;
                if (activeVault) {
                  setSelectedVault(activeVault);
                  setActiveTab('cloud');
                } else {
                  setSelectedVault(manifest.vaults[0]);
                }
              }
              if (hasVault) {
                const isAlreadyLinked = localVaultId ? manifest.vaults.some(v => v.id === localVaultId) : false;
                setShowLinkOption(!isAlreadyLinked);
              } else {
                setShowLinkOption(false);
              }
            } catch (e: any) {
              console.error('Failed to load cloud vaults in UnlockView loadStoredGoogleUser:', e);
              if (e.message && e.message.includes('UNAUTHORIZED')) {
                setIsSessionExpired(true);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load Google user in UnlockView:', err);
      } finally {
        setIsLoadingCloud(false);
      }
    }
    loadStoredGoogleUser();
  }, [hasVault, localVaultId]);

  // ─── Interactive Restore State ──────────────────────────────────────────
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreMessage, setRestoreMessage] = useState('');

  // ─── Local Handlers ─────────────────────────────────────────────────────

  const handleLocalUnlock = async () => {
    if (localPassword.length === 0) {
      setLocalError('Master password is required.');
      return;
    }
    setLocalError('');
    setIsUnlocking(true);
    try {
      const success = await onUnlockLocal(localPassword);
      if (!success) {
        setLocalError('Incorrect master password. Please try again.');
      }
    } catch {
      setLocalError('Decryption failed.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const success = await onRestore(e.target.files[0]);
      if (success) {
        alert('Vault backup loaded successfully! Please enter your master password to unlock.');
      }
    }
  };

  // ─── Cloud Handlers ─────────────────────────────────────────────────────

  const handleGoogleConnect = async () => {
    setCloudError('');
    setIsLoadingCloud(true);
    try {
      const user = await signInWithGoogle();
      setGoogleUser(user);
      setAvatarError(false);
      setIsSessionExpired(false);
      await saveConfig('google_user', user);
      const manifest = await getCloudManifest(user.email);
      setCloudVaults(manifest.vaults);
      if (manifest.vaults.length > 0) {
        setSelectedVault(manifest.vaults[0]);
      }

      // Check if the local vault is already part of the Google account
      if (hasVault) {
        const isAlreadyLinked = localVaultId ? manifest.vaults.some(v => v.id === localVaultId) : false;
        setShowLinkOption(!isAlreadyLinked);
      } else {
        setShowLinkOption(false);
      }
    } catch (err: any) {
      console.error(err);
      setCloudError(err.message || 'Google authentication failed.');
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    signOutGoogle();
    setGoogleUser(null);
    setCloudVaults([]);
    setSelectedVault(null);
    setCloudPassword('');
    setCloudError('');
    setIsSessionExpired(false);
    setAvatarError(false);
    await saveConfig('google_user', null);
    setShowLinkOption(false);
    setLinkLocalMode(false);
    setLinkPassword('');
    setLinkError('');
  };

  const handleLinkLocal = async () => {
    if (linkPassword.length === 0) {
      setLinkError('Master password is required.');
      return;
    }
    setLinkError('');
    setIsLinking(true);
    try {
      const success = await onUnlockLocal(linkPassword, googleUser);
      if (!success) {
        setLinkError('Incorrect master password. Please try again.');
      }
    } catch (err) {
      setLinkError('Failed to link local vault.');
    } finally {
      setIsLinking(false);
    }
  };

  const handleCloudUnlock = async () => {
    if (!selectedVault) {
      setCloudError('Please select a Ledger Vault.');
      return;
    }
    if (cloudPassword.length === 0) {
      setCloudError('Master password is required.');
      return;
    }
    setCloudError('');

    try {
      const saltBytes = hexToBytes(selectedVault.salt);
      const calculatedChallenge = await hashPasswordForChallenge(cloudPassword, saltBytes);
      if (calculatedChallenge !== selectedVault.challenge) {
        setCloudError('Incorrect master password for this Ledger Vault.');
        return;
      }

      setIsRestoring(true);
      setRestoreProgress(10);
      setRestoreMessage('Connecting to Google Drive...');
      await new Promise(resolve => setTimeout(resolve, 600));

      setRestoreProgress(30);
      setRestoreMessage('Downloading encrypted ledger payload...');
      const cloudData = await getCloudVaultData(googleUser!.email, selectedVault.id);
      await new Promise(resolve => setTimeout(resolve, 400));

      setRestoreProgress(55);
      setRestoreMessage('Wiping local database...');
      await clearAllLocalData();
      await new Promise(resolve => setTimeout(resolve, 300));

      setRestoreProgress(75);
      setRestoreMessage('Decrypting transactions offline...');
      const key = await deriveEncryptionKey(cloudPassword, saltBytes);
      const decryptedTxs: Transaction[] = [];

      for (const t of cloudData.transactions) {
        await saveEncryptedTransaction(t.id, t.payload, t.iv);
        try {
          const plaintext = await decryptPayload(t.payload, t.iv, key);
          decryptedTxs.push(JSON.parse(plaintext));
        } catch (e) {
          console.error("Failed to decrypt transaction row:", e);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 400));

      setRestoreProgress(90);
      setRestoreMessage('Restoring configurations...');

      await saveConfig('encryption_salt', selectedVault.salt);
      await saveConfig('challenge_hash', selectedVault.challenge);
      await saveConfig('google_user', googleUser);
      await saveConfig('active_vault_id', selectedVault.id);
      await saveConfig('active_vault_name', selectedVault.name);
      await saveConfig('currency', selectedVault.config?.currency || '$');
      await saveConfig('thousands_separator', selectedVault.config?.thousands_separator || ',');
      await saveConfig('date_format', selectedVault.config?.date_format || 'MMM DD, YYYY');
      await saveConfig('last_synced_at', selectedVault.lastSaved);

      const backupInterval = selectedVault.config?.backup_interval;
      const backupEnabled = selectedVault.config?.backup_enabled;
      const keepLocal = selectedVault.config?.keep_cloud_vault_local;

      const timezoneVal = selectedVault.config?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const languageVal = selectedVault.config?.language || 'en';
      await saveConfig('timezone', timezoneVal);
      await saveConfig('language', languageVal);

      await saveConfig('backup_interval', backupInterval !== undefined ? backupInterval : 60000);
      await saveConfig('backup_enabled', backupEnabled !== undefined ? backupEnabled : true);
      await saveConfig('keep_cloud_vault_local', keepLocal !== undefined ? keepLocal : false);

      setRestoreProgress(100);
      setRestoreMessage('Complete!');
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsRestoring(false);
      onCloudUnlock(
        key,
        decryptedTxs,
        selectedVault.id,
        selectedVault.name,
        selectedVault.config?.currency || '$',
        selectedVault.config?.thousands_separator || ',',
        selectedVault.config?.date_format || 'MMM DD, YYYY',
        selectedVault.lastSaved,
        backupInterval !== undefined ? backupInterval : 60000,
        backupEnabled !== undefined ? backupEnabled : true,
        keepLocal !== undefined ? keepLocal : false,
        timezoneVal,
        languageVal
      );
    } catch (err: any) {
      console.error('Failed to restore ledger vault:', err);
      setCloudError(err.message || 'Verification or download failed.');
      setIsRestoring(false);
    }
  };

  // ─── Restoring Overlay ──────────────────────────────────────────────────

  if (isRestoring) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden selection:bg-nature-green selection:text-surface-dark">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-nature-green/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="relative w-full max-w-[420px] bg-surface-container rounded-[32px] p-8 md:p-10 border border-white/5 shadow-2xl flex flex-col items-center gap-6 text-center select-none">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-nature-green/10 rounded-full" />
            <div className="absolute inset-0 border-4 border-nature-green border-t-transparent rounded-full animate-spin" />
            <Lock className="w-8 h-8 text-nature-green animate-pulse" />
          </div>
          
          <div className="space-y-2 w-full">
            <h2 className="text-xl font-bold text-on-surface">Restoring Ledger</h2>
            <p className="text-xs text-on-surface-variant font-mono">{restoreMessage}</p>
          </div>

          <div className="w-full bg-surface-dark rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-nature-green h-full transition-all duration-300 rounded-full" 
              style={{ width: `${restoreProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── Cloud Render Helper ────────────────────────────────────────────────
  const renderCloudTab = () => {
    if (!googleUser) return null;

    return (
      <div className="space-y-4">
        {/* User Badge */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            {avatarError ? (
              <div className="w-7 h-7 rounded-full bg-nature-green/10 text-nature-green border border-nature-green/30 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                {getInitials(googleUser.name, googleUser.email)}
              </div>
            ) : (
              <img
                src={googleUser.avatar}
                onError={() => setAvatarError(true)}
                className="w-7 h-7 rounded-full border border-nature-green/30 object-cover shrink-0"
                alt={googleUser.name}
              />
            )}
            <div className="text-left">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-on-surface leading-tight">{googleUser.name}</span>
                {isSessionExpired && (
                  <span className="px-1 py-0.5 rounded text-[7px] font-mono font-bold uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                    Expired
                  </span>
                )}
              </div>
              <div className="text-[10px] text-on-surface-variant font-mono">{googleUser.email}</div>
            </div>
          </div>
          <button
            onClick={handleGoogleDisconnect}
            className="text-[9px] font-mono uppercase tracking-wider text-earth-clay hover:underline cursor-pointer"
          >
            Sign Out
          </button>
        </div>

        {isSessionExpired ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 text-center space-y-3.5">
            <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Google Session Expired</h4>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Your secure Google Drive connection has expired. Please reconnect to access your cloud vaults.
              </p>
            </div>
            <button
              onClick={handleGoogleConnect}
              className="mx-auto px-5 py-2.5 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md shadow-nature-green/10"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reconnect Google Account
            </button>
          </div>
        ) : showLinkOption ? (
          linkLocalMode ? (
            // ─── Link password entry ────────────────────────────
            <div className="space-y-4">
              <div className="space-y-2 text-center">
                <h3 className="text-sm font-bold text-on-surface">Link Local Vault to Google Drive</h3>
                <p className="text-[11px] text-on-surface-variant font-mono">Enter your master password to link and sync your local vault.</p>
              </div>

              {linkError && (
                <div className="flex items-center gap-2 text-earth-clay text-xs px-2 animate-pulse">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{linkError}</span>
                </div>
              )}

              <div className="relative group">
                <div className="absolute inset-0 bg-surface-dark border border-white/10 rounded-xl transition-colors group-hover:border-nature-green/30 group-focus-within:border-nature-green/50" />
                <div className="relative flex items-center px-4 h-12 gap-3">
                  <Lock className="w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors shrink-0" />
                  <input
                    type={showLinkPassword ? "text" : "password"}
                    ref={linkPasswordRef}
                    placeholder="Enter master password"
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLinkLocal()}
                    className="flex-grow bg-transparent border-none outline-none font-mono text-sm tracking-widest text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0"
                  />
                  <button
                    onClick={() => setShowLinkPassword(!showLinkPassword)}
                    tabIndex={-1}
                    className="text-on-surface-variant hover:text-nature-green transition-colors shrink-0"
                  >
                    {showLinkPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLinkLocalMode(false);
                    setLinkPassword('');
                    setLinkError('');
                  }}
                  className="flex-1 h-11 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 text-on-surface text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkLocal}
                  disabled={isLinking}
                  className="flex-1 h-11 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold hover:scale-[1.02] active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                >
                  {isLinking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Link & Unlock'}
                </button>
              </div>
            </div>
          ) : (
            // ─── Link choice prompt card ────────────────────────
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center space-y-3.5">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  A local ledger vault was detected on this browser. Would you like to link and upload it to your Google Drive account, or manage your cloud vaults?
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowLinkOption(false)}
                    className="flex-1 h-9 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 text-on-surface text-xs font-bold transition-all"
                  >
                    Cloud Vaults
                  </button>
                  <button
                    onClick={() => setLinkLocalMode(true)}
                    className="flex-1 h-9 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold hover:scale-[1.02] active:scale-[0.97] transition-all"
                  >
                    Link Local Vault
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          // ─── Normal cloud vaults selection ──────────────────
          <div className="space-y-4">
            {cloudVaults.length === 0 ? (
              <div className="text-center py-3 space-y-3">
                <p className="text-xs text-on-surface-variant">No synced vaults found under this account.</p>
                <button
                  onClick={onStartWizard}
                  className="w-full h-11 rounded-2xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark font-bold text-xs hover:scale-[1.02] active:scale-[0.97] transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  Create Cloud Vault
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-bold text-on-surface-variant font-mono tracking-wider px-1">
                    Select Ledger Vault
                  </label>
                  <select
                    value={selectedVault?.id || ''}
                    onChange={(e) => {
                      const v = cloudVaults.find(x => x.id === e.target.value);
                      if (v) setSelectedVault(v);
                    }}
                    className="w-full h-10 bg-surface-dark border border-white/10 rounded-xl px-3 text-xs text-on-surface focus:ring-1 focus:ring-nature-green outline-none cursor-pointer font-mono"
                  >
                    {cloudVaults.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} — Last sync: {new Date(v.lastSaved).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative group">
                  <div className="absolute inset-0 bg-surface-dark border border-white/10 rounded-xl transition-colors group-hover:border-nature-green/30 group-focus-within:border-nature-green/50" />
                  <div className="relative flex items-center px-4 h-12 gap-3">
                    <Lock className="w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors shrink-0" />
                    <input
                      type={showCloudPassword ? "text" : "password"}
                      ref={cloudPasswordRef}
                      placeholder="Enter vault master password"
                      value={cloudPassword}
                      onChange={(e) => setCloudPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCloudUnlock()}
                      className="flex-grow bg-transparent border-none outline-none font-mono text-sm tracking-widest text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0"
                    />
                    <button
                      onClick={() => setShowCloudPassword(!showCloudPassword)}
                      tabIndex={-1}
                      className="text-on-surface-variant hover:text-nature-green transition-colors shrink-0"
                    >
                      {showCloudPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {cloudError && (
                  <div className="flex items-center gap-2 text-earth-clay text-xs px-2 animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cloudError}</span>
                  </div>
                )}

                <button
                  onClick={handleCloudUnlock}
                  className="w-full h-12 rounded-2xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark font-bold text-sm hover:scale-[1.02] active:scale-[0.97] transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  Decrypt & Restore
                </button>
              </div>
            )}

            {/* Small toggle back link to link local vault if applicable */}
            {hasVault && !(localVaultId ? cloudVaults.some(v => v.id === localVaultId) : false) && (
              <div className="text-center pt-2">
                <button
                  onClick={() => {
                    setShowLinkOption(true);
                    setLinkLocalMode(false);
                  }}
                  className="text-[10px] text-nature-green hover:underline cursor-pointer font-medium"
                >
                  Link local vault to this account instead
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Main Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative overflow-hidden selection:bg-nature-green selection:text-surface-dark">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-nature-green/8 blur-[120px] rounded-full pointer-events-none" />

      {/* Hidden restore file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleRestoreFile} 
        accept=".json" 
        className="hidden" 
      />

      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-[480px] bg-surface-container rounded-[32px] p-8 md:p-10 border border-white/5 shadow-2xl flex flex-col items-center gap-6 z-10"
      >
        {/* Back Button */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 w-8 h-8 rounded-full bg-white/5 hover:bg-on-surface/5 text-on-surface-variant hover:text-on-surface flex items-center justify-center active:scale-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-14 h-14 rounded-2xl bg-surface-container-low border border-white/5 flex items-center justify-center">
            <Lock className="w-7 h-7 text-nature-green" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-on-surface tracking-tight">
              {hasVault ? 'Open VaultFlow' : 'Welcome to VaultFlow'}
            </h1>
            <p className="text-xs text-on-surface-variant font-mono uppercase tracking-wider">
              {hasVault ? 'Choose your ledger source' : 'Set up your secure offline ledger'}
            </p>
          </div>
        </div>

        {hasVault ? (
          <>
            {/* Tab Switcher */}
            <div className="w-full bg-surface-dark rounded-2xl p-1 flex gap-1">
              <button
                onClick={() => setActiveTab('local')}
                className={cn(
                  "flex-1 h-10 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                  activeTab === 'local'
                    ? "bg-surface-container text-on-surface shadow-md"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <HardDrive className="w-3.5 h-3.5" />
                Local
              </button>
              <button
                onClick={() => setActiveTab('cloud')}
                className={cn(
                  "flex-1 h-10 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                  activeTab === 'cloud'
                    ? "bg-surface-container text-on-surface shadow-md"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Cloud className="w-3.5 h-3.5" />
                Google Cloud
              </button>
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'local' ? (
                <motion.div
                  key="local-tab"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full space-y-5"
                >
                  <div className="space-y-4">
                    <div className="relative group">
                      <div className="absolute inset-0 bg-surface-dark border border-white/10 rounded-xl transition-colors group-hover:border-nature-green/30 group-focus-within:border-nature-green/50" />
                      <div className="relative flex items-center px-4 h-12 gap-3">
                        <Key className="w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors shrink-0" />
                        <input
                          type={showLocalPassword ? "text" : "password"}
                          ref={localPasswordRef}
                          placeholder="Enter master password"
                          value={localPassword}
                          onChange={(e) => setLocalPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleLocalUnlock()}
                          className="flex-grow bg-transparent border-none outline-none font-mono text-sm tracking-widest text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0"
                        />
                        <button
                          onClick={() => setShowLocalPassword(!showLocalPassword)}
                          tabIndex={-1}
                          className="text-on-surface-variant hover:text-nature-green transition-colors shrink-0"
                        >
                          {showLocalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {localError && (
                      <div className="flex items-center gap-2 text-earth-clay text-xs px-2 animate-pulse">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{localError}</span>
                      </div>
                    )}

                    <button
                      onClick={handleLocalUnlock}
                      disabled={isUnlocking}
                      className="w-full h-12 rounded-2xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark font-bold text-sm hover:scale-[1.02] active:scale-[0.97] transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isUnlocking ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Decrypting...
                        </>
                      ) : (
                        'Decrypt Vault'
                      )}
                    </button>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] font-mono text-on-surface-variant hover:text-nature-green uppercase tracking-wider transition-colors flex items-center gap-1.5"
                      >
                        <Upload className="w-3 h-3" />
                        Restore Backup
                      </button>
                      <button
                        onClick={onWipe}
                        className="text-[10px] font-mono text-on-surface-variant/50 hover:text-earth-clay uppercase tracking-wider transition-colors"
                      >
                        Reset Vault
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="cloud-tab"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full space-y-5"
                >
                  {renderCloudTab()}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          /* Consolidated View when no local vault exists */
          <div className="w-full space-y-5">
            {!googleUser ? (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <p className="text-xs md:text-sm text-on-surface-variant leading-relaxed">
                    Access your account using Google Cloud Sync, create a new local-only vault, or restore from a backup file.
                  </p>
                </div>

                {cloudError && (
                  <div className="flex items-center gap-2 text-earth-clay text-xs px-2 animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{cloudError}</span>
                  </div>
                )}

                <button
                  onClick={handleGoogleConnect}
                  disabled={isLoadingCloud}
                  className="w-full h-12 rounded-2xl border border-on-surface/10 hover:border-on-surface/20 bg-surface-container hover:bg-surface-container/80 text-on-surface font-bold text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50 shadow-sm hover:shadow-md cursor-pointer"
                >
                  {isLoadingCloud ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.19-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                      Sign in with Google to Restore
                    </>
                  )}
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-white/5"></div>
                  <span className="flex-shrink mx-4 text-on-surface-variant/40 font-mono text-[9px] uppercase tracking-wider">or start offline</span>
                  <div className="flex-grow border-t border-white/5"></div>
                </div>

                <button
                  onClick={onStartWizard}
                  className="w-full h-12 rounded-2xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark font-bold text-sm hover:scale-[1.02] active:scale-[0.97] transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  Create Local Vault
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-10 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-on-surface font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-nature-green" />
                  Restore from Backup File
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {isLoadingCloud ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-3">
                    <RefreshCw className="w-8 h-8 text-nature-green animate-spin" />
                    <span className="text-xs font-mono text-on-surface-variant/70 uppercase tracking-wider">Loading cloud vaults...</span>
                  </div>
                ) : (
                  renderCloudTab()
                )}
              </div>
            )}
          </div>
        )}
      </motion.main>
    </div>
  );
}
