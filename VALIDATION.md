# Validation — 0.5.0 (2026-10-03)

Host: Windows 10 Pro 19045 x64 with WSL1. Electron work ran **on Windows** (portable Node 24.9.0, pnpm 11.19.0, Electron 44.5.1). Linux runs used Node 22.23.

## Automatic checks

| Suite | Count | Linux | Windows 10 |
|---|---|---|---|
| `tests/core.test.mjs` — model, migration, multiple doctors, shared links, stages, outcomes, courses, idempotent doses, reminders, views | 18 | ✅ | ✅ |
| `tests/timezone.test.mjs` — Europe/Warsaw DST (autumn, spring gap), time-zone change | 3 | ✅ | ✅ |
| `tests/persistence.test.mjs` — v0.4.0 migration and backup, damaged and newer files, recovery, failed writes, attachments, export/import/merge, repeat import | 9 | ✅ | ✅ |
| `tests/reminders.test.mjs` — private text, no repeat after restart, off and unreadable states | 4 | ✅ | ✅ |
| `tests/i18n.test.mjs` — EN/PL completeness (UI, core, iOS Swift keys), placeholders, Polish plurals | 3 | ✅ | ✅ |
| `tests/ios-fixtures.test.mjs` — iOS copies of fixtures and texts do not drift | 1 | ✅ | ✅ |
| `tests/app.spec.cjs` — Electron end-to-end: first run, 2 doctors, Now with shared links, cancel, filters (one/several), draft kept across a language switch, outcome, prescription → course → dose marked twice = 1 record, self-assessment, report preview + PDF bytes with Polish characters, restart persistence; archive + delete with consequences; v0.4.0 migration; damaged data; accessible names on all screens + Ctrl+N / Esc | 5 | — | ✅ |
| `ios/SymptoPageCore` `swift test` | 13 | ❌ not run (Swift hangs under WSL1) | — |

Total run: **38 + 5 passed, 0 failed.**

## Packaging and installation (Windows 10, this computer)

| Check | Result |
|---|---|
| `pnpm build:win` → NSIS Setup, Portable EXE, ZIP | ✅ built (unsigned) |
| Package contents (app.asar) | ✅ only `src/`, `core/`, `ui/`, `assets/`, licences — no tests, fixtures or user data |
| SHA-256 | `e0a0960106…6f12` Setup · `91c6b429ae…d703` Portable · `a354ebcac4…a6be` ZIP (full values in `dist/SHA256SUMS.txt`) |
| Upgrade: installed **0.4.0 from the GitHub release** (checksum matched), created a visit and an entry, installed 0.5.0 over it | ✅ data migrated, `pre-migration-v1` backup made, entry with Polish characters visible |
| Uninstall | ✅ program removed, data folder kept |
| Clean install of 0.5.0 + first start | ✅ empty welcome screen, version 0.5.0 |
| ZIP extracted → `SymptoPage.exe` | ✅ starts, empty welcome screen |
| Portable EXE | ✅ window "SymptoPage" opened with the test data folder (checked by process/window title; Playwright cannot attach to the portable launcher) |
| Test installs removed afterwards | ✅ no shortcut or uninstall entry left |

All checks used temporary data folders (`SYMPTOPAGE_TEST_DATA`); the real profile `%APPDATA%\SymptoPage-Windows` did not exist and was not created.

## Visual review

Screenshots of synthetic data (welcome, home, quick entry, journal with filter, medications, report, progress) and the generated PDF were reviewed. Fixed after review: a visible hidden field, a double check mark, the PDF page background, and the stage not advancing after visit results.

## Not verified (manual or device checks still needed)

- Windows toast notifications actually appearing (installed build), Focus assist, lock-screen display, sleep/resume on real hardware.
- Printing on a physical printer.
- Screen reader (Narrator/NVDA) walkthrough; 200 % text scaling; Windows High Contrast.
- Code signing (no certificate).
- iOS: compilation, Simulator, device, notifications, PDF, Windows → iOS import. Nothing on iOS has run.
- GitHub CI for this branch (no push access).

## Known limitations

- Reminders on Windows work only while the app runs; nothing is delivered when the computer is off or asleep; missed reminders are not replayed after 30 minutes.
- Portable/ZIP builds may not show notifications (by Electron's documentation, Windows needs the installer's shortcut). Not tested.
- Data is not encrypted on Windows.
- Native date inputs follow the Windows display language, not the language chosen in the app.
- Attachments are not shown on iOS; the iOS report is simpler than the Windows one.
- No OCR; no synchronisation (the backup file is copied by hand); no urgency assessment; no logo.
- Emergency numbers need re-verification before every release.
