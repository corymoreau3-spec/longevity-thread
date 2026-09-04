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
import { ensureFreshSession } from '../lib/supabase'
import { ensureAuthorized } from './authorization'
import {
  ASLEEP_VALUES,
  QUANTITY_METRICS,
  SLEEP_METRIC,
  type Metric,
  type QuantityMetricSpec,
} from './metrics'

const SOURCE = 'apple_health' as const

/**
 * Samples per HealthKit fetch.
 *
 * NOT unbounded. With no stored anchor HealthKit returns the patient's
 * entire history, and step counts run to hundreds of thousands of samples
 * over a few years. Pulling that across the native bridge in one call
 * exhausts memory and iOS kills the app — with no JavaScript error,
 * because the process is gone. Paging keeps each fetch bounded.
 */
const FETCH_PAGE = 5000

/** Stops a malformed anchor from looping forever. */
const MAX_PAGES = 200

/**
 * How far back a first sync reaches.
 *
 * HealthKit will hand over a patient's entire history — for step counts
 * that runs to hundreds of thousands of samples across several years, and
 * daily step totals from 2019 have no clinical use. Bounding the window
 * keeps the first sync to minutes rather than an evening.
 *
 * This only limits what is FETCHED. Anything already stored stays stored,
 * and the window rolls forward with today's date, so ordinary syncing is
 * unaffected — an anchored query only returns what changed anyway.
 */
const BACKFILL_MONTHS = 12

function backfillStart(): Date {
  const from = new Date()
  from.setMonth(from.getMonth() - BACKFILL_MONTHS)
  return from
}

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
  let cursor = anchor
  let inserted = 0
  let deleted = 0

  // Each page is fetched, uploaded, and its anchor persisted before the
  // next page is requested. A crash or failure part-way through therefore
  // costs one page, not the whole backfill.
  for (let page = 0; page < MAX_PAGES; page++) {
    // The unit is deliberately not requested. Asking for one would need a
    // cast past the library's per-identifier unit types; instead HealthKit
    // returns its default and we check it is the one this metric expects,
    // so a change to a default unit fails loudly here rather than silently
    // writing a correct number under the wrong label.
    const res = await queryQuantitySamplesWithAnchor(spec.identifier, {
      limit: FETCH_PAGE,
      filter: { date: { startDate: backfillStart() } },
      ...(cursor ? { anchor: cursor } : {}),
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

    const out = await send(spec.metric, {
      metric: spec.metric,
      anchor: res.newAnchor,
      observations,
      deleted_external_ids: res.deletedSamples.map((d) => d.uuid),
    })

    inserted += out.inserted
    deleted += out.deleted
    cursor = res.newAnchor

    // A short page means HealthKit has nothing further past this anchor.
    if (res.samples.length < FETCH_PAGE) break
  }

  return { metric: spec.metric, inserted, deleted }
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
  let cursor = anchor
  let inserted = 0
  let deleted = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await queryCategorySamplesWithAnchor(SLEEP_METRIC.identifier, {
      limit: FETCH_PAGE,
      filter: { date: { startDate: backfillStart() } },
      ...(cursor ? { anchor: cursor } : {}),
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

    // Deletions are sent unfiltered. A segment we never stored — an
    // `awake` stage, say — simply matches nothing, and filtering here
    // would risk dropping a deletion for a segment we did store.
    const out = await send(SLEEP_METRIC.metric, {
      metric: SLEEP_METRIC.metric,
      anchor: res.newAnchor,
      observations,
      deleted_external_ids: res.deletedSamples.map((d) => d.uuid),
    })

    inserted += out.inserted
    deleted += out.deleted
    cursor = res.newAnchor

    // Note this counts samples BEFORE the asleep filter: a page of pure
    // `inBed` segments still means HealthKit may have more to give.
    if (res.samples.length < FETCH_PAGE) break
  }

  return { metric: SLEEP_METRIC.metric, inserted, deleted }
}

/**
 * Rows per request. A first sync has no anchor, so HealthKit returns the
 * patient's entire history — years of step samples is far more than one
 * request body can carry. Splitting keeps each request small.
 */
const UPLOAD_CHUNK = 1000

/**
 * Upload one metric's samples, in chunks.
 *
 * The anchor rides on the final chunk only. If an earlier chunk fails the
 * anchor never advances, so the next run replays the whole window and the
 * uuid dedup key absorbs whatever already landed. Sending the anchor with
 * the first chunk would strand every sample after the failure point.
 */
async function send(metric: Metric, batch: MetricBatch): Promise<SyncOutcome> {
  const all = batch.observations
  const chunks: (typeof all)[] = []
  for (let i = 0; i < all.length; i += UPLOAD_CHUNK) {
    chunks.push(all.slice(i, i + UPLOAD_CHUNK))
  }
  // A metric with no new samples still needs one call, to record deletions
  // and move the anchor forward.
  if (chunks.length === 0) chunks.push([])

  let inserted = 0
  let deleted = 0

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1
    const res = await ingestBatch(SOURCE, {
      metric,
      observations: chunks[i],
      deleted_external_ids: isLast ? batch.deleted_external_ids : [],
      ...(isLast ? { anchor: batch.anchor } : {}),
    })
    inserted += res.inserted
    deleted += res.deleted
  }

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

  // A token that expired while the app was closed produces a 401 from the
  // edge function on the very first call, which used to surface on the
  // Today screen as a hard error. Refresh before touching the network.
  const signedIn = await ensureFreshSession()
  if (!signedIn) {
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
