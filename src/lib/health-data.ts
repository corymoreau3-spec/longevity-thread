import { supabase } from './supabase'

/**
 * Day boundaries follow the phone, not the clinic. A patient's
 * "yesterday" is wherever they were standing.
 */
export const TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export type DailyPoint = {
  metric: string
  local_day: string
  value: number
  unit: string
  origin_model: string | null
  sample_count: number
}

/**
 * Daily values with duplicate sources already resolved by the database —
 * a Watch and a phone that both recorded the same walk count once.
 */
export async function fetchDaily(days = 90): Promise<DailyPoint[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .rpc('preferred_observations', { p_timezone: TIMEZONE })
    .gte('local_day', since.toISOString().slice(0, 10))
    .order('local_day', { ascending: true })

  if (error) throw error
  return (data ?? []) as DailyPoint[]
}

export type Alert = {
  id: string
  patient_message: string
  created_at: string
  status: string
  patient_seen_at: string | null
}

export async function fetchAlerts(): Promise<Alert[]> {
  const { data, error } = await supabase
    .from('observation_alerts')
    .select('id, patient_message, created_at, status, patient_seen_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []) as Alert[]
}

export type Series = {
  metric: string
  points: DailyPoint[]
  latest: DailyPoint | null
  recentAvg: number | null
  baselineAvg: number | null
}

/**
 * Groups daily points per metric and computes the two numbers the UI
 * actually shows: a recent average and the baseline it is measured
 * against.
 *
 * The baseline excludes the recent window. Including it lets a sustained
 * change drag the baseline toward itself, so a real trend looks flat —
 * the same reasoning as the alert rules, kept consistent so the app and
 * the alerts never disagree about whether something moved.
 */
export function toSeries(points: DailyPoint[], metric: string): Series {
  const mine = points.filter((p) => p.metric === metric)
  const recent = mine.slice(-7)
  const baseline = mine.slice(-37, -7)

  const avg = (xs: DailyPoint[]) =>
    xs.length ? xs.reduce((n, p) => n + Number(p.value), 0) / xs.length : null

  return {
    metric,
    points: mine,
    latest: mine.length ? mine[mine.length - 1] : null,
    recentAvg: avg(recent),
    baselineAvg: avg(baseline),
  }
}
