import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { supabase } from './supabase'

/**
 * Push registration.
 *
 * The notification body deliberately carries no clinical content. Payloads
 * travel through Apple's servers, and Expo's when their service is used;
 * neither will sign a BAA. So the push says only that an update is waiting
 * and the detail lives behind the patient's login.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
})

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; reason: string }

/**
 * Asks for permission, obtains a token, and records it against the patient.
 *
 * Returns rather than throws. A patient who declines notifications still has
 * a working app, and an unhandled rejection here would take the screen down
 * for something entirely optional.
 */
export async function registerForPush(): Promise<PushRegistration> {
  // The simulator has no push service. Asking anyway returns a token that
  // silently never delivers, which is worse than a clear answer.
  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'Push requires a physical device' }
  }

  try {
    const existing = await Notifications.getPermissionsAsync()
    let granted = existing.granted

    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync()
      granted = asked.granted
    }

    if (!granted) return { status: 'denied' }

    // The Expo push service scopes tokens to an EAS project. Without one,
    // getExpoPushTokenAsync throws — so this reports the missing setup
    // rather than failing opaquely.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId

    if (!projectId) {
      return {
        status: 'unsupported',
        reason: 'No EAS project id — run `eas init` before push can register',
      }
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })

    // Stored through an edge function, not written directly. A client able to
    // insert its own rows could register a token against another patient and
    // receive their notifications.
    const { error } = await supabase.functions.invoke('register-push-token', {
      body: {
        token,
        provider: 'expo',
        platform: Platform.OS,
        device_name: Device.deviceName ?? null,
      },
    })

    if (error) return { status: 'error', reason: String(error.message ?? error) }

    return { status: 'registered', token }
  } catch (err: any) {
    return { status: 'error', reason: String(err?.message ?? err) }
  }
}
