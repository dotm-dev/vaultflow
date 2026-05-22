import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define the DB Schema type
interface VaultFlowDB extends DBSchema {
  config: {
    key: string;
    value: any;
  };
  ledger: {
    key: string;
    value: {
      id: string;
      payload: string; // Base64 AES-GCM encrypted transaction data
      iv: string;      // Initialization vector hex string
    };
  };
}

const DB_NAME = 'vaultflow_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VaultFlowDB>> | null = null;

/**
 * Initializes and returns the promise of the IndexedDB database.
 */
function getDB(): Promise<IDBPDatabase<VaultFlowDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VaultFlowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // config object store for encryption settings, passwords, consents
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
        // ledger object store for encrypted transaction cards
        if (!db.objectStoreNames.contains('ledger')) {
          db.createObjectStore('ledger', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Saves a configuration key-value pair to IndexedDB.
 */
export async function saveConfig(key: string, value: any): Promise<void> {
  const db = await getDB();
  await db.put('config', value, key);
}

/**
 * Retrieves a configuration value from IndexedDB by its key.
 */
export async function getConfig(key: string): Promise<any> {
  const db = await getDB();
  return db.get('config', key);
}

/**
 * Saves an encrypted transaction record to the ledger.
 */
export async function saveEncryptedTransaction(id: string, payload: string, iv: string): Promise<void> {
  const db = await getDB();
  await db.put('ledger', { id, payload, iv });
}

/**
 * Deletes an encrypted transaction record by ID from the ledger.
 */
export async function deleteEncryptedTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ledger', id);
}

/**
 * Retrieves all encrypted transaction records from the ledger.
 */
export async function getAllEncryptedTransactions(): Promise<{ id: string; payload: string; iv: string }[]> {
  const db = await getDB();
  return db.getAll('ledger');
}

/**
 * Deletes the database entirely (used for wiping all local vaults).
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await getDB();
  const txConfig = db.transaction('config', 'readwrite');
  await txConfig.objectStore('config').clear();
  
  const txLedger = db.transaction('ledger', 'readwrite');
  await txLedger.objectStore('ledger').clear();
}

/**
 * Clears only the local vault cryptographic keys and transaction ledger records,
 * while preserving connection credentials (like google_user) and user preferences.
 */
export async function clearLocalVaultCache(): Promise<void> {
  const db = await getDB();
  
  // 1. Clear all records in the ledger object store
  const txLedger = db.transaction('ledger', 'readwrite');
  await txLedger.objectStore('ledger').clear();
  
  // 2. Clear only specific configuration keys related to the cryptographic vault
  const txConfig = db.transaction('config', 'readwrite');
  const store = txConfig.objectStore('config');
  await store.delete('encryption_salt');
  await store.delete('challenge_hash');
  await store.delete('last_synced_at'); // clear sync timestamp since local data is gone
  // We explicitly DO NOT delete 'google_user', 'keep_cloud_vault_local', regional settings, or active_vault_id/name.
}
