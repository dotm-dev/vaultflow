/**
 * VaultFlow Local-First Cryptographic Vault Services
 * Uses standard browser-native Web Cryptography API.
 */

// Encodes text to bytes
const encoder = new TextEncoder();
// Decodes bytes back to text
const decoder = new TextDecoder();

/**
 * Generates a cryptographically secure random salt of the specified length.
 */
export function generateSalt(length = 16): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Converts a Uint8Array into a Hexadecimal string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a Hexadecimal string back into a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Derives a secure 256-bit AES-GCM key from the master password and a salt using PBKDF2.
 */
export async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordBytes = encoder.encode(password);
  
  // Import the password as key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the actual AES-GCM key
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string using an AES-GCM key.
 * Returns the base64-encoded ciphertext and hex-encoded IV.
 */
export async function encryptPayload(
  plaintext: string,
  key: CryptoKey
): Promise<{ cipherText: string; iv: string }> {
  // Generate random Initialization Vector (12 bytes is optimal for AES-GCM)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = encoder.encode(plaintext);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    plaintextBytes
  );

  // Convert cipher ArrayBuffer to Base64 string
  const cipherBytes = new Uint8Array(cipherBuffer);
  let binary = '';
  for (let i = 0; i < cipherBytes.byteLength; i++) {
    binary += String.fromCharCode(cipherBytes[i]);
  }
  const cipherText = window.btoa(binary);
  const ivHex = bytesToHex(iv);

  return { cipherText, iv: ivHex };
}

/**
 * Decrypts a base64-encoded AES-GCM ciphertext using the key and hex-encoded IV.
 */
export async function decryptPayload(
  cipherText: string,
  ivHex: string,
  key: CryptoKey
): Promise<string> {
  const iv = hexToBytes(ivHex);

  // Convert Base64 string back to bytes
  const binary = window.atob(cipherText);
  const cipherBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    cipherBytes[i] = binary.charCodeAt(i);
  }

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    key,
    cipherBytes
  );

  return decoder.decode(decryptedBuffer);
}

/**
 * Hashes a master password with a salt using SHA-256 for local verification challenge.
 * Returns a hexadecimal representation of the hash.
 */
export async function hashPasswordForChallenge(password: string, salt: Uint8Array): Promise<string> {
  const passwordBytes = encoder.encode(password);
  
  // Combine password bytes with salt bytes
  const combined = new Uint8Array(passwordBytes.length + salt.length);
  combined.set(passwordBytes);
  combined.set(salt, passwordBytes.length);

  const hashBuffer = await window.crypto.subtle.digest('SHA-256', combined);
  return bytesToHex(new Uint8Array(hashBuffer));
}
