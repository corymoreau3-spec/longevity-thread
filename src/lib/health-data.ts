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

  const sinceDay = since.toISOString().slice(0, 10)

  // p_since has to go into the call, not onto the result. PostgREST applies
  // .gte() to what the function returns, so passing the window only as a
  // filter made the database resolve source precedence across the patient's
  // entire history and then discard all but the last 90 days. That took
  // 18.7s against the 8s statement timeout, and the screen showed
  // "canceling statement due to statement timeout" instead of any data.
  // The .gte() stays as a cheap guard on timezone edges at the boundary.
  const { data, error } = await supabase
    .rpc('preferred_observations', {
      p_timezone: TIMEZONE,
      p_since: sinceDay,
    })
    .gte('local_day', sinceDay)
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

/* ------------------------------------------------------------------ */
/* Labs                                                                */
/* ------------------------------------------------------------------ */

/**
 * The lab surface is deliberately separate from everything above.
 *
 * TW-SPEC-DASH-001 §1 keeps wearable metrics off the lab surface and lab
 * markers off the wearable surface: different cadence, different
 * reliability, different query path. They share a screen style and nothing
 * else. Classification is decided in SQL and read here as-is — nothing in
 * this file may derive, adjust or re-describe a classification, and there
 * is no aggregate score anywhere in it.
 */

export type LabPanel = {
  panel_id: string
  draw_date: string
  lab_partner: string | null
  release_state: string
  gated: boolean
  markers_total: number
  markers_resolved: number
  in_range: number
  borderline: number
  out_of_range: number
  not_classified: number
  pending_review: number
  prior_draw_date: string | null
  has_interim_classification: boolean
}

export type LabMarker = {
  marker_name: string
  marker_category: string | null
  unit: string | null
  current_value: number | null
  current_result: string
  optimal_range_low: number | null
  optimal_range_high: number | null
  optimal_range_text: string | null
  prior_value: number | null
  prior_result: string | null
  prior_draw_date: string | null
  pct_change: number | null
  range_changed: boolean
}

export type Dashboard = {
  panel: LabPanel | null
  markers: LabMarker[]
}

/** The patient row belonging to the signed-in user. */
export async function fetchPatient(): Promise<{ id: string; first_name: string | null } | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('id, first_name')
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

/**
 * Panel, markers and domain status in one payload.
 *
 * §5.4: the app calls the RPC and nothing else. Review gating is enforced
 * inside it, so an unreleased panel comes back with `gated` true and no
 * values — the client must not try to fill that gap from another query.
 */
export async function fetchDashboard(patientId: string): Promise<Dashboard> {
  const { data, error } = await supabase.rpc('get_dashboard', {
    p_patient_id: patientId,
  })

  if (error) throw error

  const payload = (data ?? {}) as { panel?: LabPanel; markers?: LabMarker[] }
  return {
    panel: payload.panel ?? null,
    markers: payload.markers ?? [],
  }
}

export const RESULT_LABEL: Record<string, string> = {
  in_range: 'In range',
  borderline: 'Borderline',
  out_of_range: 'Outside optimal',
  pending_review: 'Pending review',
  not_classified: 'No optimized range',
}
