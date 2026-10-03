# Data model — schema v2

Source of truth: `core/schema.js` + `core/validate.js` (Swift mirror: `ios/SymptoPageCore/Sources/SymptoPageCore/Model.swift`, `Validation.swift`). Example: `tests/fixtures/v2-sample.json`.

Conventions: IDs are opaque strings `[\w@:./-]{1,120}` (UUIDs for new records; 0.4.0 IDs are kept). **Instants** are ISO-8601 UTC strings (`2026-10-02T07:00:00.000Z`). **Days** are `YYYY-MM-DD` and **times** are `HH:MM` in local wall-clock time. Optional values are written as explicit `null`. Text fields are trimmed, ≤ 4000 UTF-16 units unless stated otherwise.

```
Doctor 1─* Observation 1─* Visit 1─* Prescription 0..1─* Course 1─* DoseEvent
                │  │           └─* Attachment
                │  └─* Assessment (one per day)
                └─*──*─ Entry / DailyRating (many-to-many via observationIds; [] = general record)
Observation.previousObservationId → Observation   Visit.previousVisitId → Visit
```

| Entity | Key fields | Rules |
|---|---|---|
| `settings` | `language` en/pl, `notificationsEnabled`, `notificationDetails` (default false), `country` (null until the user confirms it) | — |
| **Doctor** | `specialty` (enum) + `specialtyCustom` for `other`, `name`, `clinic`, `note`, `archivedAt` | archive hides it but keeps the history |
| **Specialty** | enum `cardiologist, neurologist, endocrinologist, orthopedist, internist, gp, other` | `other` requires `specialtyCustom` |
| **Observation** (observation period) | `doctorId`, `reason`, `questions`, `stage`, `stageHistory[{stage,at}]`, `previousObservationId`, `archivedAt` | stages `waiting, visited, treatment, followup, closed`; the last history item = current stage |
| **Visit** | `observationId`, `date`, `time?`, `kind` initial/followup, `status` planned/done/cancelled, `previousVisitId`, `outcome?` | saving outcome → `done`; a waiting observation becomes `visited` |
| Visit outcome | `notes`, `recommendations`, `returnAdvice`, `followUpDate?`, `source` user/document | — |
| **Prescription** (plan item) | `visitId`, `kind` medication/test/other, `text`, `dueDate?`, `source` | recorded as written, never parsed |
| **Course** (medication course) | `observationId`, `prescriptionId?`, `name`, `dose` (as prescribed), `instructions`, `startDate`, `endDate` or `indefinite: true`, `times[]`, `days[]` (ISO 1=Mon…7=Sun), `stoppedAt` | nothing is derived from the name |
| **DoseEvent** (intake event) | `id = courseId@date Ttime`, `scheduledDate/Time`, `status` taken/skipped/snoozed, `actualAt` (taken), `snoozedUntil` (snoozed) | missing event = "not marked yet"; marking again updates the same record |
| **Entry** (symptom record) | `symptom` (enum or `custom` + `customLabel`), `occurredAt` (event), `createdAt`, `updatedAt`, `note`, `durationMinutes?`, `intensity?` 1–4, `count?`, `trigger`, `observationIds[]` | event time ≤ now + 1 min; counted once however many links |
| **DailyRating** (daily summary) | `date`, symptom, `frequency` none/once/several, `note`, `observationIds[]` | unique per (date, symptom key) |
| **Assessment** (self-assessment) | `observationId`, `date`, `rating` better/same/worse, `note` | unique per (observation, date) |
| **Attachment** | `visitId`, `fileName`, `mime` pdf/jpeg/png, `size` ≤ 15 MB, `sha256`, `source: document`, `addedAt` | file `attachments/<id><ext>` |

## Versions and migration

| Version | Detected by | Handling |
|---|---|---|
| v1 (0.4.0) | `version: 1`, no `schemaVersion` | strict v1 check → exact byte copy `backups/<time>-pre-migration-v1.json` → migrated state written atomically. Visit ID becomes the observation ID; specialist → unnamed doctor; events → entries (click time = event and creation time); answers → daily ratings. |
| v2 | `schemaVersion: 2` | validated |
| > 2 | `schemaVersion > 2` | refused (`NEWER_SCHEMA`); the file is not changed |
| other / damaged | — | refused; file kept; user chooses: restore backup or "keep damaged file and start empty" (rename to `records.unreadable-<time>.json`) |

## Backup / exchange format (`formatVersion: 1`)

```json
{ "format": "symptopage-backup", "formatVersion": 1, "schemaVersion": 2,
  "exportedAt": "…", "app": { "platform": "windows" | "ios", "version": "0.5.0" },
  "data": { …v2 state… }, "attachments": [ { "id": "…", "data": "<base64>" | null } ] }
```

Import also accepts a bare `records.json` (v1 or v2). Attachment bytes are checked against `sha256`. **Merge**: same ID and identical → skipped; same ID with different content → the newer `updatedAt` wins (else local kept); daily ratings/assessments also match by natural key. Re-importing the same file adds nothing. **Replace**: whole state replaced. Both make an automatic safety copy first. Settings are not merged.

## Privacy

Not stored anywhere else: no logs with record contents (IPC errors carry codes only), test data is synthetic (`TEST` prefix) and created in temporary folders. **Not encrypted at rest on Windows** (the UI says so). On iOS the file uses `completeFileProtection`.
