/**
 * A health app is read in bed at 6am and in a waiting room at 4pm. The
 * palette is deliberately quiet: near-black on off-white, one accent, and
 * colour reserved for things that need attention. Nothing here should
 * feel like an alarm unless it is one.
 */
export const theme = {
  color: {
    bg: '#FBFBF9',
    surface: '#FFFFFF',
    border: '#E8E6E1',
    text: '#1A1A18',
    textMuted: '#6B6B66',
    textFaint: '#9C9C96',
    accent: '#2E6F5E',
    accentSoft: '#EAF2EF',
    attention: '#B4622E',
    attentionSoft: '#FBF0E8',
  },
  space: (n: number) => n * 4,
  radius: { sm: 8, md: 14, lg: 20 },
  font: {
    display: 34,
    title: 22,
    body: 15,
    small: 13,
    tiny: 11,
  },
} as const

/** Colour per metric, used only for chart bars so a glance distinguishes them. */
export const METRIC_TINT: Record<string, string> = {
  hrv_sdnn: '#5B7DB1',
  resting_heart_rate: '#B4626F',
  sleep_duration: '#7A6BA8',
  steps: '#4E8C6A',
  vo2_max: '#B58A44',
}

export const METRIC_LABEL: Record<string, string> = {
  hrv_sdnn: 'Heart rate variability',
  resting_heart_rate: 'Resting heart rate',
  sleep_duration: 'Sleep',
  steps: 'Steps',
  vo2_max: 'Cardio fitness',
}

/** Short form for tiles, where the full label wraps badly. */
export const METRIC_SHORT: Record<string, string> = {
  hrv_sdnn: 'HRV',
  resting_heart_rate: 'Resting HR',
  sleep_duration: 'Sleep',
  steps: 'Steps',
  vo2_max: 'Cardio fitness',
}

/**
 * Which direction is favourable. Used to colour a change, so "resting
 * heart rate down 4bpm" reads as good and "HRV down 4ms" does not.
 * Steps and sleep have no inherently bad direction at these ranges, but
 * more is the intent for both.
 */
export const METRIC_HIGHER_IS_BETTER: Record<string, boolean> = {
  hrv_sdnn: true,
  resting_heart_rate: false,
  sleep_duration: true,
  steps: true,
  vo2_max: true,
}

/**
 * Stored units are what the database holds; display units are what a
 * person reads. Sleep is stored in seconds because that is what HealthKit
 * gives and what sums correctly — nobody wants to read 28800.
 */
export function formatValue(metric: string, value: number): string {
  switch (metric) {
    case 'sleep_duration': {
      const h = Math.floor(value / 3600)
      const m = Math.round((value % 3600) / 60)
      return m === 0 ? `${h}h` : `${h}h ${m}m`
    }
    case 'steps':
      return Math.round(value).toLocaleString()
    case 'hrv_sdnn':
      return `${Math.round(value)}`
    case 'resting_heart_rate':
      return `${Math.round(value)}`
    case 'vo2_max':
      return value.toFixed(1)
    default:
      return String(Math.round(value))
  }
}

export function unitLabel(metric: string): string {
  switch (metric) {
    case 'sleep_duration':
      return ''
    case 'steps':
      return 'steps'
    case 'hrv_sdnn':
      return 'ms'
    case 'resting_heart_rate':
      return 'bpm'
    case 'vo2_max':
      return 'ml/kg/min'
    default:
      return ''
  }
}
