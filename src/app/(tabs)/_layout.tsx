import { Tabs } from 'expo-router'
import { Text, type ColorValue } from 'react-native'
import { theme } from '@/theme'

/**
 * Wearables, labs, the assistant, what the care team has flagged, and
 * control over their own data.
 *
 * Today and Labs stay separate surfaces on purpose. TW-SPEC-DASH-001 §1
 * keeps wearable metrics off the lab surface — different cadence, different
 * reliability, vendor-derived — and merging them into one feed would put a
 * ten-minute step count next to a twice-yearly ApoB as though they were
 * comparable readings.
 *
 * Text glyphs rather than an icon dependency — adding one would need
 * approval and buys little at this size.
 */
function Icon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 18, color }}>{glyph}</Text>
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textFaint,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        tabBarLabelStyle: { fontSize: theme.font.tiny, letterSpacing: 0.2 },
        sceneStyle: { backgroundColor: theme.color.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <Icon glyph="◍" color={color} />,
        }}
      />
      <Tabs.Screen
        name="labs"
        options={{
          title: 'Labs',
          tabBarIcon: ({ color }) => <Icon glyph="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          tabBarIcon: ({ color }) => <Icon glyph="✦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Updates',
          tabBarIcon: ({ color }) => <Icon glyph="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Icon glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  )
}
