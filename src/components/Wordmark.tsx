import { Text, View } from 'react-native'

import { theme } from '@/theme'

/**
 * The Thrivewell AI lockup: wordmark, gold underline, droplet inside a
 * tilted gold ring.
 *
 * Built from primitives rather than an image or an SVG library. The app has
 * no react-native-svg and adding one needs sign-off, so the droplet is a
 * square with three rounded corners rotated 45deg — the standard teardrop
 * construction — and the ring is a circle squashed on one axis and tilted.
 * Colours and proportions come from src/components/Logo.tsx in the web repo
 * so the two marks stay in step; if one changes, change the other.
 */

const GOLD = '#C9A84C'
const DROPLET = '#7FC4C4'

function Droplet({ size = 16 }: { size?: number }) {
  return (
    <View style={{ width: size * 1.9, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
      {/* Tilted gold ring, drawn behind the droplet. */}
      <View
        style={{
          position: 'absolute',
          width: size * 1.85,
          height: size * 1.85,
          borderRadius: size,
          borderWidth: 1.4,
          borderColor: GOLD,
          transform: [{ rotate: '-18deg' }, { scaleY: 0.42 }],
        }}
      />
      {/* Teardrop: rounded on three corners, square on the fourth, rotated
          so the sharp corner points up. */}
      <View
        style={{
          width: size * 0.82,
          height: size * 0.82,
          backgroundColor: DROPLET,
          borderTopLeftRadius: size * 0.41,
          borderTopRightRadius: size * 0.41,
          borderBottomRightRadius: size * 0.41,
          borderBottomLeftRadius: 0,
          transform: [{ rotate: '-135deg' }],
        }}
      />
    </View>
  )
}

export function Wordmark({
  /** Type size for THRIVEWELL. The rest scales from it. */
  size = 15,
}: {
  size?: number
}) {
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.5 }}>
        <Text
          style={{
            fontFamily: theme.font.serif,
            fontSize: size,
            letterSpacing: size * 0.22,
            color: '#FFFFFF',
          }}
        >
          THRIVEWELL{' '}
          <Text style={{ color: DROPLET }}>AI</Text>
        </Text>
        <Droplet size={size} />
      </View>

      {/* The gold sweep under the wordmark. A straight hairline rather than
          the logo's curve — a curve needs a path, and at this size the
          difference is a pixel. */}
      <View
        style={{
          height: 1,
          backgroundColor: GOLD,
          marginTop: size * 0.18,
          marginRight: size * 1.6,
          opacity: 0.9,
        }}
      />
    </View>
  )
}
