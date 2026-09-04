# TW-SPEC-DASH-001 — Patient Dashboard Status Surface

**Project:** Longevity Thread (Thrivewell Wellness + Aesthetics)
**Status:** Build spec — implement as written
**Owner:** Cory · Clinical sign-off: Holly
**Depends on:** migration 001 (observation schema, dedup, sync anchors, RLS), migration 002 (panel-scoped clinician access, wear-time coverage, pre-visit brief)

---

## 0. What this replaces

The dashboard does **not** display a composite health score. It displays per-domain status, a marker count, and marker-level deltas between draws. This was a deliberate decision, not an omission. Do not reintroduce a score, an index, a percentage, a letter grade, a "biological age," or any other single scalar summarizing health.

Rationale, so it isn't re-litigated by a future agent or contributor:

1. **Independent review.** A weighted composite cannot be independently reviewed by a clinician or patient, which is the criterion the CDS positioning rests on. Every value on the dashboard must trace to an observation row, a reference range, and the version of the range set applied.
2. **No validation.** No outcome-linked validation exists for any arbitrary weighting of these markers. Thrivewell's own protocol series (TW-PROT series) explicitly criticizes unvalidated composite indices; shipping one would be internally inconsistent.
3. **Covariance.** Weighted sums assume independent inputs. LDL-C, non-HDL-C, apoB and triglycerides covary; a naive sum weights lipids three or four times.
4. **Non-monotonicity.** Ferritin, TSH, sodium, B12 and others are U-shaped. There is no coherent linear "better/worse" axis for them.
5. **Noise.** On a twice-annual draw cadence, movement in a composite is dominated by analytical and biological variability, and reads to the patient as progress.

---

## 1. Hard prohibitions

These are architectural invariants. A change request that violates one of these needs Cory's explicit sign-off, not an inline judgment call.

- **No numeric aggregate score.** No view, function, RPC, or client-side computation may produce a single number representing overall health, overall risk, or overall domain quality. Counts of markers are permitted; weighted or normalized scores are not.
- **No model in the classification path.** Classification is deterministic SQL. The AI guide *reads* classification output and explains it. It never produces, adjusts, overrides, or re-describes a classification in different terms.
- **No path from classification to therapy.** No column, view, or response body may map a classification, domain, or panel tier to a specific supplement, dose, prescription, or protocol. Domain status may link to clinician-authored educational content and to "save this question for Holly."
- **Wearable metrics stay off the lab surface.** HRV SDNN, RHR, sleep duration, steps and VO2 max do not enter domain status, the marker count, or any lab view. They have a different cadence, different reliability, and are vendor-derived. Separate surface, separate query path.
- **No silent reclassification.** Changing the active reference range set must never mutate the classification of a historical observation. Historical rows are pinned to the range set version in force when they were classified.
- **No unit coercion.** A unit mismatch between an observation and its reference range raises. It does not convert, guess, or fall through to `not_classified` silently.

---

## 2. Task 0 — diagnostic before any DDL

Do not write migration SQL until this is answered in the session and recorded in the PR description:

1. List the current schema: `list_tables` on `public` and any clinical schema. Report the observation table's actual name, PK, and columns.
2. How are reference ranges stored today — inline on the observation row, a separate table, application constants, or not at all? The answer determines whether §3.1 is a new table or a migration of existing data.
3. Confirm the marker identifier in use (LOINC, Quest code, internal slug) and whether it is stable across Quest and Rupa-routed results.
4. Resolve the outstanding `wearable_data` table question — confirm it is *not* referenced by anything in this spec's path, and note whether it is being kept or superseded.
5. Report the existing RLS policy shape on the observation table so §7 extends it rather than duplicating it.

---

## 3. Data model

Illustrative DDL. Reconcile names and types against what Task 0 finds; do not create a parallel observation table.

### 3.1 Versioned reference ranges

```sql
create table reference_range_set (
  id              uuid primary key default gen_random_uuid(),
  version         text not null unique,        -- e.g. 'tw-2026.1'
  source_note     text not null,               -- provenance of the range logic
  effective_from  date not null,
  is_active       boolean not null default false,
  created_at      timestamptz not null default now()
);

-- exactly one active set
create unique index reference_range_set_one_active
  on reference_range_set (is_active) where is_active;

create table reference_range (
  id              uuid primary key default gen_random_uuid(),
  range_set_id    uuid not null references reference_range_set(id) on delete restrict,
  marker_code     text not null,
  unit            text not null,
  sex             text,                        -- null = any
  age_min         int,
  age_max         int,
  direction       text not null
                  check (direction in ('lower_better','higher_better','target_window')),
  optimal_low     numeric,
  optimal_high    numeric,
  borderline_low  numeric,
  borderline_high numeric,
  unique (range_set_id, marker_code, sex, age_min, age_max)
);
```

`direction` drives interpretation:

- `lower_better` — only `optimal_high` / `borderline_high` are meaningful (apoB, hs-CRP).
- `higher_better` — only the low bounds are meaningful (VO2 max if ever lab-sourced, eGFR).
- `target_window` — both tails classify as out of range (TSH, ferritin, sodium, B12).

### 3.2 Marker → domain mapping

```sql
create table marker_domain (
  marker_code            text primary key,
  domain                 text not null
                         check (domain in ('cardiometabolic','glycemic','inflammation',
                                           'hormonal','nutrient','organ_function','gut')),
  display_name           text not null,
  display_order          int not null default 100,
  drives_domain_status   boolean not null default true,
  covariance_group       text
);
```

`drives_domain_status` and `covariance_group` exist so covarying markers are **displayed** but not counted repeatedly. Within a `covariance_group` (e.g. `lipid_particle`), at most one marker should have `drives_domain_status = true`; enforce with a check in the seed test, not a constraint.

### 3.3 Classification

```sql
create type classification as enum (
  'in_range','borderline','out_of_range','pending_review','not_classified'
);

create table observation_classification (
  observation_id   uuid primary key references <observation_table>(id) on delete cascade,
  range_set_id     uuid not null references reference_range_set(id) on delete restrict,
  reference_range_id uuid references reference_range(id),
  result           classification not null,
  classified_at    timestamptz not null default now(),
  input_envelope   jsonb not null
);
```

`input_envelope` records everything needed to reconstruct the decision without re-reading the range table: marker code, value, unit, the resolved bounds, direction, sex/age bucket used, and range set version. This is the traceability artifact — the reason a clinician can independently review any pixel on the dashboard.

`pending_review` is set by the gating rule in §6, not by the classifier.

---

## 4. Classification function

```sql
create function classify_observation(
  p_value numeric, p_unit text, p_range reference_range
) returns classification
language plpgsql immutable
```

Requirements:

- Deterministic and side-effect free. Same inputs → same output, always.
- Raise on unit mismatch between `p_unit` and `p_range.unit`. Do not convert.
- Return `not_classified` when no range row resolves for the marker/sex/age combination. Never guess a range.
- Range resolution order: most specific match wins (sex + age band → sex only → age only → generic). Ties are a seed-data error; raise.
- `target_window` classifies both tails as `out_of_range`, with the borderline bands on either side.
- Null value → `not_classified`.

Classification is written once per observation at ingest. A backfill job classifies existing rows against the currently active set. Re-running a backfill must be idempotent and must not touch rows already classified under a different `range_set_id`.

---

## 5. Read surface

Three views, then one RPC. The app calls the RPC; nothing else.

### 5.1 `patient_domain_status`

Per patient, per panel, per domain: the worst classification among markers where `drives_domain_status = true`, plus counts by classification. Severity order: `out_of_range` > `pending_review` > `borderline` > `in_range` > `not_classified`.

### 5.2 `patient_panel_summary`

Per patient, per panel: total markers resolved, count `out_of_range`, count `pending_review`, panel collection date, prior panel collection date. This is the headline. Rendered as:

> **9 of 87 markers outside your optimized range. 3 flagged for Holly's review.**

Nothing else goes in the headline. No percentage, no trend arrow on the aggregate, no color-coded overall state.

### 5.3 `marker_comparison`

Current draw vs prior draw for the same marker: both values, absolute and relative delta, both classifications, and a `range_set_changed` boolean. When `range_set_changed` is true the UI must show a note — a marker that "moved into range" because the ranges changed is not a clinical improvement and must not be presented as one. This view is the six-month side-by-side; it is the core of the product.

### 5.4 RPC

`get_dashboard(p_patient_id uuid, p_panel_id uuid default null)` returns domain status, panel summary, and comparison rows in one payload. Returns the most recent released panel when `p_panel_id` is null.

---

## 6. Review gating

Whether results are visible before Holly reviews them is an **open decision** (§9). Build the mechanism regardless:

- Panels carry a release state. Unreleased panels return `pending_review` for every classification through the RPC and expose no values.
- The gate is enforced in the RPC and in RLS, not in the client.
- The pre-visit AI brief table (migration 002) reads the ungated classification. Clinician access is not affected by patient-facing gating.

---

## 7. RLS

Extend existing policies; do not write new ones from scratch.

- Patients read their own classifications, subject to §6 gating.
- Clinicians read within their existing panel scope from migration 002.
- `reference_range_set` and `reference_range` are readable by authenticated users, writable only by service role. Range sets are clinical configuration and change through migration, not through the app.
- `observation_classification` is service-role write only. Nothing in the client path writes a classification.

---

## 8. Acceptance criteria

Write these as tests. They are the spec.

1. **Determinism.** Classifying the same fixture set twice produces byte-identical results.
2. **Version pinning.** Activate a new range set, re-run the backfill, assert zero historical `observation_classification` rows changed `result` or `range_set_id`.
3. **U-shaped markers.** TSH at 0.2 and at 8.0 both classify `out_of_range`; 2.0 classifies `in_range`.
4. **Unit mismatch raises.** An observation in nmol/L against a mg/dL range raises; it does not classify.
5. **No range, no guess.** A marker with no matching range row returns `not_classified` and is excluded from domain status and from the headline count.
6. **Covariance.** A panel with LDL-C, apoB, non-HDL-C and TG all out of range increments the cardiometabolic out-of-range count by one per `covariance_group`, not once per marker.
7. **No aggregate score exists.** A repo-wide grep for score/index/grade/rating in the migration and RPC path returns nothing that produces a scalar over multiple markers. Keep this test; it is the guard on §1.
8. **Wearables absent.** No wearable metric identifier appears in any view or RPC defined by this spec.
9. **Gating.** An unreleased panel returns no values and no classifications through the patient RPC, and full data through the clinician path.
10. **RLS.** Patient A cannot read patient B's classifications under any query shape, including via the comparison view.

---

## 9. Open decisions — Cory

These block final behavior, not the schema. Build the mechanism, leave the switch unset.

1. **Gating.** Are results visible to the patient before Holly's review, or held? Affects §6 default.
2. **Borderline band width.** Fixed percentage of the optimal bound, per-marker authored, or no borderline band at launch (binary in/out).
3. **Launch range set.** Confirm the Function-mirroring tighter ranges are what `tw-2026.1` encodes, and record the provenance in `source_note` in a form Holly will sign.
4. **Not-classified display.** Show markers with no range as "measured, no optimized range defined," or hide them.

---

## 10. Suggested task sequence for Claude Code

1. Task 0 diagnostic (§2). Report findings, do not write SQL yet.
2. Migration: reference range tables, marker_domain, classification enum and table. No data.
3. Seed `tw-2026.1` and `marker_domain` from the current panel definition. Flag every marker where the range or the domain assignment is a judgment call — that list goes to Holly.
4. `classify_observation` function plus unit tests (§8.1, 8.3, 8.4, 8.5).
5. Ingest hook and idempotent backfill. Verify §8.2.
6. Views and RPC (§5), then RLS (§7).
7. Remaining acceptance tests (§8.6–8.10).
8. Client: domain list, domain detail, headline count, comparison view.

Stop and report between 3 and 4 — the seed data is where clinical judgment enters and it needs Holly before anything is built on top of it.

---

*Thrivewell Wellness + Aesthetics · Mount Juliet, Tennessee · TW-SPEC-DASH-001 v1.0 · Confidential.*
