import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  )
}

/**
 * The session is held in the keychain rather than AsyncStorage: it is the
 * credential that unlocks this patient's health record.
 *
 * SecureStore rejects values much over 2 KB and a Supabase session runs
 * larger than that once both tokens are in it, so values are split across
 * numbered chunks and reassembled on read. `<key>.count` records how many
 * chunks a key currently occupies so stale ones can be cleared on rewrite.
 */
const CHUNK_SIZE = 1800

const chunkKey = (key: string, i: number) => `${key}.${i}`

async function clearChunks(key: string) {
  const raw = await SecureStore.getItemAsync(`${key}.count`)
  const count = raw ? Number(raw) : 0
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i))
  }
  await SecureStore.deleteItemAsync(`${key}.count`)
}

const secureStorage: SupportedStorage = {
  async getItem(key) {
    const raw = await SecureStore.getItemAsync(`${key}.count`)
    if (!raw) return null

    const count = Number(raw)
    let value = ''
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i))
      // A missing chunk means the write was interrupted. Treat the whole
      // value as absent rather than handing back a truncated session.
      if (part === null) return null
      value += part
    }
    return value
  },

  async setItem(key, value) {
    await clearChunks(key)

    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? ['']
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i])
    }
    await SecureStore.setItemAsync(`${key}.count`, String(chunks.length))
  },

  async removeItem(key) {
    await clearChunks(key)
  },
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse in a native app; leaving this on makes auth hang.
    detectSessionInUrl: false,
  },
})

/**
 * Guarantees a usable access token before a request that cannot tolerate a
 * stale one.
 *
 * supabase-js refreshes lazily and only while it thinks the app is running,
 * so a cold start can fire a request carrying a token that expired while the
 * app was closed. That is what produced the 401s from ingest-observations on
 * launch: the session existed, so the root layout routed straight to the
 * tabs, and the first sync went out with a dead token.
 *
 * Returns false when there is no session at all — the caller should do
 * nothing and let the root layout route to sign-in.
 */
const EXPIRY_SKEW_SECONDS = 60

export async function ensureFreshSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return false

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = session.expires_at ?? 0

  // Still comfortably valid.
  if (expiresAt - now > EXPIRY_SKEW_SECONDS) return true

  const { data: refreshed, error } = await supabase.auth.refreshSession()
  if (error) return false
  return refreshed.session != null
}

// supabase-js only knows to refresh while it believes the app is running.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
