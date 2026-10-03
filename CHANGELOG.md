# Changelog

## 0.5.0 — 2026-10-03 (not published)

### Added
- Data model v2: doctors, specialties, observations with stages and history, visits (initial and follow-up, linked), visit outcomes, prescriptions and tests with sources and deadlines, medication courses, dose events, symptom entries linked to several observations, daily ratings, self-assessments and attachments.
- Doctor filter: all / one / several, with the active filter shown and unsaved input preserved.
- Next useful action on the home screen; upcoming visits; stage stepper.
- Extended quick entry (duration, intensity, count, trigger, links, custom symptoms); journal search and filters; event, creation and modification times kept separately.
- Visit results screen with attachments (PDF/JPEG/PNG, ≤ 15 MB, SHA-256).
- Medication courses with taken/skipped/snoozed marks (idempotent), planned and actual time, desktop reminders (no repeats after restart, time-zone/DST rules, optional tray mode, private text by default).
- Progress: self-assessment and charts with visible gaps and stated data volume.
- Doctor PDF: page-1 summary + chronology appendix; period, observation and section options; preview.
- Help section with verified contacts for the confirmed country; urgency-assessment contract (disabled).
- Backup export/import (merge/replace, idempotent, attachments included), automatic safety copies, restore, damaged-file recovery.
- Colleague's design tokens, bundled Manrope font (OFL), keyboard shortcut Ctrl+N, focus styles, reduced motion and forced-colours support.
- iOS client sources (SwiftUI) and the `SymptoPageCore` Swift package with shared fixtures; macOS CI workflow. *Not compiled yet.*
- Documentation: setup guides (RU), architecture, data model, frontend integration, clinical safety, Apple roadmap, feature status, licence status, notices.

### Changed
- Storage schema `version: 1` → `schemaVersion: 2` with automatic migration and an exact pre-migration copy.
- The Now / Teraz button: soft coral with dark text, no "!!!" (it is not an emergency button).
- The renderer is split into views, dialogs, store and an API adapter; validation lives only in `core/`.

### Removed
- `src/store.cjs` (replaced by `src/persistence.mjs` + `core/`), `scripts/preview.cjs` (depended on it).

### Known limitations
See `VALIDATION.md` → Known limitations.

## 0.4.0 — 2026-10-03
First Windows release: one active visit, symptom events, daily check-ins, journal, PDF, EN/PL, Windows builds (unsigned).
