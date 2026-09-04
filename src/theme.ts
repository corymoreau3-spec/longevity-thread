/**
 * Thrivewell brand, shared with the web portal.
 *
 * The palette is the one the lab dashboard established: deep green header,
 * cream page, teal as the single accent, gold reserved for emphasis. Colour
 * carries meaning here — teal/amber/red are the three classification states
 * from TW-SPEC-DASH-001 and are used for nothing else, so a red dot always
 * means the same thing whether the patient is looking at a lab marker on
 * the web or a card on their phone.
 *
 * Token values are kept identical to tailwind.config.js in the web repo.
 * If one moves, move the other.
 */
export const theme = {
  color: {
    // Surfaces
    bg: '#FBFBF9',
    surface: '#FFFFFF',
    border: '#E8E6E1',
    headerBg: '#173A32', // deep green header, as on the lab dashboard

    // Type
    text: '#1A1A18',
    textMuted: '#6B6B66',
    textFaint: '#9C9C96',
    onHeader: '#FFFFFF',
    onHeaderMuted: 'rgba(255,255,255,0.55)',

    // Brand
    accent: '#2A7F7F',      // sage-500, primary brand teal
    accentBright: '#4FA3A3', // sage-400
    accentSoft: '#EEF5F5',   // sage-50
    gold: '#C9A84C',
    goldSoft: '#F7F0DC',
    cream: '#F7F5F1',

    // Classification. These three are load-bearing — see above.
    inRange: '#0D9488',
    borderline: '#F59E0B',
    outOfRange: '#EF4444',

    // Attention, for alerts rather than classifications.
    attention: '#B4622E',
    attentionSoft: '#FBF0E8',
  },
  space: (n: number) => n * 4,
  radius: { sm: 8, md: 14, lg: 20, xl: 24 },
  font: {
    display: 34,
    title: 22,
    body: 15,
    small: 13,
    tiny: 11,
    /**
     * The web pairs Cormorant Garamond with Poppins. Neither ships with
     * iOS, and adding expo-google-fonts is a dependency that needs Cory's
     * sign-off. Georgia is already the web stack's declared serif fallback,
     * so headings match the fallback rendering rather than diverging.
     */
    serif: 'Georgia',
  },
  /** Uppercase micro-label used above titles, as on the lab dashboard. */
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
  },
} as const

/** Colour per metric, used only for chart bars so a glance distinguishes them. */
export const METRIC_TINT: Record<string, string> = {
  hrv_sdnn: '#4FA3A3',
  resting_heart_rate: '#B4626F',
  sleep_duration: '#5B7DB1',
  steps: '#2A7F7F',
  vo2_max: '#C9A84C',
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
