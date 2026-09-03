import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Button,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { startObservers } from '@/health/observers'
import { syncAll, type SyncOutcome } from '@/health/sync'
import { supabase } from '@/lib/supabase'

/**
 * Day boundaries are resolved in the phone's own timezone rather than the
 * clinic's. A patient's "yesterday" is where they were standing, and
 * clinic_settings is not readable by patients anyway.
 */
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Daily value with duplicate sources already resolved by the database. */
type DailyRow = {
  metric: string
  local_day: string
  source_rank: number
  origin_model: string | null
  value: number
  unit: string
  sample_count: number
}

/** One raw sample, as stored. Used to show what precedence discarded. */
type SampleRow = {
  id: string
  metric: string
  effective_start: string
  value: number
  unit: string
  origin_model: string | null
  origin_name: string | null
}

/**
 * Sleep is stored in seconds and steps as a bare count, which are hard to
 * eyeball. This only affects display; nothing here changes a stored value.
 */
function format(value: number, unit: string) {
  if (unit === 's') {
    const hours = Math.floor(value / 3600)
    const minutes = Math.round((value % 3600) / 60)
    return `${hours}h ${minutes}m`
  }
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toLocaleString()} ${unit}`
}

export default function Observations() {
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [samples, setSamples] = useState<SampleRow[]>([])
  const [showRaw, setShowRaw] = useState(false)
  const [outcomes, setOutcomes] = useState<readonly SyncOutcome[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // Duplicate sources are resolved server-side: the Watch wins over the
    // phone, which wins over third-party apps, decided per metric per day.
    const daily = await supabase
      .rpc('preferred_observations', { p_timezone: TIMEZONE })
      .order('local_day', { ascending: false })
      .limit(100)

    // Every sample, including the copies precedence dropped. RLS scopes
    // both queries to the signed-in patient.
    const raw = await supabase
      .from('observations')
      .select(
        'id, metric, effective_start, value, unit, origin_model, origin_name',
      )
      .is('deleted_at', null)
      .order('effective_start', { ascending: false })
      .limit(100)

    if (daily.error) setError(daily.error.message)
    else setDaily((daily.data ?? []) as DailyRow[])

    if (raw.error) setError(raw.error.message)
    else setSamples((raw.data ?? []) as SampleRow[])
  }, [])

  const sync = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setOutcomes(await syncAll())
      await load()
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }, [load])

  useEffect(() => {
    void sync()
    void startObservers()
  }, [sync])

  const failures = outcomes.filter((o) => o.error)
  const discarded = samples.length - daily.reduce((n, d) => n + d.sample_count, 0)

  const header = (
    <View style={styles.header}>
      {busy ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {failures.map((f) => (
        <Text key={f.metric} style={styles.error}>
          {f.metric}: {f.error}
        </Text>
      ))}

      <Text style={styles.meta}>
        {TIMEZONE} · {samples.length} samples stored
        {discarded > 0 ? ` · ${discarded} outranked` : ''}
      </Text>

      <Button
        title={showRaw ? 'Show daily totals' : 'Show every sample'}
        onPress={() => setShowRaw((v) => !v)}
      />
      <Button title="Sync now" onPress={sync} />
      <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
    </View>
  )

  const empty = busy ? null : (
    <Text style={styles.empty}>
      Nothing yet. Grant Health access when prompted, then pull to refresh.
      {'\n\n'}
      An empty list is not proof of a bug: HealthKit does not report read
      denials, so a declined metric looks the same as one with no data.
    </Text>
  )

  if (showRaw) {
    return (
      <FlatList
        data={samples}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={sync} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.metric}>{item.metric}</Text>
            <Text style={styles.value}>{format(item.value, item.unit)}</Text>
            <Text style={styles.meta}>
              {new Date(item.effective_start).toLocaleString()}
            </Text>
            <Text style={styles.meta}>
              {item.origin_model ?? 'unknown device'}
              {item.origin_name ? ` · ${item.origin_name}` : ''}
            </Text>
          </View>
        )}
      />
    )
  }

  return (
    <FlatList
      data={daily}
      keyExtractor={(r) => `${r.metric}:${r.local_day}`}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={sync} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.metric}>{item.metric}</Text>
          <Text style={styles.value}>{format(item.value, item.unit)}</Text>
          <Text style={styles.meta}>{item.local_day}</Text>
          {/*
            Which device won, and how many samples went into the figure.
            If this says "Watch" while the raw list also shows iPhone rows
            for the same day, precedence is doing its job.
          */}
          <Text style={styles.meta}>
            {item.origin_model ?? 'unknown device'} · {item.sample_count}{' '}
            {item.sample_count === 1 ? 'sample' : 'samples'}
          </Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  header: { gap: 8, marginBottom: 16 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#8884',
  },
  metric: { fontSize: 13, opacity: 0.6 },
  value: { fontSize: 18, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, opacity: 0.5 },
  error: { color: '#c0392b' },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40, lineHeight: 20 },
})
