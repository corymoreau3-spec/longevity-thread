import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Linking } from 'react-native'

import { registerForPush, type PushRegistration } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { theme } from '@/theme'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.space(3),
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border,
      }}
    >
      <Text style={{ fontSize: theme.font.body, color: theme.color.textMuted }}>{label}</Text>
      <Text style={{ fontSize: theme.font.body, color: theme.color.text }}>{value}</Text>
    </View>
  )
}

export default function Settings() {
  const [email, setEmail] = useState<string>('')
  const [push, setPush] = useState<PushRegistration | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    setEmail(data.user?.email ?? '')
    // Registration is idempotent, so re-running on each visit keeps a
    // reinstalled or restored device's token current.
    setPush(await registerForPush())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space(4) }}>
        <Text style={{ fontSize: theme.font.display, color: theme.color.text }}>Settings</Text>

        <View
          style={{
            marginTop: theme.space(5),
            paddingHorizontal: theme.space(4),
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Row label="Signed in as" value={email || '—'} />
          <Row label="Health data" value="Apple Health" />
          <Row
            label="Notifications"
            value={
              push == null
                ? '—'
                : push.status === 'registered'
                  ? 'On'
                  : push.status === 'denied'
                    ? 'Off in iOS Settings'
                    : 'Unavailable'
            }
          />
        </View>

        {/*
          Stated rather than implied. A patient should know that a
          notification never carries the finding itself.
        */}
        {push?.status === 'registered' ? (
          <Text
            style={{
              fontSize: theme.font.small,
              color: theme.color.textMuted,
              marginTop: theme.space(5),
              lineHeight: 20,
            }}
          >
            Notifications tell you an update is waiting. They never include
            your health information — you open the app to see it.
          </Text>
        ) : null}

        {push?.status === 'unsupported' ? (
          <Text
            style={{
              fontSize: theme.font.tiny,
              color: theme.color.textFaint,
              marginTop: theme.space(3),
            }}
          >
            {push.reason}
          </Text>
        ) : null}

        <Text
          style={{
            fontSize: theme.font.small,
            color: theme.color.textMuted,
            marginTop: theme.space(6),
            lineHeight: 20,
          }}
        >
          Which metrics this app can read is controlled by iOS, not here. You
          can change or revoke access at any time.
        </Text>

        {/*
          Deep link into iOS Settings rather than duplicating the toggles.
          Apple deliberately does not tell an app which permissions were
          denied, so any switch shown here could be wrong.
        */}
        <Pressable
          onPress={() => Linking.openURL('x-apple-health://')}
          style={({ pressed }) => ({
            marginTop: theme.space(3),
            padding: theme.space(4),
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.accentSoft,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: theme.color.accent, fontSize: theme.font.body }}>
            Open Apple Health
          </Text>
        </Pressable>

        <Pressable
          onPress={() => supabase.auth.signOut()}
          style={({ pressed }) => ({
            marginTop: theme.space(8),
            padding: theme.space(4),
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.color.border,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: theme.color.textMuted, fontSize: theme.font.body }}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
