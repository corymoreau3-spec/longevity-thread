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

type Row = {
  id: string
  metric: string
  effective_start: string
  effective_end: string
  value: number
  unit: string
  origin_name: string | null
  origin_device: string | null
}

export default function Observations() {
  const [rows, setRows] = useState<Row[]>([])
  const [outcomes, setOutcomes] = useState<readonly SyncOutcome[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // RLS scopes this to the signed-in patient's own rows.
    const { data, error } = await supabase
      .from('observations')
      .select(
        'id, metric, effective_start, effective_end, value, unit, origin_name, origin_device',
      )
      .is('deleted_at', null)
      .order('effective_start', { ascending: false })
      .limit(100)

    if (error) setError(error.message)
    else setRows((data ?? []) as Row[])
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
    // Background delivery keeps this current after the first foreground run.
    void startObservers()
  }, [sync])

  const failures = outcomes.filter((o) => o.error)

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={sync} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          {busy ? <ActivityIndicator /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {failures.map((f) => (
            <Text key={f.metric} style={styles.error}>
              {f.metric}: {f.error}
            </Text>
          ))}
          <Button title="Sync now" onPress={sync} />
          <Button
            title="Sign out"
            onPress={() => supabase.auth.signOut()}
          />
        </View>
      }
      ListEmptyComponent={
        busy ? null : (
          <Text style={styles.empty}>
            No observations yet. Grant Health access when prompted, then pull
            to refresh.
          </Text>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.metric}>{item.metric}</Text>
          <Text style={styles.value}>
            {item.value} {item.unit}
          </Text>
          <Text style={styles.meta}>
            {new Date(item.effective_start).toLocaleString()}
          </Text>
          {/*
            Origin is shown rather than aggregated. The same activity
            arrives from the Watch, the phone and third-party apps, and no
            source-precedence rule has been chosen yet — summing steps here
            would triple-count them.
          */}
          <Text style={styles.meta}>
            {item.origin_name ?? item.origin_device ?? 'unknown source'}
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
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
})
