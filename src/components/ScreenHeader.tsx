import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme } from '@/theme'
import { Wordmark } from './Wordmark'

/**
 * The deep-green header the lab dashboard established, so a patient moving
 * between the phone and the web portal is looking at the same product.
 *
 * It paints behind the status bar deliberately — the inset is added as
 * padding rather than avoided, which is what makes the colour run to the
 * top edge instead of leaving a pale strip.
 */
export function ScreenHeader({
  eyebrow = 'Thrivewell',
  title,
  meta,
  children,
}: {
  eyebrow?: string
  title: string
  /** Small uppercase line under the title — a date, a count, a status. */
  meta?: string
  /** The headline sentence, if the screen has one. */
  children?: ReactNode
}) {
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        backgroundColor: theme.color.headerBg,
        paddingTop: insets.top + theme.space(3),
        paddingHorizontal: theme.space(5),
        paddingBottom: theme.space(9),
      }}
    >
      {eyebrow === 'Thrivewell' ? (
        <Wordmark />
      ) : (
        <Text style={{ ...theme.eyebrow, color: theme.color.onHeaderMuted }}>
          {eyebrow}
        </Text>
      )}

      <Text
        style={{
          fontFamily: theme.font.serif,
          fontSize: 30,
          color: theme.color.onHeader,
          marginTop: theme.space(4),
        }}
      >
        {title}
      </Text>

      {meta ? (
        <Text
          style={{
            ...theme.eyebrow,
            letterSpacing: 1.4,
            color: theme.color.onHeaderMuted,
            marginTop: theme.space(1),
          }}
        >
          {meta}
        </Text>
      ) : null}

      {children ? <View style={{ marginTop: theme.space(6) }}>{children}</View> : null}
    </View>
  )
}

/**
 * Count tile. Pulled up over the header's lower edge by the caller, the way
 * the dashboard does it, so the two surfaces interlock rather than stack.
 */
export function StatTile({
  n,
  label,
  bar,
}: {
  n: number
  label: string
  bar: string
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.border,
        padding: theme.space(4),
      }}
    >
      <Text
        style={{
          fontSize: 24,
          color: theme.color.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {n}
      </Text>
      <Text
        style={{
          ...theme.eyebrow,
          fontSize: 10,
          letterSpacing: 1.2,
          color: theme.color.textMuted,
          marginTop: theme.space(1),
        }}
      >
        {label}
      </Text>
      <View
        style={{
          marginTop: theme.space(2),
          height: 2,
          width: 32,
          borderRadius: 2,
          backgroundColor: bar,
        }}
      />
    </View>
  )
}
