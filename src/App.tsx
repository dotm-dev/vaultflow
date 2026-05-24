import { useState, useEffect } from 'react';
import LandingView from './components/LandingView';
import UnlockView from './components/UnlockView';
import WizardView from './components/WizardView';
import EmptyDashboardView from './components/EmptyDashboardView';
import DashboardView from './components/DashboardView';
import SettingsView from './components/SettingsView';
import BudgetView from './components/BudgetView';
import ExpectedBudgetView from './components/ExpectedBudgetView';
import CategoryDetailsView from './components/CategoryDetailsView';
import ManualExpenseModal from './components/ManualExpenseModal';
import ImportModal from './components/ImportModal';
import { AppState, AppView, Transaction } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { getConfig, getAllEncryptedTransactions, saveEncryptedTransaction, saveConfig, clearAllLocalData, clearLocalVaultCache } from './lib/db';
import { deriveEncryptionKey, decryptPayload, encryptPayload, hashPasswordForChallenge, hexToBytes } from './lib/crypto';
import { getCloudManifest, saveCloudManifest, saveCloudVaultData, getCloudVaultData, isGoogleConnected, getConnectedGoogleUser } from './lib/googleDriveSync';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>({
    view: 'landing',
    wizardStep: 1,
    hasData: false,
    isManualExpenseOpen: false,
    isImportModalOpen: false,
  });

  // Global Theme State
  const [themeSetting, setThemeSetting] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('vaultflow_theme');
    return (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'light';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    
    function handleChange() {
      if (themeSetting === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'light' : 'dark');
      } else {
        setResolvedTheme(themeSetting);
      }
    }

    handleChange();

    if (themeSetting === 'system') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [themeSetting]);

  useEffect(() => {
    if (resolvedTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('vaultflow_theme', themeSetting);
  }, [resolvedTheme, themeSetting]);

  const handleToggleTheme = () => {
    if (themeSetting === 'system') {
      setThemeSetting(resolvedTheme === 'light' ? 'dark' : 'light');
    } else {
      setThemeSetting(themeSetting === 'light' ? 'dark' : 'light');
    }
  };

  // Local Cryptographic State
  const [isLocked, setIsLocked] = useState<boolean | null>(null); // null = checking DB status
  const [salt, setSalt] = useState<Uint8Array | null>(null);
  const [challengeHash, setChallengeHash] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<CryptoKey | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState('$');
  const [thousandsSeparator, setThousandsSeparator] = useState(',');
  const [dateFormat, setDateFormat] = useState('MMM DD, YYYY');
  const [timezone, setTimezone] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [language, setLanguage] = useState<string>('en');
  const [activeVaultName, setActiveVaultName] = useState<string>('Local Vault');
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  const [connectedGoogleUser, setConnectedGoogleUser] = useState<any | null>(null);
  const [creationBalance, setCreationBalance] = useState<string>('0');
  const [ledgerCreatedAt, setLedgerCreatedAt] = useState<number>(0);
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem('vaultflow_sync_interval');
    return saved ? Number(saved) : 60000;
  });
  const [isCreateLedgerModalOpen, setIsCreateLedgerModalOpen] = useState(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(false);
  const [backupEnabled, setBackupEnabled] = useState<boolean>(true);
  const [keepCloudVaultLocal, setKeepCloudVaultLocal] = useState<boolean>(false);
  const [lastSyncSuccess, setLastSyncSuccess] = useState<number | null>(null);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsyncedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Standard browser confirmation trigger
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsyncedChanges]);

  // On-mount: check if a cryptographic vault exists
  useEffect(() => {
    async function checkInit() {
      try {
        let storedGoogleUser = await getConfig('google_user');
        if (!storedGoogleUser && isGoogleConnected()) {
          storedGoogleUser = await getConnectedGoogleUser();
          if (storedGoogleUser) {
            await saveConfig('google_user', storedGoogleUser);
          }
        }
        const keepLocal = await getConfig('keep_cloud_vault_local');
        
        // If a cloud connection exists, but we choose not to keep a local copy,
        // clear the local crypt cache immediately on startup/reload.
        if (storedGoogleUser && keepLocal !== true) {
          const storedSaltHex = await getConfig('encryption_salt');
          if (storedSaltHex) {
            console.log('[Security] Cloud vault connected and local caching is disabled. Wiping local crypt cache.');
            await clearLocalVaultCache();
          }
        }

        const storedSaltHex = await getConfig('encryption_salt');
        const storedChallenge = await getConfig('challenge_hash');
        const storedCurrency = await getConfig('currency');
        const storedSeparator = await getConfig('thousands_separator');
        const storedDateFormat = await getConfig('date_format');
        const storedTimezone = await getConfig('timezone');
        const storedLanguage = await getConfig('language');
        const storedVaultId = await getConfig('active_vault_id');
        const storedVaultName = await getConfig('active_vault_name');
        const storedHasUnsynced = await getConfig('has_unsynced_changes');
        const storedBackupEnabled = await getConfig('backup_enabled');
        const storedLastSync = await getConfig('last_synced_at');
        const storedCreationBalance = await getConfig('creation_balance');
        const storedLedgerCreatedAt = await getConfig('ledger_created_at');
        
        if (storedCurrency) setCurrency(storedCurrency);
        if (storedSeparator !== undefined && storedSeparator !== null) setThousandsSeparator(storedSeparator);
        if (storedDateFormat) setDateFormat(storedDateFormat);
        if (storedTimezone) setTimezone(storedTimezone);
        if (storedLanguage) setLanguage(storedLanguage);
        if (storedVaultId) setActiveVaultId(storedVaultId);
        if (storedVaultName) setActiveVaultName(storedVaultName);
        if (storedGoogleUser) setConnectedGoogleUser(storedGoogleUser);
        if (storedCreationBalance) setCreationBalance(storedCreationBalance);
        if (storedLedgerCreatedAt) setLedgerCreatedAt(Number(storedLedgerCreatedAt));
        // Note: syncInterval is a local user preference stored in localStorage,
        // already initialized from useState. We do NOT override it from IndexedDB.
        if (storedHasUnsynced !== undefined) setHasUnsyncedChanges(!!storedHasUnsynced);
        if (storedBackupEnabled !== undefined) setBackupEnabled(storedBackupEnabled !== false);
        if (keepLocal !== undefined) setKeepCloudVaultLocal(keepLocal === true);

        if (storedLastSync) {
          if (typeof storedLastSync === 'number') {
            setLastSyncSuccess(storedLastSync);
          } else if (typeof storedLastSync === 'string') {
            const parsed = Date.parse(storedLastSync);
            if (!isNaN(parsed)) {
              setLastSyncSuccess(parsed);
            }
          }
        }

        if (storedSaltHex && storedChallenge) {
          setSalt(hexToBytes(storedSaltHex));
          setChallengeHash(storedChallenge);
          setIsLocked(true);
        } else {
          setSalt(null);
          setChallengeHash(null);
          setIsLocked(false);
        }
      } catch (err) {
        console.error('Failed to initialize database config:', err);
        setIsLocked(false);
      }
    }
    checkInit();
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);

  const performCloudSync = async (): Promise<boolean> => {
    try {
      const googleUser = await getConfig('google_user');
      const vaultId = await getConfig('active_vault_id');
      const vaultName = await getConfig('active_vault_name');
      const saltHex = await getConfig('encryption_salt');
      const challenge = await getConfig('challenge_hash');
      
      if (!googleUser || !vaultId || !saltHex || !challenge) {
        console.log('Skipping sync: profile is local or missing credentials.');
        return false;
      }

      setIsSyncing(true);
      // Fetch all encrypted transaction records
      const encryptedRows = await getAllEncryptedTransactions();
      
      // Update manifest
      const manifest = await getCloudManifest(googleUser.email);
      const existingVaultIdx = manifest.vaults.findIndex(v => v.id === vaultId);
      
      const updatedVaultInfo = {
        id: vaultId,
        name: vaultName || 'Ledger Vault',
        salt: saltHex,
        challenge: challenge,
        lastSaved: Date.now(),
        config: {
          currency,
          thousands_separator: thousandsSeparator,
          date_format: dateFormat,
          backup_interval: syncInterval,
          backup_enabled: backupEnabled,
          keep_cloud_vault_local: keepCloudVaultLocal,
          timezone,
          language,
          creation_balance: creationBalance,
          ledger_created_at: ledgerCreatedAt
        }
      };

      if (existingVaultIdx >= 0) {
        manifest.vaults[existingVaultIdx] = updatedVaultInfo;
      } else {
        manifest.vaults.push(updatedVaultInfo);
      }

      await saveCloudManifest(googleUser.email, manifest);

      // Prepare encrypted expected budget data if activeKey exists
      let encryptedExpectedBudget = undefined;
      if (activeKey) {
        const storedVersions = await getConfig('expected_budget_versions');
        const storedActiveId = await getConfig('active_expected_budget_version_id');
        if (storedVersions) {
          const payload = JSON.stringify({
            versions: JSON.parse(storedVersions),
            activeVersionId: storedActiveId
          });
          const { cipherText, iv } = await encryptPayload(payload, activeKey);
          encryptedExpectedBudget = {
            payload: cipherText,
            iv
          };
        }
      }

      // Save transactions and expected budget
      const cloudPayload = {
        transactions: encryptedRows.map(row => ({
          id: row.id,
          payload: row.payload,
          iv: row.iv
        })),
        expectedBudget: encryptedExpectedBudget
      };

      await saveCloudVaultData(googleUser.email, vaultId, cloudPayload);

      const now = Date.now();
      await saveConfig('last_synced_at', now);
      setLastSyncSuccess(now);
      await saveConfig('has_unsynced_changes', false);
      setHasUnsyncedChanges(false);
      
      setIsSyncing(false);
      return true;
    } catch (err) {
      console.error('Cloud Sync failed:', err);
      setIsSyncing(false);
      return false;
    }
  };

  // Periodic Auto-Sync Scheduler
  useEffect(() => {
    let intervalId: any;

    function setupAutoSync() {
      if (backupEnabled && connectedGoogleUser && !isCreateLedgerModalOpen) {
        intervalId = setInterval(async () => {
          console.log('[AutoSync] Running periodic backup...');
          await performCloudSync();
        }, syncInterval);
      } else if (isCreateLedgerModalOpen) {
        console.log('[AutoSync] AutoSync suspended because Create Ledger modal is open.');
      }
    }

    setupAutoSync();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [state.view, currency, thousandsSeparator, dateFormat, syncInterval, isCreateLedgerModalOpen, backupEnabled, connectedGoogleUser]);

  const setView = (view: AppView) => {
    setState(prev => ({ ...prev, view }));
  };

  const handleStartWizard = () => setView('wizard');
  const handleWizardCancel = (targetView?: AppView) => setView(targetView || 'landing');

  // Callback when Onboarding Wizard successfully creates a cryptographic key and finishes
  const handleWizardComplete = async (key: CryptoKey, txs: Transaction[]) => {
    setActiveKey(key);
    setIsLocked(false);
    
    // Sort transactions by date descending
    const sortedTxs = [...txs].sort((a, b) => b.booking_date - a.booking_date);
    setTransactions(sortedTxs);

    const storedCurrency = await getConfig('currency');
    const storedSeparator = await getConfig('thousands_separator');
    const storedDateFormat = await getConfig('date_format');
    const storedGoogleUser = await getConfig('google_user');
    const storedVaultName = await getConfig('active_vault_name');
    const storedVaultId = await getConfig('active_vault_id');
    const storedCreationBalance = await getConfig('creation_balance');
    const storedLedgerCreatedAt = await getConfig('ledger_created_at');

    if (storedCurrency) setCurrency(storedCurrency);
    if (storedSeparator !== undefined && storedSeparator !== null) setThousandsSeparator(storedSeparator);
    if (storedDateFormat) setDateFormat(storedDateFormat);
    if (storedGoogleUser) setConnectedGoogleUser(storedGoogleUser);
    if (storedVaultName) setActiveVaultName(storedVaultName);
    if (storedVaultId) setActiveVaultId(storedVaultId);
    if (storedCreationBalance) setCreationBalance(storedCreationBalance);
    if (storedLedgerCreatedAt) setLedgerCreatedAt(Number(storedLedgerCreatedAt));
    // syncInterval is a local user preference (localStorage), not overridden from IndexedDB.
    
    await saveConfig('has_unsynced_changes', false);
    setHasUnsyncedChanges(false);

    setState(prev => ({ 
      ...prev, 
      hasData: sortedTxs.length > 0, 
      view: sortedTxs.length > 0 ? 'dashboard' : 'empty-dashboard' 
    }));
  };

  const toggleManualExpense = () => {
    setState(prev => ({ ...prev, isManualExpenseOpen: !prev.isManualExpenseOpen }));
  };

  const toggleImportModal = () => {
    setState(prev => ({ ...prev, isImportModalOpen: !prev.isImportModalOpen }));
  };

  // Handles adding a new transaction (manual entry)
  const handleAddTransaction = async (tx: Transaction) => {
    if (!activeKey) return;
    try {
      // Encrypt transaction payload using active key
      const payloadString = JSON.stringify(tx);
      const { cipherText, iv } = await encryptPayload(payloadString, activeKey);
      
      // Save encrypted fields to IndexedDB ledger object store
      await saveEncryptedTransaction(tx.id, cipherText, iv);

      // Update React memory state
      setTransactions(prev => [tx, ...prev].sort((a, b) => b.booking_date - a.booking_date));
      
      await saveConfig('has_unsynced_changes', true);
      setHasUnsyncedChanges(true);

      setState(prev => ({ ...prev, hasData: true, view: 'dashboard' }));
    } catch (err) {
      console.error('Failed to encrypt and save manual transaction:', err);
    }
  };

  // Handles importing multiple transactions (from CSV)
  const handleImportTransactions = async (newTxs: Transaction[]) => {
    if (!activeKey) return;
    try {
      for (const tx of newTxs) {
        const payloadString = JSON.stringify(tx);
        const { cipherText, iv } = await encryptPayload(payloadString, activeKey);
        await saveEncryptedTransaction(tx.id, cipherText, iv);
      }
      
      setTransactions(prev => [...newTxs, ...prev].sort((a, b) => b.booking_date - a.booking_date));
      
      if (newTxs.length > 0) {
        await saveConfig('has_unsynced_changes', true);
        setHasUnsyncedChanges(true);
      }

      setState(prev => ({ ...prev, hasData: true, view: 'dashboard' }));
    } catch (err) {
      console.error('Failed to encrypt and save imported transactions:', err);
    }
  };

  // Handles updating an existing transaction (e.g. changing category)
  const handleUpdateTransaction = async (tx: Transaction) => {
    if (!activeKey) return;
    try {
      const payloadString = JSON.stringify(tx);
      const { cipherText, iv } = await encryptPayload(payloadString, activeKey);
      await saveEncryptedTransaction(tx.id, cipherText, iv);
      
      setTransactions(prev => {
        const updated = prev.map(t => t.id === tx.id ? tx : t);
        return updated.sort((a, b) => b.booking_date - a.booking_date);
      });

      await saveConfig('has_unsynced_changes', true);
      setHasUnsyncedChanges(true);
    } catch (err) {
      console.error('Failed to update transaction:', err);
    }
  };



  // Safe data reset escape hatch (Key Recovery Loss)
  const handleWipeVault = async () => {
    if (
      confirm(
        '⚠️ DANGER: Wiping your vault will PERMANENTLY delete all encrypted financial logs stored in this browser.\n\nThis cannot be undone. Do you wish to continue?'
      )
    ) {
      await clearAllLocalData();
      setIsLocked(false);
      setActiveKey(null);
      setTransactions([]);
      setSalt(null);
      setChallengeHash(null);
      setHasUnsyncedChanges(false);
      setState(prev => ({
        ...prev,
        view: 'landing',
        hasData: false,
      }));
    }
  };

  const handleLockSession = () => {
    if (hasUnsyncedChanges) {
      const confirmLock = confirm(
        "⚠️ WARNING: You have unsaved (unsynced) local changes.\n\nLocking your session now may cause you to lose these changes if local caching is disabled, or they won't be saved to the cloud.\n\nAre you sure you want to proceed?"
      );
      if (!confirmLock) return;
    }
    window.location.reload();
  };

  const handleCreateNewLedger = async () => {
    await clearAllLocalData();
    setIsLocked(false);
    setActiveKey(null);
    setTransactions([]);
    setSalt(null);
    setChallengeHash(null);
    setCurrency('$');
    setThousandsSeparator(',');
    setDateFormat('MMM DD, YYYY');
    setActiveVaultName('Local Vault');
    setActiveVaultId(null);
    setConnectedGoogleUser(null);
    setSyncInterval(60000);
    localStorage.setItem('vaultflow_sync_interval', '60000');
    setHasUnsyncedChanges(false);
    setState(prev => ({
      ...prev,
      view: 'wizard',
      wizardStep: 1,
      hasData: false,
    }));
  };

  // Export encrypted transactions and PBKDF2 parameters as local JSON backup
  const handleExportBackup = async () => {
    try {
      const storedSaltHex = await getConfig('encryption_salt');
      const storedChallenge = await getConfig('challenge_hash');
      const encryptedRows = await getAllEncryptedTransactions();
      
      const backupData = {
        vaultflow_backup: true,
        version: '1.0',
        encryption_salt: storedSaltHex,
        challenge_hash: storedChallenge,
        transactions: encryptedRows
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultflow_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export vault backup:', err);
    }
  };

  // Restore encrypted ledger from select file
  const handleRestoreBackup = async (file: File): Promise<boolean> => {
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup.vaultflow_backup || !backup.encryption_salt || !backup.challenge_hash) {
        alert('Invalid VaultFlow backup file. Please select a valid backup.');
        return false;
      }

      // Safe Wipe of any existing local data before restore
      await clearAllLocalData();

      // Restore salt & challenge hash
      await saveConfig('encryption_salt', backup.encryption_salt);
      await saveConfig('challenge_hash', backup.challenge_hash);
      await saveConfig('has_unsynced_changes', true);

      // Restore encrypted transactions
      if (Array.isArray(backup.transactions)) {
        for (const tx of backup.transactions) {
          await saveEncryptedTransaction(tx.id, tx.payload, tx.iv);
        }
      }

      // Update state to load keys
      setSalt(hexToBytes(backup.encryption_salt));
      setChallengeHash(backup.challenge_hash);
      setHasUnsyncedChanges(true);
      setIsLocked(true);
      
      // Route straight to passcode challenge!
      setView('unlock');
      return true;
    } catch (err) {
      console.error('Failed to restore backup:', err);
      alert('Error reading backup file. Please verify it is a valid VaultFlow JSON file.');
    }
  };

  const handleCloudUnlock = async (
    key: CryptoKey,
    txs: Transaction[],
    vaultId: string,
    vaultName: string,
    currencyVal: string,
    separatorVal: string,
    dateFormatVal: string,
    lastSavedVal: number,
    backupIntervalVal?: number,
    backupEnabledVal?: boolean,
    keepLocalVal?: boolean,
    timezoneVal?: string,
    languageVal?: string
  ) => {
    setActiveKey(key);
    setTransactions(txs);
    setCurrency(currencyVal);
    setThousandsSeparator(separatorVal);
    setDateFormat(dateFormatVal);
    const resolvedTimezone = timezoneVal || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const resolvedLanguage = languageVal || 'en';
    setTimezone(resolvedTimezone);
    setLanguage(resolvedLanguage);
    setActiveVaultId(vaultId);
    setActiveVaultName(vaultName);
    setLastSyncSuccess(lastSavedVal);

    // syncInterval is a local user preference (localStorage), not overridden from cloud config.
    const resolvedBackupEnabled = backupEnabledVal !== undefined ? backupEnabledVal : true;
    const resolvedKeepLocal = keepLocalVal !== undefined ? keepLocalVal : false;
    setBackupEnabled(resolvedBackupEnabled);
    setKeepCloudVaultLocal(resolvedKeepLocal);

    const storedSaltHex = await getConfig('encryption_salt');
    const storedChallenge = await getConfig('challenge_hash');
    const storedGoogleUser = await getConfig('google_user');
    const storedCreationBalance = await getConfig('creation_balance');
    const storedLedgerCreatedAt = await getConfig('ledger_created_at');
    if (storedSaltHex) setSalt(hexToBytes(storedSaltHex));
    if (storedChallenge) setChallengeHash(storedChallenge);
    if (storedGoogleUser) setConnectedGoogleUser(storedGoogleUser);
    if (storedCreationBalance) setCreationBalance(storedCreationBalance);
    if (storedLedgerCreatedAt) setLedgerCreatedAt(Number(storedLedgerCreatedAt));

    setIsLocked(false);
    setState(prev => ({
      ...prev,
      hasData: txs.length > 0,
      view: txs.length > 0 ? 'dashboard' : 'empty-dashboard'
    }));
  };

  // Render a loading state on database mount check
  if (isLocked === null) {
    return (
      <div className="min-h-screen bg-surface-dark flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-10 h-10 text-nature-green animate-spin" />
        <span className="font-mono text-xs text-on-surface-variant uppercase tracking-widest">
          Forging vault link...
        </span>
      </div>
    );
  }

  // If locked and trying to access app screens, redirect to unlock view
  if (isLocked && state.view !== 'landing' && state.view !== 'unlock' && state.view !== 'wizard') {
    // Auto-redirect to the unlock view
    setState(prev => ({ ...prev, view: 'unlock' }));
  }

  // Handler for local unlock from UnlockView
  const handleUnlockLocal = async (pwd: string, googleUserToLink?: any): Promise<boolean> => {
    if (!salt || !challengeHash) return false;
    try {
      const hash = await hashPasswordForChallenge(pwd, salt);
      if (hash !== challengeHash) return false;

      const key = await deriveEncryptionKey(pwd, salt);
      setActiveKey(key);

      const encryptedRows = await getAllEncryptedTransactions();
      const decrypted: Transaction[] = [];
      for (const row of encryptedRows) {
        try {
          const plaintext = await decryptPayload(row.payload, row.iv, key);
          decrypted.push(JSON.parse(plaintext));
        } catch (e) {
          console.error('Failed to decrypt row:', e);
        }
      }
      const sortedTxs = decrypted.sort((a, b) => b.booking_date - a.booking_date);
      setTransactions(sortedTxs);

      if (googleUserToLink) {
        await saveConfig('google_user', googleUserToLink);
        setConnectedGoogleUser(googleUserToLink);

        let vaultId = await getConfig('active_vault_id');
        let vaultName = await getConfig('active_vault_name');
        if (!vaultId) {
          vaultId = 'local-default';
          await saveConfig('active_vault_id', vaultId);
        }
        if (!vaultName) {
          vaultName = 'Personal Vault';
          await saveConfig('active_vault_name', vaultName);
        }
        setActiveVaultId(vaultId);
        setActiveVaultName(vaultName);

        // Upload to Google Drive immediately in background
        setTimeout(async () => {
          try {
            await performCloudSync();
          } catch (e) {
            console.error('Failed to auto-sync on local link:', e);
          }
        }, 100);
      }

      setIsLocked(false);
      setState(prev => ({
        ...prev,
        hasData: sortedTxs.length > 0,
        view: sortedTxs.length > 0 ? 'dashboard' : 'empty-dashboard'
      }));
      return true;
    } catch (err) {
      console.error('Unlock failed:', err);
      return false;
    }
  };

  const handleSwitchVault = async (
    vaultId: string,
    vaultName: string,
    vaultSalt: string,
    vaultChallenge: string,
    password: string,
    googleUser: any,
    config: { 
      currency: string; 
      thousands_separator: string; 
      date_format: string;
      backup_interval?: number;
      backup_enabled?: boolean;
      keep_cloud_vault_local?: boolean;
      timezone?: string;
      language?: string;
      creation_balance?: string;
      ledger_created_at?: number;
    },
    lastSaved: number
  ): Promise<boolean> => {
    try {
      // 1. Download cloud vault data
      const cloudData = await getCloudVaultData(googleUser.email, vaultId);

      // 2. Wipe local IndexedDB
      await clearAllLocalData();

      // 3. Derive key and decrypt
      const saltBytes = hexToBytes(vaultSalt);
      const key = await deriveEncryptionKey(password, saltBytes);
      const decryptedTxs: Transaction[] = [];

      for (const t of cloudData.transactions) {
        await saveEncryptedTransaction(t.id, t.payload, t.iv);
        try {
          const plaintext = await decryptPayload(t.payload, t.iv, key);
          decryptedTxs.push(JSON.parse(plaintext));
        } catch (e) {
          console.error('Failed to decrypt transaction row:', e);
        }
      }

      // 3.5. Decrypt and restore expected budget if present in cloud data
      if (cloudData.expectedBudget) {
        try {
          const plaintext = await decryptPayload(
            cloudData.expectedBudget.payload,
            cloudData.expectedBudget.iv,
            key
          );
          const parsed = JSON.parse(plaintext);
          if (parsed && parsed.versions) {
            await saveConfig('expected_budget_versions', JSON.stringify(parsed.versions));
          }
          if (parsed && parsed.activeVersionId) {
            await saveConfig('active_expected_budget_version_id', parsed.activeVersionId);
          }
        } catch (e) {
          console.error('Failed to decrypt expected budget on vault switch:', e);
        }
      }

      // 4. Save new vault configs
      await saveConfig('encryption_salt', vaultSalt);
      await saveConfig('challenge_hash', vaultChallenge);
      await saveConfig('google_user', googleUser);
      await saveConfig('active_vault_id', vaultId);
      await saveConfig('active_vault_name', vaultName);
      await saveConfig('currency', config.currency);
      await saveConfig('thousands_separator', config.thousands_separator);
      await saveConfig('date_format', config.date_format);
      const targetTimezone = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const targetLanguage = config.language || 'en';
      await saveConfig('timezone', targetTimezone);
      await saveConfig('language', targetLanguage);
      await saveConfig('has_unsynced_changes', false);
      await saveConfig('last_synced_at', lastSaved);

      // Restore/set sync configurations
      // syncInterval is a local user preference (localStorage), not overridden from cloud config.
      const backupEnabledVal = config.backup_enabled !== undefined ? config.backup_enabled : true;
      const keepLocalVal = config.keep_cloud_vault_local !== undefined ? config.keep_cloud_vault_local : false;
      const targetCreationBalance = config.creation_balance || '0';
      const targetLedgerCreatedAt = config.ledger_created_at || Date.now();

      await saveConfig('backup_enabled', backupEnabledVal);
      await saveConfig('keep_cloud_vault_local', keepLocalVal);
      await saveConfig('creation_balance', targetCreationBalance);
      await saveConfig('ledger_created_at', targetLedgerCreatedAt);

      // 5. Update root state
      setSalt(saltBytes);
      setChallengeHash(vaultChallenge);
      setActiveKey(key);
      setActiveVaultId(vaultId);
      setActiveVaultName(vaultName);
      setConnectedGoogleUser(googleUser);
      setCurrency(config.currency);
      setThousandsSeparator(config.thousands_separator);
      setDateFormat(config.date_format);
      setTimezone(targetTimezone);
      setLanguage(targetLanguage);
      setBackupEnabled(backupEnabledVal);
      setKeepCloudVaultLocal(keepLocalVal);
      setCreationBalance(targetCreationBalance);
      setLedgerCreatedAt(Number(targetLedgerCreatedAt));
      setHasUnsyncedChanges(false);
      setLastSyncSuccess(lastSaved);

      const sortedTxs = decryptedTxs.sort((a, b) => b.booking_date - a.booking_date);
      setTransactions(sortedTxs);
      setState(prev => ({
        ...prev,
        hasData: sortedTxs.length > 0,
        view: sortedTxs.length > 0 ? 'dashboard' : 'empty-dashboard'
      }));

      return true;
    } catch (err) {
      console.error('Vault switch failed:', err);
      return false;
    }
  };

  const handleUpdateConfig = async (key: string, value: any) => {
    await saveConfig(key, value);
    if (key === 'currency') setCurrency(value);
    if (key === 'thousands_separator') setThousandsSeparator(value);
    if (key === 'date_format') setDateFormat(value);
    if (key === 'backup_interval') {
      setSyncInterval(value);
      localStorage.setItem('vaultflow_sync_interval', String(value));
    }
    if (key === 'google_user') setConnectedGoogleUser(value);
    if (key === 'active_vault_name') setActiveVaultName(value || 'Local Vault');
    if (key === 'active_vault_id') setActiveVaultId(value);
    if (key === 'backup_enabled') setBackupEnabled(value);
    if (key === 'keep_cloud_vault_local') setKeepCloudVaultLocal(value);
    if (key === 'last_synced_at') setLastSyncSuccess(value);
    if (key === 'timezone') setTimezone(value);
    if (key === 'language') setLanguage(value);
    if (key === 'creation_balance') setCreationBalance(value);
    if (key === 'ledger_created_at') setLedgerCreatedAt(Number(value));
  };

  return (
    <div className="selection:bg-nature-green selection:text-surface-dark">
      <AnimatePresence mode="wait">
        {state.view === 'landing' && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingView 
              hasVault={!!salt && !!challengeHash} 
              onStart={handleStartWizard} 
              onUnlock={() => setView('unlock')}
              theme={resolvedTheme}
              onToggleTheme={handleToggleTheme}
            />
          </motion.div>
        )}

        {state.view === 'wizard' && (
          <motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WizardView onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
          </motion.div>
        )}

        {state.view === 'unlock' && (
          <motion.div key="unlock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UnlockView
              hasVault={!!salt && !!challengeHash}
              localVaultId={activeVaultId || undefined}
              onUnlockLocal={handleUnlockLocal}
              onCloudUnlock={handleCloudUnlock}
              onBack={() => setView('landing')}
              onStartWizard={handleStartWizard}
              onRestore={handleRestoreBackup}
              onWipe={handleWipeVault}
              theme={resolvedTheme}
            />
          </motion.div>
        )}

        {state.view === 'empty-dashboard' && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyDashboardView
              onImport={toggleImportModal}
              onManualExpense={toggleManualExpense}
              onSetBudget={() => setView('budget')}
              onConfigureBackup={() => setView('settings')}
              onSettings={() => setView('settings')}
              onExpectedBudget={() => setView('expected-budget')}
              onLock={handleLockSession}
              theme={resolvedTheme}
              onToggleTheme={handleToggleTheme}
              currency={currency}
              isCloudConnected={!!connectedGoogleUser}
              activeVaultName={activeVaultName}
              onUpdateVaultName={(name) => handleUpdateConfig('active_vault_name', name)}
            />
          </motion.div>
        )}

        {state.view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DashboardView 
              transactions={transactions} 
              onAddManual={toggleManualExpense} 
              onImportCSV={toggleImportModal}
              onWipe={handleWipeVault}
              onExport={handleExportBackup}
              theme={resolvedTheme}
              onToggleTheme={handleToggleTheme}
              onSettings={() => setView('settings')}
              onSetBudget={() => setView('budget')}
              onExpectedBudget={() => setView('expected-budget')}
              onLock={handleLockSession}
              onViewCategory={(catId) => setState(prev => ({ ...prev, view: 'category-details', activeCategory: catId }))}
              currency={currency}
              thousandsSeparator={thousandsSeparator}
              dateFormat={dateFormat}
              timezone={timezone}
              isCloudConnected={!!connectedGoogleUser}
              activeVaultName={activeVaultName}
              onUpdateVaultName={(name) => handleUpdateConfig('active_vault_name', name)}
              currentLedgerBalance={Math.round(parseFloat(creationBalance || '0') * 100)}
              ledgerCreatedAt={ledgerCreatedAt}
            />
          </motion.div>
        )}

        {state.view === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SettingsView 
              onBack={() => setView(transactions.length > 0 ? 'dashboard' : 'empty-dashboard')}
              onWipe={handleWipeVault}
              onExport={handleExportBackup}
              theme={resolvedTheme}
              themeSetting={themeSetting}
              onToggleTheme={handleToggleTheme}
              onChangeThemeSetting={setThemeSetting}
              currency={currency}
              thousandsSeparator={thousandsSeparator}
              dateFormat={dateFormat}
              timezone={timezone}
              language={language}
              onUpdateConfig={handleUpdateConfig}
              onTriggerManualSync={performCloudSync}
              isSyncing={isSyncing}
              activeVaultId={activeVaultId || undefined}
              onSwitchVault={handleSwitchVault}
              onCreateNewLedger={handleCreateNewLedger}
              hasLocalData={transactions.length > 0}
              hasUnsyncedChanges={hasUnsyncedChanges}
              onCreateModalToggle={setIsCreateLedgerModalOpen}
              syncInterval={syncInterval}
              backupEnabled={backupEnabled}
              lastSyncSuccess={lastSyncSuccess}
              keepCloudVaultLocal={keepCloudVaultLocal}
              connectedGoogleUser={connectedGoogleUser}
              activeVaultName={activeVaultName}
            />
          </motion.div>
        )}

        {state.view === 'budget' && (
          <motion.div key="budget" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BudgetView 
              onBack={() => setView(transactions.length > 0 ? 'dashboard' : 'empty-dashboard')}
              onSaved={() => setView(transactions.length > 0 ? 'dashboard' : 'empty-dashboard')}
              currency={currency}
              thousandsSeparator={thousandsSeparator}
            />
          </motion.div>
        )}

        {state.view === 'expected-budget' && (
          <motion.div key="expected-budget" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ExpectedBudgetView 
              onBack={() => setView(transactions.length > 0 ? 'dashboard' : 'empty-dashboard')}
              onSync={performCloudSync}
              currency={currency}
              thousandsSeparator={thousandsSeparator}
            />
          </motion.div>
        )}

        {state.view === 'category-details' && state.activeCategory && (
          <motion.div key="category-details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CategoryDetailsView 
              categoryId={state.activeCategory}
              transactions={transactions}
              onBack={() => setView('dashboard')}
              onUpdateTransaction={handleUpdateTransaction}
              currency={currency}
              thousandsSeparator={thousandsSeparator}
              dateFormat={dateFormat}
              timezone={timezone}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ManualExpenseModal
        isOpen={state.isManualExpenseOpen}
        onClose={toggleManualExpense}
        onSave={handleAddTransaction}
        currency={currency}
        timezone={timezone}
      />

      <ImportModal
        isOpen={state.isImportModalOpen}
        onClose={toggleImportModal}
        onImport={handleImportTransactions}
        currency={currency}
        transactions={transactions}
        timezone={timezone}
      />
    </div>
  );
}
