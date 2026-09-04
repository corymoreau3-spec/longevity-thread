import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  fetchChatHistory,
  sendMessage,
  type ChatMessage,
} from '@/lib/assistant'
import { ScreenHeader } from '@/components/ScreenHeader'
import { theme } from '@/theme'

/**
 * Suggested openers. Deliberately about understanding rather than deciding —
 * "what does this mean" rather than "what should I take". The assistant
 * refuses dosing and prescribing anyway, and prompting for it would only
 * teach patients to ask questions that get declined.
 */
const STARTERS = [
  'What does my most recent panel show?',
  'Why does resting heart rate matter?',
  'What questions should I bring to my next visit?',
]

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        backgroundColor: mine ? theme.color.accentSoft : theme.color.surface,
        borderWidth: mine ? 0 : 1,
        borderColor: theme.color.border,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(3),
        marginBottom: theme.space(3),
      }}
    >
      <Text
        style={{
          fontSize: theme.font.body,
          lineHeight: 22,
          color: mine ? theme.color.accent : theme.color.text,
        }}
      >
        {message.content}
      </Text>
    </View>
  )
}

export default function Ask() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<ScrollView>(null)

  const load = useCallback(async () => {
    try {
      setMessages(await fetchChatHistory())
    } catch (err: any) {
      setError(String(err?.message ?? err))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return

      setInput('')
      setError(null)
      setSending(true)

      // Shown immediately rather than after the round trip. The reply can
      // take several seconds, and a message that vanishes on send reads as
      // a failure.
      const optimistic: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        content: trimmed,
      }
      setMessages((m) => [...m, optimistic])

      const result = await sendMessage(trimmed)

      if (result.ok) {
        setMessages((m) => [
          ...m,
          { id: `reply-${Date.now()}`, role: 'assistant', content: result.reply },
        ])
      } else {
        setError(result.error)
        // The message was saved server-side before the failure, so reloading
        // shows the true state rather than leaving a phantom bubble.
        void load()
      }

      setSending(false)
    },
    [sending, load],
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={{ paddingBottom: theme.space(4) }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        >
          <ScreenHeader title="Ask" />
          <View style={{ paddingHorizontal: theme.space(5), marginTop: -theme.space(4) }}>
          <Text
            style={{
              fontSize: theme.font.small,
              color: theme.color.textMuted,
              marginTop: theme.space(2),
              marginBottom: theme.space(5),
              lineHeight: 20,
            }}
          >
            Questions about your results and your health. It knows your most
            recent labs. It will not diagnose or recommend doses — those are
            conversations for your care team.
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: theme.space(8) }} />
          ) : messages.length === 0 ? (
            <View style={{ gap: theme.space(2) }}>
              {STARTERS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={({ pressed }) => ({
                    padding: theme.space(4),
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.color.surface,
                    borderWidth: 1,
                    borderColor: theme.color.border,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontSize: theme.font.body, color: theme.color.text }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} />)
          )}

          {sending ? (
            <View style={{ alignSelf: 'flex-start', paddingVertical: theme.space(2) }}>
              <ActivityIndicator />
            </View>
          ) : null}

          {error ? (
            <Text style={{ color: theme.color.attention, fontSize: theme.font.small, marginTop: theme.space(2) }}>
              {error}
            </Text>
          ) : null}
          </View>
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: theme.space(2),
            padding: theme.space(3),
            borderTopWidth: 1,
            borderTopColor: theme.color.border,
            backgroundColor: theme.color.surface,
          }}
        >
          <TextInput
            style={{
              flex: 1,
              fontSize: theme.font.body,
              color: theme.color.text,
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(3),
              backgroundColor: theme.color.bg,
              borderRadius: theme.radius.md,
              maxHeight: 120,
            }}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question"
            placeholderTextColor={theme.color.textFaint}
            multiline
            editable={!sending}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={({ pressed }) => ({
              paddingHorizontal: theme.space(5),
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.accent,
              opacity: sending || !input.trim() ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontSize: theme.font.body }}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}
