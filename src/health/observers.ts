import {
  enableBackgroundDelivery,
  subscribeToChanges,
  UpdateFrequency,
} from '@kingstinct/react-native-healthkit'

import { ensureAuthorized } from './authorization'
import { ALL_METRICS } from './metrics'
import { syncAll } from './sync'

/**
 * Observer queries plus background delivery.
 *
 * `subscribeToChanges` is the HKObserverQuery: it fires when HealthKit
 * records a change to a type, telling us *that* something changed but not
 * what. The response is always the same — run the anchored sync, which
 * works out the delta from the stored anchor.
 *
 * `enableBackgroundDelivery` is what lets those callbacks wake the app
 * when it is not in the foreground. It requires the HealthKit background
 * delivery entitlement, and is a no-op in the simulator.
 */

type Subscription = { remove: () => boolean }

let subscriptions: Subscription[] = []
let syncing: Promise<unknown> | null = null

/**
 * Collapse overlapping runs. Five observers firing at once after a watch
 * sync would otherwise start five full passes over the same anchors.
 */
function syncOnce() {
  if (!syncing) {
    syncing = syncAll().finally(() => {
      syncing = null
    })
  }
  return syncing
}

export async function startObservers(): Promise<boolean> {
  // Same rule as everywhere else: nothing touches HealthKit until the
  // authorization gate resolves.
  const ready = await ensureAuthorized()
  if (!ready) return false

  if (subscriptions.length > 0) return true

  for (const spec of ALL_METRICS) {
    // `hourly` rather than `immediate`: these are trend metrics, not
    // alerts, and immediate delivery on a high-volume type like step
    // count wakes the app constantly for no clinical benefit.
    await enableBackgroundDelivery(spec.identifier, UpdateFrequency.hourly)

    subscriptions.push(
      subscribeToChanges(spec.identifier, (args) => {
        if (args.errorMessage) {
          console.warn(`[health] observer error for ${args.typeIdentifier}`)
          return
        }
        // An unhandled rejection from a background observer red-screens
        // the app, so failures are logged and dropped here. The next sync
        // replays them, because the anchor only advances on success.
        syncOnce().catch(() => {
          console.warn(`[health] sync failed after change to ${args.typeIdentifier}`)
        })
      }),
    )
  }

  return true
}

export function stopObservers() {
  for (const sub of subscriptions) sub.remove()
  subscriptions = []
}
