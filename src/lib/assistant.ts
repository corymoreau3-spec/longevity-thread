import { supabase } from './supabase'

/**
 * The assistant runs on the web app's /api/chat route, not on the phone.
 *
 * That route holds the safety rules — never diagnose, never give drug or
 * supplement dosing, route clinical judgement to a Thrivewell clinician —
 * along with the lab grounding, the conversation history, and a second pass
 * that rewrites answers drifting into "research voice". Reimplementing any
 * of that here would create a second set of rules to keep in step with the
 * first, and they would drift.
 *
 * So the phone sends a message and renders the reply. Nothing about what the
 * assistant may say is decided on the device.
 */
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://app.thrivewellmj.com'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

/** History is read straight from Supabase; RLS scopes it to this patient. */
export async function fetchChatHistory(): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('patient_chat_history')
    .select('id, role, content, created_at')
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

export type SendResult =
  | { ok: true; reply: string }
  | { ok: false; error: string }

export async function sendMessage(message: string): Promise<SendResult> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token

  if (!token) return { ok: false, error: 'Not signed in' }

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The route accepts a bearer token as well as a cookie session,
        // which is what lets the phone reuse it.
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    })

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      return { ok: false, error: body?.error ?? `Request failed (${res.status})` }
    }

    return { ok: true, reply: body?.reply ?? body?.message ?? '' }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}
