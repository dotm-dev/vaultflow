import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, RefreshCw, CheckCircle, Download, Trash2, Shield, Moon, Sun, Coins, Hash, Calendar, Cloud, Database, User, Lock, Eye, EyeOff, AlertCircle, X, ArrowRight, Sparkles, Settings, Clock, Globe } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getConfig, saveConfig } from '../lib/db';
import { signInWithGoogle, signOutGoogle, getCloudManifest, isGoogleConnected, GoogleUser, VaultProfile } from '../lib/googleDriveSync';
import { hashPasswordForChallenge, hexToBytes } from '../lib/crypto';
import { formatDate, formatTime } from '../lib/formatters';

interface SettingsViewProps {
  onBack: () => void;
  onWipe: () => void;
  onExport: () => void;
  theme: 'light' | 'dark';
  themeSetting: 'light' | 'dark' | 'system';
  onToggleTheme: () => void;
  onChangeThemeSetting: (setting: 'light' | 'dark' | 'system') => void;
  currency: string;
  thousandsSeparator: string;
  dateFormat: string;
  timezone: string;
  language: string;
  onUpdateConfig: (key: string, value: any) => Promise<void>;
  onTriggerManualSync: () => Promise<boolean>;
  isSyncing: boolean;
  activeVaultId?: string;
  onSwitchVault: (
    vaultId: string,
    vaultName: string,
    vaultSalt: string,
    vaultChallenge: string,
    password: string,
    googleUser: any,
    config: { currency: string; thousands_separator: string; date_format: string },
    lastSaved: number
  ) => Promise<boolean>;
  onCreateNewLedger: () => Promise<void>;
  hasLocalData: boolean;
  hasUnsyncedChanges: boolean;
  onCreateModalToggle: (isOpen: boolean) => void;
  syncInterval: number;
  backupEnabled: boolean;
  lastSyncSuccess: number | null;
  keepCloudVaultLocal: boolean;
  connectedGoogleUser: GoogleUser | null;
  activeVaultName: string;
}

export default function SettingsView({ 
  onBack, 
  onWipe, 
  onExport, 
  theme, 
  themeSetting,
  onToggleTheme,
  onChangeThemeSetting,
  currency,
  thousandsSeparator,
  dateFormat,
  timezone,
  language,
  onUpdateConfig,
  onTriggerManualSync,
  isSyncing,
  activeVaultId,
  onSwitchVault,
  onCreateNewLedger,
  hasLocalData,
  hasUnsyncedChanges,
  onCreateModalToggle,
  syncInterval,
  backupEnabled,
  lastSyncSuccess,
  keepCloudVaultLocal,
  connectedGoogleUser,
  activeVaultName
}: SettingsViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'preferences' | 'backup' | 'security'>('preferences');

  // Cloud vault management state
  const [cloudVaults, setCloudVaults] = useState<VaultProfile[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [selectedSwitchVault, setSelectedSwitchVault] = useState<VaultProfile | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [showSwitchPassword, setShowSwitchPassword] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [syncBeforeSwitch, setSyncBeforeSwitch] = useState(true);
  const [isLinkingSyncing, setIsLinkingSyncing] = useState(false);

  const switchPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSwitchModal) {
      const timer = setTimeout(() => {
        switchPasswordRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showSwitchModal, selectedSwitchVault]);

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
    async function loadCloudVaults() {
      if (!connectedGoogleUser) {
        setCloudVaults([]);
        setIsSessionExpired(false);
        return;
      }

      if (!isGoogleConnected()) {
        setIsSessionExpired(true);
      } else {
        try {
          const manifest = await getCloudManifest(connectedGoogleUser.email);
          setCloudVaults(manifest.vaults);
          setIsSessionExpired(false);
        } catch (e: any) {
          console.error('Failed to load cloud vaults:', e);
          if (e.message && e.message.includes('UNAUTHORIZED')) {
            setIsSessionExpired(true);
          }
        }
      }
    }
    loadCloudVaults();
  }, [connectedGoogleUser]);

  useEffect(() => {
    onCreateModalToggle(showCreateModal);
  }, [showCreateModal, onCreateModalToggle]);

  const handleToggleSync = async () => {
    await onUpdateConfig('backup_enabled', !backupEnabled);
  };

  const handleGoogleConnectSettings = async () => {
    try {
      const user = await signInWithGoogle();
      setAvatarError(false);
      setIsSessionExpired(false);
      await onUpdateConfig('google_user', user);
      
      // Fetch cloud vaults manifest
      const manifest = await getCloudManifest(user.email);
      setCloudVaults(manifest.vaults);

      // If we don't have active_vault_id, create one
      let currentVaultId = await getConfig('active_vault_id');
      if (!currentVaultId) {
        currentVaultId = 'local-default';
        await onUpdateConfig('active_vault_id', currentVaultId);
        await onUpdateConfig('active_vault_name', 'Personal Vault');
      }

      // Check if local vault is already linked to this Google account
      const isAlreadyLinked = manifest.vaults.some(v => v.id === currentVaultId);
      if (!isAlreadyLinked) {
        setShowLinkModal(true);
      }
    } catch (err) {
      console.error(err);
      alert('Google authentication failed.');
    }
  };

  const handleLinkAndUpload = async () => {
    setIsLinkingSyncing(true);
    try {
      const success = await onTriggerManualSync();
      if (success) {
        // Refresh manifest to include the newly linked vault
        if (connectedGoogleUser) {
          const manifest = await getCloudManifest(connectedGoogleUser.email);
          setCloudVaults(manifest.vaults);
        }
        setIsSessionExpired(false);
      } else {
        if (!isGoogleConnected()) {
          setIsSessionExpired(true);
        }
      }
    } catch (e) {
      console.error('Link sync failed:', e);
      if (!isGoogleConnected()) {
        setIsSessionExpired(true);
      }
    } finally {
      setIsLinkingSyncing(false);
      setShowLinkModal(false);
    }
  };

  const handleOpenSwitchModal = (vault: VaultProfile) => {
    setSelectedSwitchVault(vault);
    setSwitchPassword('');
    setSwitchError('');
    setShowSwitchPassword(false);
    setSyncBeforeSwitch(hasUnsyncedChanges);
    setShowSwitchModal(true);
  };

  const handleConfirmSwitch = async () => {
    if (!selectedSwitchVault || !connectedGoogleUser) return;
    if (switchPassword.length === 0) {
      setSwitchError('Master password is required.');
      return;
    }
    setSwitchError('');

    try {
      // Verify password against challenge hash
      const saltBytes = hexToBytes(selectedSwitchVault.salt);
      const calculatedChallenge = await hashPasswordForChallenge(switchPassword, saltBytes);
      if (calculatedChallenge !== selectedSwitchVault.challenge) {
        setSwitchError('Incorrect master password for this vault.');
        return;
      }

      setIsSwitching(true);

      // Optionally sync current vault before switching
      if (syncBeforeSwitch) {
        const success = await onTriggerManualSync();
        if (!success && !isGoogleConnected()) {
          setIsSessionExpired(true);
          setSwitchError('Google Drive session expired. Switch aborted.');
          setIsSwitching(false);
          return;
        }
      }

      // Perform the switch
      const success = await onSwitchVault(
        selectedSwitchVault.id,
        selectedSwitchVault.name,
        selectedSwitchVault.salt,
        selectedSwitchVault.challenge,
        switchPassword,
        connectedGoogleUser,
        selectedSwitchVault.config,
        selectedSwitchVault.lastSaved
      );

      if (success) {
        setShowSwitchModal(false);
      } else {
        setSwitchError('Failed to switch vault. Please try again.');
      }
    } catch (err) {
      setSwitchError('An error occurred during the vault switch.');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleUpdateInterval = async (intervalMs: number) => {
    await onUpdateConfig('backup_interval', intervalMs);
  };

  const handleToggleKeepLocal = async () => {
    await onUpdateConfig('keep_cloud_vault_local', !keepCloudVaultLocal);
  };

  const handleManualSyncClick = async () => {
    if (!isGoogleConnected()) {
      setIsSessionExpired(true);
      await handleGoogleConnectSettings();
      return;
    }
    const success = await onTriggerManualSync();
    if (success) {
      setIsSessionExpired(false);
    } else {
      if (!isGoogleConnected()) {
        setIsSessionExpired(true);
      }
    }
  };

  const formattedLastSync = lastSyncSuccess
    ? `${formatDate(lastSyncSuccess, dateFormat, timezone)} ${formatTime(lastSyncSuccess, timezone, true)}`
    : 'Never';

  return (
    <div className="min-h-screen bg-surface-dark flex flex-col relative overflow-y-auto selection:bg-nature-green selection:text-surface-dark pb-10">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-ocean-blue/10 blur-[120px] rounded-full pointer-events-none" />

      <header className="w-full z-40 bg-surface-dark/80 backdrop-blur-xl border-b border-on-surface/10 dark:border-white/5 sticky top-0">
        <div className="max-w-3xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
            <div className="text-xl font-black text-on-surface tracking-tight">Settings</div>
          </div>

          <button 
            onClick={onToggleTheme}
            className="w-10 h-10 rounded-full bg-on-surface/10 border border-on-surface/15 flex items-center justify-center hover:bg-on-surface/20 text-on-surface-variant hover:text-nature-green active:scale-90 transition-all cursor-pointer relative"
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

      <main className="flex-grow flex flex-col items-center px-6 max-w-3xl mx-auto w-full py-8 z-10 gap-8">
        
        {/* Horizontal Tab Switcher */}
        <div className="w-full bg-surface-container/60 backdrop-blur-md rounded-2xl p-1 flex gap-1 border border-on-surface/10 dark:border-white/5 shadow-sm">
          <button
            onClick={() => setActiveTab('preferences')}
            className={cn(
              "relative flex-1 py-3 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer z-10",
              activeTab === 'preferences'
                ? "text-nature-green font-extrabold"
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {activeTab === 'preferences' && (
              <motion.div
                layoutId="active-settings-tab"
                className="absolute inset-0 bg-surface-dark shadow-md border border-on-surface/5 dark:border-white/5 rounded-xl -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Settings className="w-4 h-4" />
            Preferences
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={cn(
              "relative flex-1 py-3 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer z-10",
              activeTab === 'backup'
                ? "text-nature-green font-extrabold"
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {activeTab === 'backup' && (
              <motion.div
                layoutId="active-settings-tab"
                className="absolute inset-0 bg-surface-dark shadow-md border border-on-surface/5 dark:border-white/5 rounded-xl -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Cloud className="w-4 h-4" />
            Cloud Backup
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              "relative flex-1 py-3 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer z-10",
              activeTab === 'security'
                ? "text-nature-green font-extrabold"
                : "text-on-surface-variant hover:text-on-surface"
            )}
          >
            {activeTab === 'security' && (
              <motion.div
                layoutId="active-settings-tab"
                className="absolute inset-0 bg-surface-dark shadow-md border border-on-surface/5 dark:border-white/5 rounded-xl -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Shield className="w-4 h-4" />
            Data & Security
          </button>
        </div>

        {/* Tab Content Rendering */}
        <div className="w-full flex flex-col gap-8">
          
          {/* TAB 1: PREFERENCES */}
          {activeTab === 'preferences' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 w-full"
            >
              {/* Appearance Section */}
              <section className="w-full flex flex-col gap-4">
                <h2 className="font-mono text-xs text-on-surface-variant uppercase tracking-widest font-bold px-2">Appearance</h2>
                
                <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
                      {themeSetting === 'light' ? (
                        <Sun className="w-5 h-5 text-sand-gold" />
                      ) : themeSetting === 'dark' ? (
                        <Moon className="w-5 h-5 text-ocean-blue" />
                      ) : (
                        <Settings className="w-5 h-5 text-nature-green" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-on-surface">Choose Default Theme</div>
                      <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Select your preferred default interface mode</div>
                    </div>
                  </div>
                  
                  <select 
                    value={themeSetting}
                    onChange={(e) => onChangeThemeSetting(e.target.value as 'light' | 'dark' | 'system')}
                    className="bg-surface-dark border border-on-surface/10 rounded-xl px-4 py-2 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                  >
                    <option className="bg-surface-dark text-on-surface" value="light">Light</option>
                    <option className="bg-surface-dark text-on-surface" value="dark">Dark</option>
                    <option className="bg-surface-dark text-on-surface" value="system">System</option>
                  </select>
                </div>
              </section>

              {/* Regional Settings Section */}
              <section className="w-full flex flex-col gap-4">
                <h2 className="font-mono text-xs text-on-surface-variant uppercase tracking-widest font-bold px-2">Regional Settings</h2>
                
                <div className="glass-card rounded-2xl flex flex-col divide-y divide-on-surface/10 dark:divide-white/5 overflow-hidden">
                  {/* Currency Select */}
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
                        <Coins className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Base Currency</div>
                        <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Primary currency for accounts & reports</div>
                      </div>
                    </div>
                    
                    <select 
                      value={currency}
                      onChange={(e) => onUpdateConfig('currency', e.target.value)}
                      className="bg-surface-dark border border-on-surface/10 rounded-xl px-4 py-2 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                    >
                      <option className="bg-surface-dark text-on-surface" value="$">USD ($)</option>
                      <option className="bg-surface-dark text-on-surface" value="€">EUR (€)</option>
                      <option className="bg-surface-dark text-on-surface" value="£">GBP (£)</option>
                      <option className="bg-surface-dark text-on-surface" value="CHF">CHF (CHF)</option>
                      <option className="bg-surface-dark text-on-surface" value="¥">JPY (¥)</option>
                    </select>
                  </div>

                  {/* Thousands Separator Select */}
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
                        <Hash className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Thousands Separator</div>
                        <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Delimiter used for large values</div>
                      </div>
                    </div>
                    
                    <select 
                      value={thousandsSeparator}
                      onChange={(e) => onUpdateConfig('thousands_separator', e.target.value)}
                      className="bg-surface-dark border border-on-surface/10 rounded-xl px-4 py-2 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                    >
                      <option className="bg-surface-dark text-on-surface" value=",">Comma (,)</option>
                      <option className="bg-surface-dark text-on-surface" value=".">Period (.)</option>
                      <option className="bg-surface-dark text-on-surface" value="'">Apostrophe (')</option>
                      <option className="bg-surface-dark text-on-surface" value=" ">Space ( )</option>
                      <option className="bg-surface-dark text-on-surface" value="">None</option>
                    </select>
                  </div>

                  {/* Date Format Select */}
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Date Format</div>
                        <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Preferred calendar display pattern</div>
                      </div>
                    </div>
                    
                    <select 
                      value={dateFormat}
                      onChange={(e) => onUpdateConfig('date_format', e.target.value)}
                      className="bg-surface-dark border border-on-surface/10 rounded-xl px-4 py-2 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                    >
                      <option className="bg-surface-dark text-on-surface" value="MMM DD, YYYY">May 19, 2026</option>
                      <option className="bg-surface-dark text-on-surface" value="DD.MM.YYYY">19.05.2026</option>
                      <option className="bg-surface-dark text-on-surface" value="DD/MM/YYYY">19/05/2026</option>
                      <option className="bg-surface-dark text-on-surface" value="YYYY-MM-DD">2026-05-19</option>
                      <option className="bg-surface-dark text-on-surface" value="MM/DD/YYYY">05/19/2026</option>
                    </select>
                  </div>

                  {/* Timezone Select */}
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Timezone</div>
                        <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Affects all dates and times</div>
                      </div>
                    </div>
                    
                    <select 
                      value={timezone}
                      onChange={(e) => onUpdateConfig('timezone', e.target.value)}
                      className="bg-surface-dark border border-on-surface/10 rounded-xl px-4 py-2 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer max-w-[260px]"
                    >
                      {(() => {
                        const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        const allTimezones = Intl.supportedValuesOf('timeZone');
                        
                        // Group timezones by region prefix
                        const groups: Record<string, string[]> = {};
                        const standalone: string[] = [];
                        
                        for (const tz of allTimezones) {
                          const slashIdx = tz.indexOf('/');
                          if (slashIdx === -1) {
                            standalone.push(tz);
                          } else {
                            const region = tz.substring(0, slashIdx);
                            if (!groups[region]) groups[region] = [];
                            groups[region].push(tz);
                          }
                        }

                        // Region display order
                        const regionOrder = ['Africa', 'America', 'Antarctica', 'Arctic', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific'];
                        const sortedRegions = regionOrder.filter(r => groups[r]);
                        // Add any remaining regions not in the order list
                        for (const r of Object.keys(groups)) {
                          if (!sortedRegions.includes(r)) sortedRegions.push(r);
                        }

                        return (
                          <>
                            <optgroup label="System Default">
                              <option className="bg-surface-dark text-on-surface" value={systemTz}>
                                {systemTz.replace(/_/g, ' ')} (System)
                              </option>
                            </optgroup>
                            {standalone.length > 0 && (
                              <optgroup label="Universal">
                                {standalone.map(tz => (
                                  <option key={tz} className="bg-surface-dark text-on-surface" value={tz}>
                                    {tz}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {sortedRegions.map(region => (
                              <optgroup key={region} label={region}>
                                {groups[region].map(tz => {
                                  const city = tz.substring(tz.indexOf('/') + 1).replace(/_/g, ' ');
                                  return (
                                    <option key={tz} className="bg-surface-dark text-on-surface" value={tz}>
                                      {city}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            ))}
                          </>
                        );
                      })()}
                    </select>
                  </div>

                  {/* Language Select (Mockup) */}
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Language</div>
                        <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Interface display language</div>
                      </div>
                    </div>
                    
                    <select 
                      value={language}
                      onChange={(e) => onUpdateConfig('language', e.target.value)}
                      className="bg-surface-dark border border-on-surface/10 rounded-xl px-4 py-2 font-mono text-sm text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                    >
                      <option className="bg-surface-dark text-on-surface" value="en">English</option>
                      <option className="bg-surface-dark text-on-surface" value="it">Italiano</option>
                      <option className="bg-surface-dark text-on-surface" value="de">Deutsch</option>
                      <option className="bg-surface-dark text-on-surface" value="fr">Français</option>
                      <option className="bg-surface-dark text-on-surface" value="es">Español</option>
                      <option className="bg-surface-dark text-on-surface" value="ja">日本語</option>
                      <option className="bg-surface-dark text-on-surface" value="zh">中文</option>
                    </select>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {/* TAB 2: CLOUD BACKUP (REIMAGINED SYNC DASHBOARD) */}
          {activeTab === 'backup' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 w-full"
            >
              {!connectedGoogleUser ? (
                /* Offline Setup Hero Card */
                <div className="w-full flex flex-col gap-6">
                  <div className="glass-card rounded-[2rem] p-8 relative overflow-hidden flex flex-col items-center text-center gap-6">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-ocean-blue/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-nature-green/10 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="w-16 h-16 rounded-2xl bg-surface-container border border-on-surface/5 dark:border-white/5 flex items-center justify-center">
                      <Cloud className="w-8 h-8 text-ocean-blue" />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-on-surface">Enable Google Cloud Sync</h3>
                      <p className="text-xs text-on-surface-variant max-w-sm leading-relaxed">
                        Securely link your encrypted ledger vaults to your private Google Drive. Access your budgets and records across multiple devices.
                      </p>
                    </div>

                    <button
                      onClick={handleGoogleConnectSettings}
                      className="px-6 py-3.5 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark hover:scale-105 active:scale-95 transition-all text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2.5 shadow-lg shadow-nature-green/15 cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.19-.63z"/>
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                      Connect Google Account
                    </button>
                  </div>
                </div>
              ) : (
                /* Connected High-Fidelity Dashboard */
                <div className="w-full flex flex-col gap-6">
                  {/* Session Expired / Reconnect Banner */}
                  {isSessionExpired && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 text-center space-y-3.5">
                      <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Google Session Expired</h4>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">
                          Your secure Google Drive connection has expired. Please reconnect your account to continue synchronization.
                        </p>
                      </div>
                      <button
                        onClick={handleGoogleConnectSettings}
                        className="mx-auto px-5 py-2.5 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md shadow-nature-green/10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reconnect Google Account
                      </button>
                    </div>
                  )}

                  {/* Account Information Card */}
                  <div className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {avatarError ? (
                          <div className="w-12 h-12 rounded-full bg-nature-green/10 text-nature-green border-2 border-nature-green/30 flex items-center justify-center text-sm font-mono font-bold">
                            {getInitials(connectedGoogleUser.name, connectedGoogleUser.email)}
                          </div>
                        ) : (
                          <img
                            src={connectedGoogleUser.avatar}
                            onError={() => setAvatarError(true)}
                            className="w-12 h-12 rounded-full border-2 border-nature-green/30 object-cover"
                            alt={connectedGoogleUser.name}
                          />
                        )}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-dark border border-white/10 flex items-center justify-center">
                          <Cloud className="w-3 h-3 text-nature-green" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-on-surface">{connectedGoogleUser.name}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-widest border",
                            isSessionExpired
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : "bg-nature-green/10 text-nature-green border-nature-green/20"
                          )}>
                            {isSessionExpired ? "Session Expired" : "Cloud Connected"}
                          </span>
                        </div>
                        <div className="text-xs text-on-surface-variant font-mono mt-0.5">{connectedGoogleUser.email}</div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-start sm:items-end gap-0.5">
                      <span className="text-[9px] uppercase font-bold text-on-surface-variant font-mono tracking-wider">Active Vault</span>
                      <span className="text-xs font-mono font-bold text-nature-green">{activeVaultName}</span>
                      <button
                        onClick={async () => {
                          signOutGoogle();
                          await onUpdateConfig('google_user', null);
                          await onUpdateConfig('active_vault_id', null);
                          await onUpdateConfig('active_vault_name', null);
                        }}
                        className="text-[9px] font-mono uppercase tracking-wider text-earth-clay hover:underline cursor-pointer mt-1.5"
                      >
                        Disconnect Account
                      </button>
                    </div>
                  </div>

                  {/* Sync Control & Configuration Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                    {/* Sync Status Card */}
                    <div className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-6">
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Sync Status</h3>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">
                          Backup your encrypted offline ledger database manually to your Google Drive account.
                        </p>
                      </div>

                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between bg-black/10 rounded-xl p-3 border border-on-surface/10 dark:border-white/5">
                          <div className="space-y-0.5">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant font-mono tracking-wider">Last Synced</span>
                            <span className="text-xs font-mono font-bold text-on-surface block">{formattedLastSync}</span>
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full bg-nature-green animate-pulse" />
                        </div>

                        <button
                          onClick={handleManualSyncClick}
                          disabled={isSyncing}
                          className="w-full py-3 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-nature-green/10"
                        >
                          {isSyncing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3.5 h-3.5" />
                              Sync Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Automation Card */}
                    <div className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-6">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Automation</h3>
                          <button 
                            onClick={handleToggleSync}
                            disabled={!connectedGoogleUser}
                            className={cn(
                               "relative inline-flex h-6 w-11 items-center rounded-full transition-colors border",
                               !connectedGoogleUser
                                 ? (backupEnabled 
                                     ? "bg-nature-green/50 border-transparent opacity-60 cursor-not-allowed" 
                                     : "bg-on-surface/10 border-on-surface/15 opacity-60 cursor-not-allowed")
                                 : (backupEnabled 
                                     ? "bg-nature-green border-transparent cursor-pointer" 
                                     : "bg-on-surface/15 border-on-surface/25 cursor-pointer")
                             )}
                          >
                            <div className={cn(
                              "h-4 w-4 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-300",
                              backupEnabled ? "translate-x-6" : "translate-x-1"
                            )}>
                              {backupEnabled && <CheckCircle className="w-2.5 h-2.5 text-nature-green" />}
                            </div>
                          </button>
                        </div>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">
                          Securely backup your encrypted ledger logs automatically behind the scenes on a periodic cycle.
                        </p>
                      </div>

                      <div className={cn("space-y-3.5 transition-all duration-300", backupEnabled ? "opacity-100" : "opacity-30 pointer-events-none")}>
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] uppercase font-bold text-on-surface-variant font-mono tracking-wider">Sync Interval</span>
                          <select
                            value={syncInterval}
                            onChange={(e) => handleUpdateInterval(Number(e.target.value))}
                            className="w-full bg-surface-dark border border-white/10 rounded-xl px-3 py-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-nature-green/50 cursor-pointer"
                          >
                            <option value={30000}>30 Seconds</option>
                            <option value={60000}>1 Minute</option>
                            <option value={300000}>5 Minutes</option>
                            <option value={600000}>10 Minutes</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Local Storage Caching Option */}
                  <div className="glass-card rounded-2xl p-5 flex flex-col gap-4 w-full">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Local Caching</h3>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed max-w-lg">
                          Store an encrypted database cache in this browser's IndexedDB to allow offline unlocking. Disabling this cache is recommended for shared devices: it deletes all local ledger keys and records when you close or reload the app, requiring a cloud sync to unlock.
                        </p>
                      </div>
                      <button 
                        onClick={handleToggleKeepLocal}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 border",
                          keepCloudVaultLocal 
                            ? "bg-nature-green border-transparent" 
                            : "bg-on-surface/15 border-on-surface/25"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-300",
                          keepCloudVaultLocal ? "translate-x-6" : "translate-x-1"
                        )}>
                          {keepCloudVaultLocal && <CheckCircle className="w-2.5 h-2.5 text-nature-green" />}
                        </div>
                      </button>
                    </div>

                    {keepCloudVaultLocal && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] leading-relaxed text-on-surface-variant/80 flex items-start gap-2">
                        <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-amber-500 font-bold block mb-0.5 font-mono">Warning: Keep Local Copy Enabled</span>
                          Enabling local caching will store encrypted ledger parameters locally. Anyone who has physical access to this browser can attempt to challenge your master passcode and decrypt your records.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cloud Vaults Manager */}
                  {cloudVaults.length > 0 && (
                    <div className="glass-card rounded-[2rem] p-6 flex flex-col gap-4 w-full">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-ocean-blue/10 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-ocean-blue" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-on-surface">Available Cloud Vaults</h3>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {cloudVaults.length} encrypted vault{cloudVaults.length !== 1 ? 's' : ''} stored under your account.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        {cloudVaults.map((vault) => {
                          const isActive = activeVaultId === vault.id;
                          return (
                            <div
                              key={vault.id}
                              className={cn(
                                "flex flex-col justify-between p-4 rounded-xl border transition-all gap-4",
                                isActive
                                  ? "border-nature-green/40 bg-nature-green/5 shadow-[0_0_15px_rgba(123,160,91,0.05)]"
                                  : "border-on-surface/10 dark:border-white/5 bg-on-surface/[0.01] dark:bg-white/[0.01] hover:bg-on-surface/[0.03] dark:hover:bg-white/[0.03] hover:border-on-surface/20 dark:hover:border-white/10"
                              )}
                            >
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-on-surface truncate font-mono">{vault.name}</span>
                                  {isActive && (
                                    <span className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold uppercase tracking-widest bg-nature-green/10 text-nature-green border border-nature-green/20 shrink-0">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-on-surface-variant font-mono mt-1">
                                  Last updated: {formatDate(vault.lastSaved, dateFormat, timezone)} {formatTime(vault.lastSaved, timezone)}
                                </span>
                              </div>
                              
                              {!isActive && (
                                <button
                                  onClick={() => handleOpenSwitchModal(vault)}
                                  className="w-full py-2 rounded-lg bg-ocean-blue/10 text-ocean-blue hover:bg-ocean-blue/20 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer text-center"
                                >
                                  Activate Vault
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: DATA & SECURITY */}
          {activeTab === 'security' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 w-full"
            >
              {/* Data Management Section */}
              <section className="w-full flex flex-col gap-4">
                <h2 className="font-mono text-xs text-on-surface-variant uppercase tracking-widest font-bold px-2">Data Operations</h2>
                
                <div className="glass-card rounded-2xl flex flex-col divide-y divide-on-surface/10 dark:divide-white/5 overflow-hidden">
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-nature-green/10 flex items-center justify-center">
                        <Download className="w-5 h-5 text-nature-green" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Export Vault</div>
                        <div className="text-xs text-on-surface-variant mt-0.5">Download a JSON backup of your records</div>
                      </div>
                    </div>
                    <button 
                      onClick={onExport}
                      className="px-4 py-2 rounded-xl bg-nature-green/10 text-nature-green hover:bg-nature-green/20 text-sm font-bold transition-colors cursor-pointer"
                    >
                      Export
                    </button>
                  </div>

                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-nature-green/10 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-nature-green" />
                      </div>
                      <div>
                        <div className="font-bold text-on-surface">Create New Ledger</div>
                        <div className="text-xs text-on-surface-variant mt-0.5">Start fresh with a brand new vault</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-sm font-bold hover:scale-[1.02] active:scale-[0.97] transition-all whitespace-nowrap cursor-pointer"
                    >
                      Create
                    </button>
                  </div>

                  <div className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-earth-clay/10 flex items-center justify-center shrink-0">
                        <Trash2 className="w-5 h-5 text-earth-clay" />
                      </div>
                      <div>
                        <div className="font-bold text-earth-clay">Danger Zone: Wipe Local Vault</div>
                        <div className="text-xs text-on-surface-variant mt-0.5 max-w-sm">
                          Permanently delete all cryptographic keys, configurations, and encrypted logs from this browser. This is irreversible.
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={onWipe}
                      className="px-4 py-2 rounded-xl border border-earth-clay/30 text-earth-clay hover:bg-earth-clay/10 text-sm font-bold transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                    >
                      Wipe Vault
                    </button>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

        </div>

      </main>

      {/* ─── Link Local Vault Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {showLinkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowLinkModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-on-surface/10 dark:border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Link Local Vault</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Upload your local ledger to Google Drive</p>
                </div>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-on-surface-variant transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-on-surface/5 dark:bg-white/5 border border-on-surface/10 dark:border-white/5 rounded-2xl p-4 text-center space-y-2">
                  <Cloud className="w-8 h-8 text-ocean-blue mx-auto" />
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Your local ledger vault is not yet synced to your Google Drive. Would you like to link and upload it now?
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLinkModal(false)}
                    className="flex-1 h-11 rounded-xl border border-on-surface/10 hover:border-on-surface/20 dark:border-white/10 dark:hover:border-white/20 bg-on-surface/5 dark:bg-white/5 text-on-surface text-xs font-bold transition-all"
                  >
                    Maybe Later
                  </button>
                  <button
                    onClick={handleLinkAndUpload}
                    disabled={isLinkingSyncing}
                    className="flex-1 h-11 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold hover:scale-[1.02] active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLinkingSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Link & Upload'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Switch Vault Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSwitchModal && selectedSwitchVault && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isSwitching && setShowSwitchModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-on-surface/10 dark:border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Switch Vault</h2>
                  <p className="text-xs text-on-surface-variant mt-1 font-mono">{selectedSwitchVault.name}</p>
                </div>
                <button
                  onClick={() => !isSwitching && setShowSwitchModal(false)}
                  disabled={isSwitching}
                  className="p-2 rounded-full hover:bg-white/5 text-on-surface-variant transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Warning */}
                <div className="bg-earth-clay/10 border border-earth-clay/20 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-2 text-earth-clay text-xs font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Warning
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Switching will replace your local database with the selected vault's data. Any unsynced local changes will be lost.
                  </p>
                </div>

                {/* Sync before switch checkbox */}
                {activeVaultId && cloudVaults.some(v => v.id === activeVaultId) && (
                  hasUnsyncedChanges ? (
                    <label 
                      onClick={() => setSyncBeforeSwitch(!syncBeforeSwitch)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSyncBeforeSwitch(!syncBeforeSwitch); } }}
                      tabIndex={0}
                      role="checkbox"
                      aria-checked={syncBeforeSwitch}
                      className="flex items-center gap-3 cursor-pointer group select-none outline-none focus:text-nature-green"
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                          syncBeforeSwitch ? "bg-nature-green border-nature-green" : "border-on-surface/25 dark:border-white/20 group-hover:border-on-surface/40 dark:group-hover:border-white/40"
                        )}
                      >
                        {syncBeforeSwitch && <CheckCircle className="w-3.5 h-3.5 text-surface-dark" />}
                      </div>
                      <span className="text-xs text-on-surface-variant font-medium group-hover:text-on-surface transition-colors">Sync current vault to Google Drive before switching</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 text-nature-green text-[10px] font-mono font-bold uppercase tracking-wider bg-nature-green/5 border border-nature-green/10 rounded-xl px-3.5 py-2.5">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>All changes synced to Google Drive</span>
                    </div>
                  )
                )}

                {/* Password input */}
                <div className="space-y-2">
                  <label className="text-[9px] uppercase font-bold text-on-surface-variant font-mono tracking-wider px-1">
                    Master Password for "{selectedSwitchVault.name}"
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-surface-dark border border-white/10 rounded-xl transition-colors group-hover:border-nature-green/30 group-focus-within:border-nature-green/50" />
                    <div className="relative flex items-center px-4 h-12 gap-3">
                      <Lock className="w-4 h-4 text-on-surface-variant group-focus-within:text-nature-green transition-colors shrink-0" />
                      <input
                        ref={switchPasswordRef}
                        type={showSwitchPassword ? "text" : "password"}
                        placeholder="Enter master password"
                        value={switchPassword}
                        onChange={(e) => setSwitchPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirmSwitch()}
                        className="flex-grow bg-transparent border-none outline-none font-mono text-sm tracking-widest text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0 p-0"
                        disabled={isSwitching}
                      />
                      <button
                        onClick={() => setShowSwitchPassword(!showSwitchPassword)}
                        tabIndex={-1}
                        className="text-on-surface-variant hover:text-nature-green transition-colors shrink-0"
                      >
                        {showSwitchPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {switchError && (
                  <div className="flex items-center gap-2 text-earth-clay text-xs px-2 animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{switchError}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSwitchModal(false)}
                    disabled={isSwitching}
                    className="flex-1 h-11 rounded-xl border border-on-surface/10 hover:border-on-surface/20 dark:border-white/10 dark:hover:border-white/20 bg-on-surface/5 dark:bg-white/5 text-on-surface text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSwitch}
                    disabled={isSwitching}
                    className="flex-1 h-11 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold hover:scale-[1.02] active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSwitching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Switching...
                      </>
                    ) : 'Switch Vault'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Create New Ledger Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isSyncing && setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-on-surface/10 dark:border-white/5">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Create New Ledger</h2>
                  <p className="text-xs text-on-surface-variant mt-1 font-mono">Start fresh with a new vault</p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSyncing}
                  className="p-2 rounded-full hover:bg-white/5 text-on-surface-variant transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {connectedGoogleUser ? (
                  /* Remote Ledger Warning */
                  <div className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-left">
                      <div className="flex items-center gap-2 text-amber-500 text-xs font-bold font-mono uppercase tracking-wider">
                        <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                        Remote Ledger In Use
                      </div>
                      <p className="text-xs leading-relaxed text-on-surface-variant">
                        You are currently using a Google-synced ledger vault (<span className="text-nature-green font-bold">{activeVaultName}</span>).
                      </p>
                      <p className="text-[11px] leading-relaxed text-on-surface-variant/80 font-mono">
                        Starting a new ledger will clear your local working database. Any local changes that have NOT been synchronized to Google Drive will be lost. The remote copy in your Google Drive will remain safe.
                      </p>
                    </div>

                    {hasUnsyncedChanges && (
                      <div className="bg-on-surface/5 dark:bg-white/5 border border-on-surface/10 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4 text-left">
                        <div>
                          <div className="text-xs font-bold text-on-surface">Synchronize First?</div>
                          <div className="text-[10px] text-on-surface-variant mt-0.5">
                            Ensure all local transactions are uploaded.
                          </div>
                        </div>
                        <button
                          onClick={handleManualSyncClick}
                          disabled={isSyncing}
                          className="px-3.5 py-2 rounded-xl bg-nature-green text-surface-dark font-mono text-[10px] font-bold uppercase tracking-wider hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                        >
                          {isSyncing ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3 h-3" />
                              Sync Now
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Local Ledger Warning */
                  <div className="space-y-4">
                    <div className="bg-earth-clay/10 border border-earth-clay/20 rounded-2xl p-4 space-y-2 text-left">
                      <div className="flex items-center gap-2 text-earth-clay text-xs font-bold font-mono uppercase tracking-wider">
                        <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                        Local Ledger In Use
                      </div>
                      <p className="text-xs leading-relaxed text-on-surface-variant">
                        You are currently using a <span className="text-earth-clay font-bold">Local-Only</span> ledger vault.
                      </p>
                      <p className="text-[11px] leading-relaxed text-on-surface-variant/80 font-mono">
                        Since this ledger is stored strictly in your browser and not synced to Google Drive, ALL your data will be permanently and irreversibly deleted.
                      </p>
                    </div>

                    {hasLocalData && (
                      <div className="bg-on-surface/5 dark:bg-white/5 border border-on-surface/10 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4 text-left">
                        <div>
                          <div className="text-xs font-bold text-on-surface">Export Backup First?</div>
                          <div className="text-[10px] text-on-surface-variant mt-0.5">
                            Save your data to a local file before wiping.
                          </div>
                        </div>
                        <button
                          onClick={onExport}
                          className="px-3.5 py-2 rounded-xl bg-nature-green/10 text-nature-green font-mono text-[10px] font-bold uppercase tracking-wider hover:bg-nature-green/20 transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <Download className="w-3 h-3" />
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    disabled={isSyncing}
                    className="flex-1 h-11 rounded-xl border border-on-surface/10 hover:border-on-surface/20 dark:border-white/10 dark:hover:border-white/20 bg-on-surface/5 dark:bg-white/5 text-on-surface text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setShowCreateModal(false);
                      await onCreateNewLedger();
                    }}
                    disabled={isSyncing}
                    className="flex-1 h-11 rounded-xl bg-linear-to-tr from-ocean-blue to-nature-green text-surface-dark text-xs font-bold hover:scale-[1.02] active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Create New Ledger
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
