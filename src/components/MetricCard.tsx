import { Link } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import {
  METRIC_HIGHER_IS_BETTER,
  METRIC_SHORT,
  METRIC_TINT,
  formatValue,
  theme,
  unitLabel,
} from '@/theme'
import type { Series } from '@/lib/health-data'
import { Chart } from './Chart'

/**
 * A change is only shown when there is a baseline to measure against.
 * "Up 4%" with nothing behind it is worse than showing nothing, because
 * the patient cannot tell it is meaningless.
 */
function change(series: Series) {
  if (series.recentAvg == null || series.baselineAvg == null) return null
  if (series.baselineAvg === 0) return null

  const pct = ((series.recentAvg - series.baselineAvg) / series.baselineAvg) * 100
  // Under 3% is noise for every one of these metrics. Rendering it invites
  // a patient to read meaning into day-to-day variation.
  if (Math.abs(pct) < 3) return { pct: 0, favourable: null as boolean | null }

  const higherBetter = METRIC_HIGHER_IS_BETTER[series.metric] ?? true
  return { pct, favourable: pct > 0 === higherBetter }
}

export function MetricCard({ series }: { series: Series }) {
  const tint = METRIC_TINT[series.metric] ?? theme.color.accent
  const delta = change(series)
  const last14 = series.points.slice(-14)

  return (
    <Link href={{ pathname: '/metric/[metric]', params: { metric: series.metric } }} asChild>
      <Pressable
        style={({ pressed }) => ({
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.color.border,
          padding: theme.space(4),
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontSize: theme.font.small, color: theme.color.textMuted }}>
          {METRIC_SHORT[series.metric] ?? series.metric}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
          <Text
            style={{
              fontSize: 28,
              color: theme.color.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {series.latest ? formatValue(series.metric, Number(series.latest.value)) : '—'}
          </Text>
          <Text style={{ fontSize: theme.font.small, color: theme.color.textFaint }}>
            {unitLabel(series.metric)}
          </Text>
        </View>

        {delta ? (
          <Text
            style={{
              fontSize: theme.font.tiny,
              marginTop: 2,
              color:
                delta.pct === 0
                  ? theme.color.textFaint
                  : delta.favourable
                    ? theme.color.accent
                    : theme.color.attention,
            }}
          >
            {delta.pct === 0
              ? 'Steady'
              : `${delta.pct > 0 ? '↑' : '↓'} ${Math.abs(Math.round(delta.pct))}% vs your usual`}
          </Text>
        ) : (
          <Text style={{ fontSize: theme.font.tiny, marginTop: 2, color: theme.color.textFaint }}>
            Building your baseline
          </Text>
        )}

        <View style={{ marginTop: theme.space(3) }}>
          <Chart points={last14} tint={tint} height={34} compact />
        </View>
      </Pressable>
    </Link>
  )
}
