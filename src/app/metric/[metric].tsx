import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useLocalSearchParams } from 'expo-router'

import { Chart } from '@/components/Chart'
import { fetchDaily, toSeries, type Series } from '@/lib/health-data'
import {
  METRIC_HIGHER_IS_BETTER,
  METRIC_LABEL,
  METRIC_TINT,
  formatValue,
  theme,
  unitLabel,
} from '@/theme'

/** Plain-language notes. A number without context invites guessing. */
const METRIC_NOTE: Record<string, string> = {
  hrv_sdnn:
    'Heart rate variability reflects how much your heart rate varies between beats. It tends to fall with poor sleep, illness, alcohol and stress, and varies a great deal between people — your own trend matters far more than the number itself.',
  resting_heart_rate:
    'Your resting heart rate is measured while you are still. A rise sustained over several days often shows up before you feel unwell.',
  sleep_duration:
    'Time actually asleep, not time in bed. Short single nights are normal; a run of them is what your care team looks at.',
  steps:
    'Total steps per day. Where your Watch and phone both recorded the same walk, it is only counted once.',
  vo2_max:
    'An estimate of cardiovascular fitness from your Apple Watch, recorded during outdoor walks, runs and hikes of around 20 minutes. It moves slowly — over months, not days.',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: theme.font.tiny, color: theme.color.textFaint }}>{label}</Text>
      <Text
        style={{
          fontSize: theme.font.title,
          color: theme.color.text,
          marginTop: 2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  )
}

export default function MetricDetail() {
  const { metric } = useLocalSearchParams<{ metric: string }>()
  const [series, setSeries] = useState<Series | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchDaily(90)
      .then((daily) => {
        if (!cancelled) setSeries(toSeries(daily, String(metric)))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [metric])

  const tint = METRIC_TINT[String(metric)] ?? theme.color.accent
  const label = METRIC_LABEL[String(metric)] ?? String(metric)

  const delta =
    series?.recentAvg != null && series?.baselineAvg != null && series.baselineAvg !== 0
      ? ((series.recentAvg - series.baselineAvg) / series.baselineAvg) * 100
      : null

  const higherBetter = METRIC_HIGHER_IS_BETTER[String(metric)] ?? true

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: label }} />
      <ScrollView contentContainerStyle={{ padding: theme.space(4), paddingBottom: theme.space(10) }}>
        {busy ? (
          <ActivityIndicator style={{ marginTop: theme.space(10) }} />
        ) : !series || series.points.length === 0 ? (
          <Text style={{ color: theme.color.textMuted, fontSize: theme.font.body, lineHeight: 22 }}>
            No readings yet. {METRIC_NOTE[String(metric)] ?? ''}
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text
                style={{
                  fontSize: 44,
                  color: theme.color.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatValue(String(metric), Number(series.latest?.value ?? 0))}
              </Text>
              <Text style={{ fontSize: theme.font.body, color: theme.color.textFaint }}>
                {unitLabel(String(metric))}
              </Text>
            </View>
            <Text style={{ fontSize: theme.font.small, color: theme.color.textMuted, marginTop: 2 }}>
              Most recent · {series.latest?.local_day}
            </Text>

            <View style={{ marginTop: theme.space(7) }}>
              <Text style={{ fontSize: theme.font.small, color: theme.color.textMuted }}>
                Last 90 days
              </Text>
              <View style={{ marginTop: theme.space(3) }}>
                <Chart
                  points={series.points}
                  tint={tint}
                  baseline={series.baselineAvg}
                  height={140}
                />
              </View>
              {series.baselineAvg != null ? (
                <Text
                  style={{ fontSize: theme.font.tiny, color: theme.color.textFaint, marginTop: theme.space(2) }}
                >
                  The line is your usual level over the previous month.
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: theme.space(4), marginTop: theme.space(7) }}>
              <Stat
                label="Last 7 days"
                value={
                  series.recentAvg != null
                    ? formatValue(String(metric), series.recentAvg)
                    : '—'
                }
              />
              <Stat
                label="Your usual"
                value={
                  series.baselineAvg != null
                    ? formatValue(String(metric), series.baselineAvg)
                    : '—'
                }
              />
              <Stat
                label="Change"
                value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta)}%`}
              />
            </View>

            {delta != null && Math.abs(delta) >= 3 ? (
              <Text
                style={{
                  fontSize: theme.font.small,
                  marginTop: theme.space(4),
                  color: delta > 0 === higherBetter ? theme.color.accent : theme.color.attention,
                }}
              >
                {delta > 0 === higherBetter
                  ? 'Moving in a favourable direction.'
                  : 'Moving away from your usual level. Your care team sees this too.'}
              </Text>
            ) : null}

            <Text
              style={{
                fontSize: theme.font.small,
                color: theme.color.textMuted,
                marginTop: theme.space(7),
                lineHeight: 21,
              }}
            >
              {METRIC_NOTE[String(metric)] ?? ''}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
