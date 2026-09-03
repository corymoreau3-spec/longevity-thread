import {
  queryCategorySamplesWithAnchor,
  queryQuantitySamplesWithAnchor,
} from '@kingstinct/react-native-healthkit'

import {
  fetchAnchors,
  ingestBatch,
  type MetricBatch,
  type ObservationInput,
} from '../lib/ingest'
import { ensureAuthorized } from './authorization'
import {
  ASLEEP_VALUES,
  QUANTITY_METRICS,
  SLEEP_METRIC,
  type Metric,
  type QuantityMetricSpec,
} from './metrics'

const SOURCE = 'apple_health' as const

/** Fetch everything an anchored query has for us in one pass. */
const NO_LIMIT = 0

export type SyncOutcome = {
  readonly metric: Metric
  readonly inserted: number
  readonly deleted: number
  readonly error?: string
}

/**
 * HealthKit reports the same activity from the Watch, the phone, and any
 * third-party app that wrote it, each as a distinct sample with its own
 * uuid. All of them are stored. Choosing between them stays a read-time
 * decision — `preferred_observations()` applies the precedence rule —
 * because an anchored query performs no source deduplication of its own,
 * and dropping copies at ingest would throw away the evidence.
 *
 * `origin_model` is the part that actually separates a Watch from a
 * phone. Apple Health reports `com.apple.health.<uuid>` as the bundle id
 * for both, differing only in the uuid, so the bundle id alone cannot
 * tell them apart. HKDevice.model can, and is optional — third-party
 * apps often set no device at all, which correctly ranks them last.
 */
function originOf(sample: {
  sourceRevision: { source: { bundleIdentifier: string; name: string } }
  device?: { model?: string }
}) {
  return {
    origin_device: sample.sourceRevision?.source?.bundleIdentifier ?? null,
    origin_name: sample.sourceRevision?.source?.name ?? null,
    origin_model: sample.device?.model ?? null,
  }
}

async function syncQuantity(
  spec: QuantityMetricSpec,
  anchor: string | undefined,
): Promise<SyncOutcome> {
  // The unit is deliberately not requested. Asking for one would need a
  // cast past the library's per-identifier unit types; instead HealthKit
  // returns its default and we check it is the one this metric expects, so
  // a change to a default unit fails loudly here rather than silently
  // writing a correct number under the wrong label.
  const res = await queryQuantitySamplesWithAnchor(spec.identifier, {
    limit: NO_LIMIT,
    ...(anchor ? { anchor } : {}),
  })

  const mismatch = res.samples.find((s) => s.unit !== spec.hkUnit)
  if (mismatch) {
    throw new Error(
      `${spec.metric}: expected unit ${spec.hkUnit}, HealthKit returned ${mismatch.unit}`,
    )
  }

  const observations: ObservationInput[] = res.samples.map((s) => ({
    metric: spec.metric,
    external_id: s.uuid,
    effective_start: s.startDate.toISOString(),
    effective_end: s.endDate.toISOString(),
    value: s.quantity,
    unit: spec.unit,
    ...originOf(s),
  }))

  return await send(spec.metric, {
    metric: spec.metric,
    anchor: res.newAnchor,
    observations,
    deleted_external_ids: res.deletedSamples.map((d) => d.uuid),
  })
}

/**
 * Sleep is a category type: HealthKit returns stage segments, not nightly
 * totals. Each segment becomes one observation whose value is its own
 * length in seconds, so the uuid dedup key still applies; a night's total
 * is the sum of its segments at read time.
 *
 * `inBed` and `awake` segments are dropped, so this measures time asleep
 * rather than time in bed.
 */
async function syncSleep(anchor: string | undefined): Promise<SyncOutcome> {
  const res = await queryCategorySamplesWithAnchor(SLEEP_METRIC.identifier, {
    limit: NO_LIMIT,
    ...(anchor ? { anchor } : {}),
  })

  const observations: ObservationInput[] = res.samples
    .filter((s) => ASLEEP_VALUES.has(s.value as number))
    .map((s) => ({
      metric: SLEEP_METRIC.metric,
      external_id: s.uuid,
      effective_start: s.startDate.toISOString(),
      effective_end: s.endDate.toISOString(),
      value: Math.round((s.endDate.getTime() - s.startDate.getTime()) / 1000),
      unit: SLEEP_METRIC.unit,
      ...originOf(s),
    }))

  // Deletions are sent unfiltered. A segment we never stored — an `awake`
  // stage, say — simply matches nothing, and filtering here would risk
  // dropping a deletion for a segment we did store.
  return await send(SLEEP_METRIC.metric, {
    metric: SLEEP_METRIC.metric,
    anchor: res.newAnchor,
    observations,
    deleted_external_ids: res.deletedSamples.map((d) => d.uuid),
  })
}

async function send(metric: Metric, batch: MetricBatch): Promise<SyncOutcome> {
  const { inserted, deleted } = await ingestBatch(SOURCE, batch)
  return { metric, inserted, deleted }
}

/**
 * Pull every metric once and hand the results to the edge function.
 *
 * Metrics are synced independently and a failure in one is reported
 * rather than thrown: a patient who has never recorded a VO2 max should
 * still get their steps. Because the anchor only advances inside a
 * successful ingest, a failed metric simply replays next time.
 */
export async function syncAll(): Promise<readonly SyncOutcome[]> {
  // Nothing below may run before this resolves.
  const ready = await ensureAuthorized()
  if (!ready) {
    return [] as const
  }

  const anchors = await fetchAnchors(SOURCE)

  const jobs: Promise<SyncOutcome>[] = [
    ...QUANTITY_METRICS.map((spec) =>
      syncQuantity(spec, anchors[spec.metric]).catch((err) => ({
        metric: spec.metric,
        inserted: 0,
        deleted: 0,
        error: String(err?.message ?? err),
      })),
    ),
    syncSleep(anchors[SLEEP_METRIC.metric]).catch((err) => ({
      metric: SLEEP_METRIC.metric,
      inserted: 0,
      deleted: 0,
      error: String(err?.message ?? err),
    })),
  ]

  return await Promise.all(jobs)
}
