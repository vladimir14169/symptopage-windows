# SymptoPage

A private, local companion for the whole observation period: **waiting for the appointment → recording symptoms → short report for the doctor → recording the prescriptions → following the course → checking the result → follow-up visit if needed.** English and Polski.

SymptoPage keeps the user's own records. It does **not** diagnose, change treatment, decide recovery or assess urgency, and nobody monitors the entries in real time.

| Platform | Status (0.5.0, 2026-10-03) |
|---|---|
| Windows 10/11 x64 (Electron) | Built and tested on Windows: 38 unit/integration tests, 5 end-to-end UI tests, installer/upgrade/portable/ZIP checks. **Unsigned.** Not published as a GitHub Release yet. |
| iPhone (SwiftUI, iOS 17+) | Source code only — **not compiled or run yet** (needs a Mac or the macOS CI workflow). See `IOS_SETUP_RU.md`. |
| Apple Watch | Architecture only (`docs/APPLE_ROADMAP.md`). |

## Features (Windows 0.5.0)

- Several doctors (specialty, optional name, clinic, note), archive without losing history, delete with an explanation of the consequences.
- Observations with independent stages: waiting → visit took place → following the plan → checking the result → completed / next visit. Multiple and follow-up visits stay linked.
- Filter "All doctors" / one / several, with the active filter always shown. Unsaved input survives filter and language changes.
- **Now / Teraz** quick entry (time of the click, editable), with optional duration, intensity, count, trigger and links to several observations. A record is counted once.
- Journal with search, symptom and date filters, and your own symptom names. Daily check-ins: a day without a record is "no record", not "no symptom".
- Visit results: notes, recommendations, when to return earlier, follow-up date, prescriptions and tests with deadlines, attached PDF/JPEG/PNG files. Each item shows its source (entered by me / copied from a document).
- Medication courses exactly as prescribed: taken / skipped / snoozed / not marked, planned vs actual time, no duplicates. Reminders keep the lock screen private by default.
- Progress: "better / no change / worse" self-assessment, charts with visible gaps, comparisons that state the amount of data.
- Doctor PDF: a summary on page 1 and the chronology as an appendix. You choose the period, observations and sections, with a preview; print is available too.
- Help: "Seek medical help earlier than your planned appointment", with verified numbers for the country you confirm. Personal urgency assessment is **not** included (see `docs/CLINICAL_SAFETY_REQUIREMENTS.md`).
- Data: schema version, migration from 0.4.0 with a backup, atomic writes, recovery of damaged files, backup export/import (merge or replace) including attachments.

No account, cloud, analytics, remote fonts or data sharing. Data is **not encrypted** on Windows.

## Documentation

| For | Document |
|---|---|
| Users (RU) | [WINDOWS_SETUP_RU.md](WINDOWS_SETUP_RU.md), [IOS_SETUP_RU.md](IOS_SETUP_RU.md), [docs/BACKUP_RU.md](docs/BACKUP_RU.md), [START_HERE_RU.md](START_HERE_RU.md) |
| Developers | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) |
| Status | [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md), [VALIDATION.md](VALIDATION.md), [CHANGELOG.md](CHANGELOG.md), [docs/AUDIT.md](docs/AUDIT.md) |
| Product / safety | [docs/CLINICAL_SAFETY_REQUIREMENTS.md](docs/CLINICAL_SAFETY_REQUIREMENTS.md), [docs/APPLE_ROADMAP.md](docs/APPLE_ROADMAP.md) |
| Legal | [LICENSE_STATUS.md](LICENSE_STATUS.md) (no licence chosen yet), [NOTICE.md](NOTICE.md) |

## Development

```sh
npx pnpm@11.19.0 install --frozen-lockfile
pnpm start
pnpm test            # node:test — core, persistence, reminders, time zones, i18n, iOS fixture drift
pnpm test:ui         # Playwright + Electron (run on Windows)
pnpm build:win       # NSIS installer, portable EXE, ZIP → dist/
pnpm export:i18n     # texts → ios/SymptoPage/Resources/i18n.json
```

Fixtures shared with iOS are created by `scripts/make-fixtures.mjs` and `scripts/make-backup-fixture.mjs`. All test data is synthetic and marked `TEST`.

## Handover — where to continue

1. **Owner decisions:** licence (`LICENSE_STATUS.md`), product name (SymptoPage vs "SymptoPad" in the mock-ups), the colleague's rights to the design, the logo.
2. **Logo** → `ui/brand/brand.js`, `assets/icon.*`, iOS AppIcon (`docs/FRONTEND_INTEGRATION.md` §2).
3. **iOS:** build on a Mac or run `.github/workflows/ios.yml`; fix compile errors; then the device tests in `IOS_SETUP_RU.md` §10.
4. **Windows:** a manual check of toast notifications and printing; a code-signing certificate; publishing v0.5.0 (needs write access).
5. **Clinical module:** only after the prerequisites in `docs/CLINICAL_SAFETY_REQUIREMENTS.md` §3 are met.
