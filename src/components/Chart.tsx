import { View } from 'react-native'
import { theme } from '@/theme'
import type { DailyPoint } from '@/lib/health-data'

/**
 * Bar charts drawn with plain Views rather than a charting library.
 *
 * Deliberate: a dependency would need approval, and for daily values over
 * a fixed window bars carry the shape perfectly well. Bars also degrade
 * honestly when days are missing — a gap reads as a gap, where a line
 * chart would interpolate across it and invent data the patient never
 * recorded.
 */

type Props = {
  points: DailyPoint[]
  tint: string
  /** Drawn as a horizontal rule, so a value can be read against it. */
  baseline?: number | null
  height?: number
  /** Sparklines omit the baseline rule and sit flush. */
  compact?: boolean
}

export function Chart({ points, tint, baseline, height = 120, compact }: Props) {
  if (points.length === 0) {
    return <View style={{ height }} />
  }

  const values = points.map((p) => Number(p.value))
  const max = Math.max(...values, baseline ?? 0)
  // Bars are drawn from zero, not from the minimum. Starting at the
  // minimum exaggerates small variation into dramatic peaks, which for
  // health data is actively misleading.
  const scale = (v: number) => (max > 0 ? Math.max((v / max) * height, 2) : 2)

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: compact ? 2 : 3 }}>
      {baseline != null && !compact ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: scale(baseline),
            height: 1,
            backgroundColor: theme.color.border,
          }}
        />
      ) : null}

      {points.map((p) => (
        <View
          key={p.local_day}
          style={{
            flex: 1,
            height: scale(Number(p.value)),
            backgroundColor: tint,
            opacity: 0.85,
            borderRadius: 2,
          }}
        />
      ))}
    </View>
  )
}
