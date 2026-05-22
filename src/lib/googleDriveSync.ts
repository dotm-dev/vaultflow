/**
 * Google Drive Sync Module
 * 
 * Provides real Google Identity Services (GIS) OAuth authentication
 * and Google Drive REST API integration for cloud vault storage.
 * 
 * Client ID is read from VITE_GOOGLE_CLIENT_ID environment variable.
 * Access tokens are stored in sessionStorage to survive page refreshes.
 */

export interface VaultProfile {
  id: string;
  name: string;
  salt: string;        // Hex encryption salt
  challenge: string;   // Hex hash challenge for password verification
  lastSaved: number;   // Timestamp
  config: {
    currency: string;
    thousands_separator: string;
    date_format: string;
    backup_interval?: number;
    backup_enabled?: boolean;
    keep_cloud_vault_local?: boolean;
    timezone?: string;
    language?: string;
  };
}

export interface VaultManifest {
  vaults: VaultProfile[];
}

export interface EncryptedVaultData {
  transactions: {
    id: string;
    payload: string;
    iv: string;
  }[];
}

export interface GoogleUser {
  email: string;
  name: string;
  avatar: string;
}

// ─── Token Management ───────────────────────────────────────────────────────

const TOKEN_KEY = 'vaultflow_google_access_token';

function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isGoogleConnected(): boolean {
  return !!getAccessToken();
}

// ─── Google Identity Services (GIS) Loader ──────────────────────────────────

let gsiScriptLoaded = false;

function loadGSIScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gsiScriptLoaded || (window as any).google?.accounts?.oauth2) {
      gsiScriptLoaded = true;
      resolve();
      return;
    }

    // Check if script tag already exists
    if (document.getElementById('google-gsi-client')) {
      const check = setInterval(() => {
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(check);
          gsiScriptLoaded = true;
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('Timeout waiting for Google Identity Services to load.'));
      }, 15000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const check = setInterval(() => {
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(check);
          gsiScriptLoaded = true;
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('Google Identity Services script loaded but API not available.'));
      }, 10000);
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
}

// ─── OAuth Sign-In ──────────────────────────────────────────────────────────

/**
 * Triggers Google OAuth sign-in using Google Identity Services.
 * Returns the authenticated user's profile information.
 */
export async function signInWithGoogle(): Promise<GoogleUser> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId || clientId.trim().length === 0) {
    throw new Error('Google Client ID is not configured. Set VITE_GOOGLE_CLIENT_ID in your .env.local file.');
  }

  await loadGSIScript();

  return new Promise((resolve, reject) => {
    try {
      const google = (window as any).google;
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: [
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/drive.file',
        ].join(' '),
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            reject(new Error(tokenResponse.error_description || tokenResponse.error));
            return;
          }

          const accessToken = tokenResponse.access_token;
          setAccessToken(accessToken);

          // Fetch user profile from Google
          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) {
              throw new Error(`Profile fetch failed: ${res.status}`);
            }
            const profile = await res.json();
            resolve({
              email: profile.email,
              name: profile.name || profile.email,
              avatar: profile.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.email)}`,
            });
          } catch (e) {
            reject(new Error('Failed to retrieve user profile from Google.'));
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google OAuth flow was cancelled or failed.'));
        },
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(new Error(err?.message || 'Failed to initialize Google OAuth client.'));
    }
  });
}

/**
 * Sign out: clears the access token from session storage.
 */
export function signOutGoogle(): void {
  const token = getAccessToken();
  if (token) {
    // Revoke token at Google
    fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
  }
  clearAccessToken();
}

// ─── Google Drive REST API Helpers ──────────────────────────────────────────

async function driveHeaders(): Promise<HeadersInit> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('UNAUTHORIZED: No active Google session. Please sign in again.');
  }
  return { Authorization: `Bearer ${token}` };
}

/**
 * Search for a file by exact name in Google Drive.
 * Returns the file ID if found, null otherwise.
 */
async function searchDriveFile(name: string): Promise<string | null> {
  const headers = await driveHeaders();
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    { headers }
  );
  if (res.status === 401) {
    clearAccessToken();
    throw new Error('UNAUTHORIZED: Google session expired. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error(`Google Drive search failed (${res.status})`);
  }
  const data = await res.json();
  return data.files?.length > 0 ? data.files[0].id : null;
}

/**
 * Download a file's content from Google Drive as JSON.
 */
async function downloadDriveFile<T>(fileId: string): Promise<T> {
  const headers = await driveHeaders();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers }
  );
  if (res.status === 401) {
    clearAccessToken();
    throw new Error('UNAUTHORIZED: Google session expired. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error(`Google Drive download failed (${res.status})`);
  }
  return res.json();
}

/**
 * Create a new JSON file in Google Drive.
 * Returns the new file's ID.
 */
async function createDriveFile(name: string, content: any): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('UNAUTHORIZED');

  const metadata = { name, mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  if (res.status === 401) {
    clearAccessToken();
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    throw new Error(`Google Drive file creation failed (${res.status})`);
  }
  const data = await res.json();
  return data.id;
}

/**
 * Update an existing file's content in Google Drive.
 */
async function updateDriveFile(fileId: string, content: any): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('UNAUTHORIZED');

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content),
    }
  );
  if (res.status === 401) {
    clearAccessToken();
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    throw new Error(`Google Drive file update failed (${res.status})`);
  }
}

// ─── High-Level Vault Operations ────────────────────────────────────────────

const MANIFEST_FILENAME = 'vaultflow_manifest.json';

function vaultFilename(vaultId: string): string {
  return `vaultflow_vault_${vaultId}.json`;
}

/**
 * Gets the vault manifest from Google Drive.
 * Creates an empty one if it doesn't exist yet.
 */
export async function getCloudManifest(email: string): Promise<VaultManifest> {
  // email parameter kept for API compatibility; file is per-account via OAuth token
  void email;
  const fileId = await searchDriveFile(MANIFEST_FILENAME);
  if (!fileId) {
    return { vaults: [] };
  }
  try {
    return await downloadDriveFile<VaultManifest>(fileId);
  } catch {
    return { vaults: [] };
  }
}

/**
 * Saves the vault manifest to Google Drive.
 * Creates the file if it doesn't exist, updates it otherwise.
 */
export async function saveCloudManifest(email: string, manifest: VaultManifest): Promise<void> {
  void email;
  const fileId = await searchDriveFile(MANIFEST_FILENAME);
  if (fileId) {
    await updateDriveFile(fileId, manifest);
  } else {
    await createDriveFile(MANIFEST_FILENAME, manifest);
  }
}

/**
 * Retrieves the encrypted vault transaction data from Google Drive.
 */
export async function getCloudVaultData(email: string, vaultId: string): Promise<EncryptedVaultData> {
  void email;
  const filename = vaultFilename(vaultId);
  const fileId = await searchDriveFile(filename);
  if (!fileId) {
    return { transactions: [] };
  }
  try {
    return await downloadDriveFile<EncryptedVaultData>(fileId);
  } catch {
    return { transactions: [] };
  }
}

/**
 * Writes the encrypted vault transaction data to Google Drive.
 */
export async function saveCloudVaultData(email: string, vaultId: string, data: EncryptedVaultData): Promise<void> {
  void email;
  const filename = vaultFilename(vaultId);
  const fileId = await searchDriveFile(filename);
  if (fileId) {
    await updateDriveFile(fileId, data);
  } else {
    await createDriveFile(filename, data);
  }
}
