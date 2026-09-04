import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'

import { MetricCard } from '@/components/MetricCard'
import { startObservers } from '@/health/observers'
import { syncAll } from '@/health/sync'
import { fetchAlerts, fetchDaily, toSeries, type Series } from '@/lib/health-data'
import { theme } from '@/theme'

const METRICS = ['hrv_sdnn', 'resting_heart_rate', 'sleep_duration', 'steps', 'vo2_max']

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Today() {
  const [series, setSeries] = useState<Series[]>([])
  const [unreadAlerts, setUnread] = useState(0)
  const [busy, setBusy] = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [daily, alerts] = await Promise.all([fetchDaily(90), fetchAlerts()])
    setSeries(METRICS.map((m) => toSeries(daily, m)))
    setUnread(alerts.filter((a) => !a.patient_seen_at).length)
    setFirstLoad(false)
  }, [])

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    // Stored data is shown before syncing, so the screen is never empty
    // while a long sync runs.
    try {
      await load()
    } catch (err: any) {
      setError(String(err?.message ?? err))
    }
    try {
      await syncAll()
      await load()
    } catch (err: any) {
      setError(String(err?.message ?? err))
    }
    setBusy(false)
  }, [load])

  useEffect(() => {
    void refresh()
    startObservers().catch(() => {})
  }, [refresh])

  const withData = series.filter((s) => s.points.length > 0)
  const withoutData = series.filter((s) => s.points.length === 0)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), paddingBottom: theme.space(10) }}
        refreshControl={<RefreshControl refreshing={busy && !firstLoad} onRefresh={refresh} />}
      >
        <Text style={{ fontSize: theme.font.small, color: theme.color.textMuted }}>
          {greeting()}
        </Text>
        <Text style={{ fontSize: theme.font.display, color: theme.color.text, marginTop: 2 }}>
          Your day
        </Text>

        {unreadAlerts > 0 ? (
          <Link href="/updates" asChild>
            <View
              style={{
                marginTop: theme.space(4),
                padding: theme.space(4),
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.attentionSoft,
                borderWidth: 1,
                borderColor: theme.color.attention + '33',
              }}
            >
              <Text style={{ color: theme.color.attention, fontSize: theme.font.body }}>
                {unreadAlerts === 1
                  ? 'Your care team has an update for you'
                  : `Your care team has ${unreadAlerts} updates for you`}
              </Text>
            </View>
          </Link>
        ) : null}

        {error ? (
          <Text style={{ color: theme.color.attention, marginTop: theme.space(4), fontSize: theme.font.small }}>
            {error}
          </Text>
        ) : null}

        {firstLoad ? (
          <ActivityIndicator style={{ marginTop: theme.space(10) }} />
        ) : (
          <>
            <View
              style={{
                marginTop: theme.space(5),
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: theme.space(3),
              }}
            >
              {withData.map((s) => (
                <View key={s.metric} style={{ width: '48%', minWidth: 150, flexGrow: 1 }}>
                  <MetricCard series={s} />
                </View>
              ))}
            </View>

            {/*
              Metrics with no data are named rather than hidden. A patient
              who sees four tiles cannot tell whether the fifth is missing
              or was never offered — and for cardio fitness the reason is
              actionable.
            */}
            {withoutData.length > 0 ? (
              <View style={{ marginTop: theme.space(6) }}>
                <Text style={{ fontSize: theme.font.small, color: theme.color.textMuted }}>
                  Not recorded yet
                </Text>
                {withoutData.map((s) => (
                  <Text
                    key={s.metric}
                    style={{ fontSize: theme.font.small, color: theme.color.textFaint, marginTop: 6 }}
                  >
                    {s.metric === 'vo2_max'
                      ? 'Cardio fitness — your Watch estimates this during outdoor walks, runs and hikes of about 20 minutes.'
                      : 'No readings yet.'}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
