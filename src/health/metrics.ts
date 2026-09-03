import { CategoryValueSleepAnalysis } from '@kingstinct/react-native-healthkit'

/**
 * The five metrics in the first slice. These slugs are the contract with
 * the `observations` table — Apple Health, Whoop and (later) Health
 * Connect all map into this vocabulary so nothing downstream branches on
 * provider.
 */
export type Metric =
  | 'hrv_sdnn'
  | 'resting_heart_rate'
  | 'sleep_duration'
  | 'steps'
  | 'vo2_max'

/**
 * Units are pinned per metric by a CHECK constraint on `observations`.
 * Where HealthKit's own unit label differs from the canonical one the
 * magnitude is identical and only the label is rewritten — 'count/min'
 * and 'bpm' are the same number, as are 'ml/(kg*min)' and 'ml/kg/min'.
 * Nothing here performs arithmetic on values.
 */
export type QuantityMetricSpec = {
  readonly kind: 'quantity'
  readonly metric: Metric
  readonly identifier:
    | 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
    | 'HKQuantityTypeIdentifierRestingHeartRate'
    | 'HKQuantityTypeIdentifierStepCount'
    | 'HKQuantityTypeIdentifierVO2Max'
  /** Unit requested from HealthKit. */
  readonly hkUnit: string
  /** Unit written to `observations`. */
  readonly unit: string
}

export type CategoryMetricSpec = {
  readonly kind: 'category'
  readonly metric: Metric
  readonly identifier: 'HKCategoryTypeIdentifierSleepAnalysis'
  readonly unit: string
}

export type MetricSpec = QuantityMetricSpec | CategoryMetricSpec

export const QUANTITY_METRICS: readonly QuantityMetricSpec[] = [
  {
    kind: 'quantity',
    metric: 'hrv_sdnn',
    identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    hkUnit: 'ms',
    unit: 'ms',
  },
  {
    kind: 'quantity',
    metric: 'resting_heart_rate',
    identifier: 'HKQuantityTypeIdentifierRestingHeartRate',
    hkUnit: 'count/min',
    unit: 'bpm',
  },
  {
    kind: 'quantity',
    metric: 'steps',
    identifier: 'HKQuantityTypeIdentifierStepCount',
    hkUnit: 'count',
    unit: 'count',
  },
  {
    kind: 'quantity',
    metric: 'vo2_max',
    identifier: 'HKQuantityTypeIdentifierVO2Max',
    hkUnit: 'ml/(kg*min)',
    unit: 'ml/kg/min',
  },
] as const

/**
 * Sleep has no duration sample in HealthKit — it is a category type
 * returning stage segments, each with its own uuid and interval. One
 * observation row is written per segment with `value` set to that
 * segment's length in seconds; a night's total is the sum over its
 * segments. Aggregating before storage would leave the row without an
 * HKSample.uuid and break the dedup key.
 */
export const SLEEP_METRIC: CategoryMetricSpec = {
  kind: 'category',
  metric: 'sleep_duration',
  identifier: 'HKCategoryTypeIdentifierSleepAnalysis',
  unit: 's',
} as const

/**
 * Only genuine sleep counts. `inBed` and `awake` are deliberately
 * excluded, so this measures time asleep rather than time in bed —
 * note that `asleep` and `asleepUnspecified` are the same value (1),
 * kept for older watchOS samples that predate stage tracking.
 */
export const ASLEEP_VALUES: ReadonlySet<number> = new Set([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
])

export const ALL_METRICS: readonly MetricSpec[] = [
  ...QUANTITY_METRICS,
  SLEEP_METRIC,
]

/** Every HealthKit type this app reads. Used to build the auth request. */
export const READ_IDENTIFIERS = ALL_METRICS.map((m) => m.identifier)
