import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { fetchAlerts, type Alert } from '@/lib/health-data'
import { supabase } from '@/lib/supabase'
import { theme } from '@/theme'

/**
 * The patient's view of what their care team has flagged.
 *
 * It shows no numbers, no thresholds and no clinical wording. A patient
 * reading "HRV reduced 22% below baseline" has been handed an
 * interpretation this app is not qualified to give, at a moment when
 * nobody is available to discuss it. What they get is that something was
 * noticed and a person is looking at it.
 */
export default function Updates() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const rows = await fetchAlerts()
      setAlerts(rows)

      // Marking these seen tells the clinician the patient has read it, so
      // someone waiting to hear back is visible rather than assumed.
      const unseen = rows.filter((a) => !a.patient_seen_at).map((a) => a.id)
      if (unseen.length) {
        await supabase.functions
          .invoke('mark-alerts-seen', { body: { ids: unseen } })
          .catch(() => {})
      }
    } catch (err: any) {
      setError(String(err?.message ?? err))
    }
    setBusy(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), paddingBottom: theme.space(10) }}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}
      >
        <Text style={{ fontSize: theme.font.display, color: theme.color.text }}>Updates</Text>
        <Text
          style={{
            fontSize: theme.font.small,
            color: theme.color.textMuted,
            marginTop: theme.space(2),
            lineHeight: 20,
          }}
        >
          When something in your health data changes, your care team is notified
          and reviews it. You will see it here too.
        </Text>

        {error ? (
          <Text style={{ color: theme.color.attention, marginTop: theme.space(4) }}>{error}</Text>
        ) : null}

        {busy && alerts.length === 0 ? (
          <ActivityIndicator style={{ marginTop: theme.space(10) }} />
        ) : alerts.length === 0 ? (
          <View
            style={{
              marginTop: theme.space(6),
              padding: theme.space(5),
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.surface,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            <Text style={{ fontSize: theme.font.body, color: theme.color.textMuted, lineHeight: 22 }}>
              Nothing to review right now. Anything your care team flags will
              appear here.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: theme.space(5), gap: theme.space(3) }}>
            {alerts.map((a) => (
              <View
                key={a.id}
                style={{
                  padding: theme.space(4),
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.color.surface,
                  borderWidth: 1,
                  borderColor: theme.color.border,
                }}
              >
                <Text style={{ fontSize: theme.font.body, color: theme.color.text, lineHeight: 22 }}>
                  {a.patient_message}
                </Text>
                <Text
                  style={{ fontSize: theme.font.tiny, color: theme.color.textFaint, marginTop: theme.space(2) }}
                >
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.status === 'acknowledged' ? ' · Reviewed by your care team' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/*
          Stated plainly and permanently, not buried in a first-run screen.
          Someone feeling unwell must not wait for an app to tell them.
        */}
        <Text
          style={{
            fontSize: theme.font.tiny,
            color: theme.color.textFaint,
            marginTop: theme.space(8),
            lineHeight: 17,
          }}
        >
          This is not emergency monitoring. Health data can take a day to
          reach your care team. If you feel unwell, contact the clinic or
          seek medical care directly.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}
