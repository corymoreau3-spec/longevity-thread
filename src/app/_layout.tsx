import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

/**
 * Holds the session and routes on it. Deliberately does not touch
 * HealthKit: authorization is requested from the sync module's gate, and
 * colocating a permission request with a component that also queries is
 * the exact race that crashes the native module.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return

    const onSignIn = segments[0] === 'sign-in'
    if (!session && !onSignIn) {
      router.replace('/sign-in')
    } else if (session && onSignIn) {
      router.replace('/')
    }
  }, [session, loading, segments, router])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return <Stack screenOptions={{ headerTitle: 'Longevity Thread' }} />
}
