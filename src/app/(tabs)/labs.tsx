import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'

import { ScreenHeader, StatTile } from '@/components/ScreenHeader'
import {
  fetchDashboard,
  fetchPatient,
  RESULT_LABEL,
  type Dashboard,
  type LabMarker,
} from '@/lib/health-data'
import { theme } from '@/theme'

/**
 * The panel status surface on the phone, mirroring the web dashboard
 * (TW-SPEC-DASH-001 §5).
 *
 * There is no composite score, index, percentage or grade here, and there
 * must never be one — §0 rules it out and gives five reasons. Counts of
 * markers are permitted; a single number summarising health is not.
 * Everything rendered below traces to an observation row and a reference
 * range resolved in SQL.
 */

function tone(result: string): string {
  switch (result) {
    case 'out_of_range':
      return theme.color.outOfRange
    case 'borderline':
      return theme.color.borderline
    case 'in_range':
      return theme.color.inRange
    default:
      return theme.color.textFaint
  }
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

function MarkerRow({ marker }: { marker: LabMarker }) {
  const colour = tone(marker.current_result)

  return (
    <View
      style={{
        backgroundColor: theme.color.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.border,
        padding: theme.space(4),
        marginTop: theme.space(3),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(2) }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colour,
            marginTop: 6,
          }}
        />
        <Text
          style={{ flex: 1, fontSize: theme.font.body, color: theme.color.text }}
          numberOfLines={2}
        >
          {marker.marker_name}
        </Text>
        <Text
          style={{
            fontSize: theme.font.body,
            color: colour,
            fontVariant: ['tabular-nums'],
          }}
        >
          {marker.current_value ?? '—'}
          <Text style={{ fontSize: theme.font.tiny, color: theme.color.textFaint }}>
            {marker.unit ? ` ${marker.unit}` : ''}
          </Text>
        </Text>
      </View>

      <Text
        style={{
          fontSize: theme.font.small,
          color: theme.color.textMuted,
          marginTop: theme.space(1),
          marginLeft: theme.space(4),
        }}
      >
        {RESULT_LABEL[marker.current_result] ?? marker.current_result}
        {marker.optimal_range_text ? ` · optimal ${marker.optimal_range_text}` : ''}
      </Text>

      {marker.prior_value != null ? (
        <Text
          style={{
            fontSize: theme.font.small,
            color: theme.color.textFaint,
            marginTop: 2,
            marginLeft: theme.space(4),
          }}
        >
          Was {marker.prior_value}
          {marker.prior_draw_date ? ` in ${shortDate(marker.prior_draw_date)}` : ''}
          {marker.pct_change != null
            ? ` (${marker.pct_change > 0 ? '+' : ''}${marker.pct_change}%)`
            : ''}
        </Text>
      ) : null}

      {/*
        §5.3: a marker that moved into range because the ranges changed is
        not a clinical improvement and must not be presented as one.
      */}
      {marker.range_changed ? (
        <Text
          style={{
            fontSize: theme.font.tiny,
            color: theme.color.attention,
            marginTop: theme.space(1),
            marginLeft: theme.space(4),
          }}
        >
          Compared against a different reference range than the previous draw.
        </Text>
      ) : null}
    </View>
  )
}

export default function Labs() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const patient = await fetchPatient()
      if (!patient) {
        setError('No patient record is linked to this login yet.')
        return
      }
      setName(patient.first_name)
      setData(await fetchDashboard(patient.id))
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      // Same lesson as the Today screen: never leave the spinner running on
      // a failure, or one bad request becomes a permanently stuck screen.
      setFirstLoad(false)
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const panel = data?.panel ?? null
  const markers = data?.markers ?? []

  // Findings first. A patient opening this wants the exceptions, not 126
  // rows they have to scan for the red ones.
  const findings = markers.filter(
    (m) => m.current_result === 'out_of_range' || m.current_result === 'borderline',
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.space(12) }}
        refreshControl={
          <RefreshControl refreshing={busy && !firstLoad} onRefresh={load} />
        }
      >
        <ScreenHeader
          title={name ? `Hello, ${name}` : 'Your panel'}
          meta={
            panel
              ? `Panel ${formatDate(panel.draw_date)} · ${panel.markers_total} markers`
              : undefined
          }
        >
          {panel && !panel.gated ? (
            <Text style={{ fontSize: 17, lineHeight: 25, color: theme.color.onHeader }}>
              {panel.out_of_range} of {panel.markers_resolved} markers are outside
              your optimized range.
            </Text>
          ) : panel?.gated ? (
            <Text
              style={{ fontSize: theme.font.body, lineHeight: 22, color: theme.color.onHeaderMuted }}
            >
              Your results are with your care team for review. They will appear
              here once released.
            </Text>
          ) : null}
        </ScreenHeader>

        <View style={{ paddingHorizontal: theme.space(5) }}>
          {firstLoad ? (
            <ActivityIndicator style={{ marginTop: theme.space(10) }} />
          ) : error ? (
            <Text
              style={{
                marginTop: theme.space(6),
                fontSize: theme.font.small,
                color: theme.color.attention,
              }}
            >
              {error}
            </Text>
          ) : !panel ? (
            <Text
              style={{
                marginTop: theme.space(6),
                fontSize: theme.font.body,
                color: theme.color.textMuted,
                lineHeight: 22,
              }}
            >
              No lab panels on file yet. Results appear here once your draw has
              been processed and reviewed.
            </Text>
          ) : panel.gated ? null : (
            <>
              {/* Pulled up over the header edge so the two surfaces interlock. */}
              <View
                style={{
                  flexDirection: 'row',
                  gap: theme.space(3),
                  marginTop: -theme.space(6),
                }}
              >
                <StatTile n={panel.in_range} label="In range" bar={theme.color.inRange} />
                <StatTile n={panel.borderline} label="Borderline" bar={theme.color.borderline} />
                <StatTile
                  n={panel.out_of_range}
                  label="Outside optimal"
                  bar={theme.color.outOfRange}
                />
              </View>

              {/*
                Markers with no optimized range are named rather than hidden.
                Hiding a result the patient paid for is the worse default.
              */}
              {panel.not_classified > 0 ? (
                <Text
                  style={{
                    marginTop: theme.space(3),
                    fontSize: theme.font.small,
                    color: theme.color.textMuted,
                    lineHeight: 19,
                  }}
                >
                  {panel.not_classified} further markers were measured but have no
                  optimized range defined.
                </Text>
              ) : null}

              {panel.has_interim_classification ? (
                <Text
                  style={{
                    marginTop: theme.space(2),
                    fontSize: theme.font.small,
                    color: theme.color.attention,
                  }}
                >
                  Provisional: these ranges have not yet been through clinical review.
                </Text>
              ) : null}

              <Text
                style={{
                  fontFamily: theme.font.serif,
                  fontSize: theme.font.title,
                  color: theme.color.text,
                  marginTop: theme.space(8),
                }}
              >
                Priority findings
              </Text>

              {findings.length === 0 ? (
                <Text
                  style={{
                    marginTop: theme.space(3),
                    fontSize: theme.font.body,
                    color: theme.color.textMuted,
                  }}
                >
                  Nothing outside your optimized range on this panel.
                </Text>
              ) : (
                findings.map((m) => <MarkerRow key={m.marker_name} marker={m} />)
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
