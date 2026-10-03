# Architecture — SymptoPage 0.5.0

```
┌──────────────────────────── Windows (Electron) ────────────────────────────┐
│ ui/ (renderer, sandboxed, CSP 'self')                                       │
│   js/views/*      UI components per screen (HTML strings + delegation)     │
│   js/dialogs.js   modal forms (quick entry Now/Teraz, confirm)             │
│   js/store.js     view state, drafts, command dispatch                     │
│   js/api.js       ONLY module touching window.sympto                       │
│   styles/tokens.css  design tokens (colleague's mock-ups)                  │
│   brand/brand.js  brand slot (logo pending)                                │
│        │ window.sympto.* (src/preload.cjs, contextBridge)                   │
│        ▼ ipcRenderer.invoke — sender frame & URL checked                    │
│ src/main.cjs      window, IPC handlers, dialogs, PDF/print, tray            │
│ src/persistence.mjs  records.json, backups/, attachments/, import/export   │
│ src/reminders.mjs    OS notifications (main process timer)                  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ imports (pure, no I/O)
┌────────────────────────────────▼───── core/ (shared rules, ES modules) ────┐
│ schema.js   vocabulary + emptyState()      validate.js  whole-state checks │
│ migrate.js  v1 (0.4.0) → v2                commands.js  all data changes   │
│ schedule.js planned doses, reminders       views.js     filters, stats     │
│ i18n.js     EN/PL texts                    help.js      verified contacts  │
│ triage.js   contract only, disabled        time.js      calendar helpers   │
└────────────────────────────────┬────────────────────────────────────────────┘
          generated fixtures + i18n.json (scripts/*.mjs) — same contract
┌────────────────────────────────▼──────────────── iOS (SwiftUI) ────────────┐
│ ios/SymptoPageCore (Swift package, Foundation only): Model, Validation,    │
│   Migration, Commands, Schedule, Backup, Translator — port of core/         │
│ ios/SymptoPage (app): AppModel (persistence), NotificationPlanner,         │
│   Views/* (SwiftUI), Resources/i18n.json                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Layers and rules

| Layer | Location | May do | Must not do |
|---|---|---|---|
| UI components | `ui/js/views`, `ui/js/dialogs.js`, `ios/SymptoPage/Views` | render, collect input, call commands | touch files, validate on their own, store records |
| Application services | `ui/js/store.js`, `src/main.cjs`, `ios/.../AppModel.swift` | route commands, show errors, plan reminders | invent medical meaning |
| Data model & validation | `core/schema.js`, `core/validate.js`, `core/commands.js` (+ Swift port) | the only place where records are created/changed | I/O |
| Platform adapters | `src/persistence.mjs`, `src/reminders.mjs`, `src/preload.cjs`, `NotificationPlanner.swift` | files, dialogs, notifications | business rules |
| Localisation | `core/i18n.js` → `ios/SymptoPage/Resources/i18n.json` | texts | logic |
| Design tokens | `ui/styles/tokens.css`, `Theme` in `SymptoPageApp.swift` | colours, radii, shadows | — |

## Data flow for a change

1. UI calls `change("entry.save", payload)` (`ui/js/store.js`).
2. Preload forwards to `store:change`; main checks the sender frame and URL.
3. `Persistence.apply` → `core/commands.apply` returns a **new** validated state (or throws `DataError` with a code).
4. Atomic write (tmp + fsync + rename). Only after success the in-memory state is replaced and returned with the result.
5. Reminders are re-planned; the renderer re-renders from the returned snapshot, restoring unsaved drafts.

Errors cross IPC only as codes (`INVALID_DATA` + `code`), never with record contents.

## Security (Electron)

`contextIsolation`, `sandbox`, no `nodeIntegration`, CSP `default-src 'self'` with no inline scripts or styles, navigation and new windows blocked, all permission requests denied, IPC sender validation, single instance. No network access is used: no fonts, analytics or APIs from the internet.

## Reminders

- **Windows:** `src/reminders.mjs` in the main process. The timer wakes up at the next planned dose (max 30 s) and on `resume`/`unlock-screen`. The keys of delivered reminders are stored in `reminders-state.json` (IDs and dates only), so a restart does not repeat them. Reminders older than 30 minutes are not replayed after sleep. Reminders only work while the process is running.
- **iOS:** `NotificationPlanner` schedules up to 60 local notifications by dose ID and re-plans on each change. iOS delivers them itself.

## Decisions

| Decision | Reason |
|---|---|
| Keep vanilla JS + template strings (no framework/bundler) | Matches the 0.4.0 codebase, no runtime dependencies, strict CSP works with plain files |
| Pure `core/` shared by main, renderer and tests | One set of rules; the renderer cannot write invalid data |
| Swift port instead of a JS runtime on iOS | Native SwiftUI client and a later watchOS app; contract kept by shared fixtures |
| Deterministic dose IDs `course@date Ttime` | Idempotent marking, notification de-duplication, safe merge |
| Wall-clock schedule in the current time zone | Matches how prescriptions are written ("8:00 in the morning"); documented DST behaviour |
| No OCR, no cloud, no triage | Need separate agreement / clinical validation (see CLINICAL_SAFETY_REQUIREMENTS.md) |
