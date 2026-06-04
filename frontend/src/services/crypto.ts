import { api } from './api'

const DB_NAME = 'connect_on_e2ee'
const STORE_NAME = 'keys'

// Helper to open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

// Get key from IndexedDB
function getStoredKey(keyName: string): Promise<CryptoKey | null> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(keyName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  })
}

// Store key in IndexedDB
function storeKey(keyName: string, key: CryptoKey): Promise<void> {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(key, keyName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  })
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

// Convert Base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// Initialize E2EE for current user
export async function initE2EE(username: string): Promise<{ publicKeyBase64: string }> {
  try {
    // We scope keys per-username so multiple accounts on the same browser don't overlap keys
    const pubKeyName = `public_key_${username}`
    const privKeyName = `private_key_${username}`

    let myPublicKey = await getStoredKey(pubKeyName)
    let myPrivateKey = await getStoredKey(privKeyName)

    if (!myPublicKey || !myPrivateKey) {
      console.log('Generating new X25519 key pair for E2EE...')
      
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'X25519' },
        true, // extractable (necessary to save/export)
        ['deriveKey', 'deriveBits']
      )

      myPublicKey = keyPair.publicKey
      myPrivateKey = keyPair.privateKey

      await storeKey(pubKeyName, myPublicKey)
      await storeKey(privKeyName, myPrivateKey)
    }

    // Export public key to base64
    const exportedPub = await window.crypto.subtle.exportKey('spki', myPublicKey)
    const publicKeyBase64 = arrayBufferToBase64(exportedPub)

    // Publish/update public key on backend
    await api.put('/users/me', { public_key: publicKeyBase64 })
    console.log('E2EE initialized and public key synced.')
    
    return { publicKeyBase64 }
  } catch (err) {
    console.error('Failed to initialize E2EE:', err)
    throw err
  }
}

// Get my private key from IndexedDB
async function getMyPrivateKey(username: string): Promise<CryptoKey> {
  const privKeyName = `private_key_${username}`
  const key = await getStoredKey(privKeyName)
  if (!key) {
    throw new Error('E2EE Private key not found. Run initE2EE first.')
  }
  return key
}

// Encrypt a message using recipient's public key
export async function encryptMessage(
  plaintext: string,
  recipientPubKeyBase64: string,
  myUsername: string
): Promise<{ ciphertext: string; nonce: string }> {
  try {
    const myPrivateKey = await getMyPrivateKey(myUsername)
    
    // Import recipient's public key
    const recipientPubBytes = base64ToUint8Array(recipientPubKeyBase64)
    const recipientPublicKey = await window.crypto.subtle.importKey(
      'spki',
      recipientPubBytes as any,
      { name: 'X25519' },
      true,
      []
    )

    // Derive shared symmetric key (AES-GCM 256 bits)
    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'X25519',
        public: recipientPublicKey
      },
      myPrivateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false, // not extractable
      ['encrypt', 'decrypt']
    )

    // Generate random 12-byte IV (nonce)
    const iv = window.crypto.getRandomValues(new Uint8Array(12))
    const encoder = new TextEncoder()
    const encodedPlaintext = encoder.encode(plaintext)

    // Encrypt
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      derivedKey,
      encodedPlaintext
    )

    const ciphertext = arrayBufferToBase64(ciphertextBuffer)
    const nonce = arrayBufferToBase64(iv.buffer as ArrayBuffer)

    return { ciphertext, nonce }
  } catch (err) {
    console.error('Encryption failed:', err)
    throw err
  }
}

// Decrypt a message using sender's public key
export async function decryptMessage(
  ciphertextBase64: string,
  nonceBase64: string,
  senderPubKeyBase64: string,
  myUsername: string
): Promise<string> {
  try {
    const myPrivateKey = await getMyPrivateKey(myUsername)

    // Import sender's public key
    const senderPubBytes = base64ToUint8Array(senderPubKeyBase64)
    const senderPublicKey = await window.crypto.subtle.importKey(
      'spki',
      senderPubBytes as any,
      { name: 'X25519' },
      true,
      []
    )

    // Derive shared symmetric key
    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'X25519',
        public: senderPublicKey
      },
      myPrivateKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    )

    const iv = base64ToUint8Array(nonceBase64)
    const ciphertext = base64ToUint8Array(ciphertextBase64)

    // Decrypt
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as any
      },
      derivedKey,
      ciphertext as any
    )

    const decoder = new TextDecoder()
    return decoder.decode(decryptedBuffer)
  } catch (err) {
    console.error('Decryption failed:', err)
    return '🔒 [Decryption failed: device key mismatch or corrupted cipher]'
  }
}
