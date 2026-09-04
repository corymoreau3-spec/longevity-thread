import { supabase } from './supabase'
import type { Metric } from '../health/metrics'

const FUNCTION_NAME = 'ingest-observations'

/** Integrations that can write observations. Apple Health is the first. */
export type Source = 'apple_health' | 'whoop' | 'health_connect'

/**
 * One observation as sent to the edge function. There is deliberately no
 * patient_id: the function derives it from the caller's JWT. A client that
 * could name its own patient_id could write into someone else's chart.
 */
export type ObservationInput = {
  readonly metric: Metric
  readonly external_id: string
  readonly effective_start: string
  readonly effective_end: string
  readonly value: number
  readonly unit: string
  readonly origin_device: string | null
  readonly origin_name: string | null
  readonly origin_model: string | null
}

export type MetricBatch = {
  readonly metric: Metric
  /**
   * Opaque anchor returned by this query, persisted as-is. Omitted on all
   * but the final chunk of a large upload, so the anchor cannot advance
   * past observations that have not landed yet.
   */
  readonly anchor?: string
  readonly observations: readonly ObservationInput[]
  /** uuids HealthKit reported as deleted since the previous anchor. */
  readonly deleted_external_ids: readonly string[]
}

export type IngestResult = {
  readonly inserted: number
  readonly deleted: number
}

/**
 * Current anchors for this patient, keyed by metric. A metric with no
 * stored anchor is absent from the map, which the caller treats as
 * "never synced" and backfills from scratch.
 *
 * This goes through the edge function because `sync_state` grants
 * patients no direct read — anchors are sync plumbing, not chart data.
 */
export async function fetchAnchors(
  source: Source,
): Promise<Partial<Record<Metric, string>>> {
  const { data, error } = await supabase.functions.invoke<{
    anchors: Partial<Record<Metric, string>>
  }>(`${FUNCTION_NAME}?source=${source}`, { method: 'GET' })

  if (error) throw error
  return data?.anchors ?? {}
}

/**
 * Send one metric's samples and its new anchor. The function writes both
 * in a single call so an anchor can never advance past observations that
 * failed to land — losing samples silently until the next reinstall.
 */
export async function ingestBatch(
  source: Source,
  batch: MetricBatch,
): Promise<IngestResult> {
  const { data, error } = await supabase.functions.invoke<IngestResult>(
    FUNCTION_NAME,
    { method: 'POST', body: { source, batch } },
  )

  if (error) throw error
  return data ?? { inserted: 0, deleted: 0 }
}
