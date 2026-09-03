import {
  isHealthDataAvailableAsync,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit'

import { READ_IDENTIFIERS } from './metrics'

/**
 * The HealthKit authorization gate.
 *
 * Every query path in this app goes through `ensureAuthorized()`. Querying
 * before authorization resolves crashes the native module, and the easiest
 * way to trip that is to put the request and a query in the same component
 * — two renders race and one of them queries early. So the gate lives here
 * at module scope instead: the request runs at most once per process and
 * every caller awaits the same promise.
 *
 * This module must not import anything that renders.
 */

let gate: Promise<boolean> | null = null

async function requestOnce(): Promise<boolean> {
  // iPad and the simulator can report HealthKit as unavailable. Asking
  // anyway throws, so this check has to come first.
  const available = await isHealthDataAvailableAsync()
  if (!available) return false

  // Read-only: this app never writes back to HealthKit, so `toShare` is
  // deliberately empty and the share sheet stays off the permission card.
  return await requestAuthorization({ toRead: READ_IDENTIFIERS })
}

/**
 * Resolves true once the patient has been shown the HealthKit permission
 * card and the native store is ready to be queried.
 *
 * Note that a `true` result does NOT mean the patient granted anything.
 * HealthKit deliberately refuses to disclose read denials — a denied type
 * simply returns no samples, indistinguishable from a patient who has no
 * data. Treat this as "safe to query", never as "data will be there".
 */
export function ensureAuthorized(): Promise<boolean> {
  if (!gate) {
    gate = requestOnce().catch((err) => {
      // Let the next caller retry rather than caching a rejected promise
      // for the life of the process.
      gate = null
      throw err
    })
  }
  return gate
}

/** Test seam: forget that authorization was requested. */
export function resetAuthorizationGate() {
  gate = null
}
