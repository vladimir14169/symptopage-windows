# Frontend integration guide

For a frontend developer working on SymptoPage. It covers what was taken from the colleague's mock-ups, the brand slot, and the full contract between the UI and the data layer.

## 1. Colleague's mock-ups — what was received and what was used

Received: `zdrowo — ekran startowy.html` (a design-tool bundle) with 4 screens, 390×844, Polish only. Unpacked copies are in `siteSymptoPad/ekrany/` (outside this repository): `1-ekran-powitalny`, `2-ekran-startowy`, `3-aktywna-obserwacja`, `4-dodaj-wizyte` plus `assets/` (`dc-runtime.js` design-tool runtime, two Manrope WOFF2 subsets).

| Element in the mock-ups | Decision | Why |
|---|---|---|
| Palette `#167374 / #8ED6CF / #CDEDE9 / #EAF7F5 / #0F2A2E`, rounded cards, soft shadows, pill buttons/chips | **Kept** as tokens in `ui/styles/tokens.css` and `Theme` (iOS) | Matches the required direction (calm cyan surfaces, teal actions) |
| Welcome screen (hero + 3 feature rows + main button) | **Kept** as the first-run screen (`views/home.js` → `welcome()`), translated to EN/PL | First-run without demo data |
| "Add a doctor's visit" card with specialist chips and date | **Kept**, extended with "Other…" + custom name, optional doctor name and reason | Multiple doctors and own specialties |
| Countdown card "47 days" | **Kept** on the observation card | — |
| Daily question with Nie / Raz / Kilka | **Kept** as the daily check-in; selected state adds ✓ + border (not colour only) | Accessibility |
| Swipe between visit cards (screens 3–4) | **Replaced** by the doctor filter (All / one / several) and a list of observation cards | Swipe hides other doctors and is hard to use with a keyboard or several doctors at once |
| `!!! Teraz!` red `#D32F2F` button | **Changed** to a coral `#FF9B82` pill with dark text, a pen icon and the label "Now / Teraz"; hint: "Not an emergency call" | Must not look like an emergency button |
| "Tętno spocz.: 69" (resting heart rate) | **Not used** | No sensor integration; a made-up value would be misleading |
| "Witaj Kasia!", fixed dates | **Not used** | Mock data |
| Heart-and-pulse icon labelled "Logo SymptoPad" | **Not used as a logo**; the line style was reused for UI icons | The official logo was not delivered |
| Name "SymptoPad" | **SymptoPage** is used everywhere | Product name in the task and repository. **Needs confirmation from the owner.** |
| Bottom tab bar (mobile) | Sidebar on desktop; `TabView` on iOS | Platform conventions |
| `dc-runtime.js` | **Not included** | Design-tool runtime, not app code; unknown licence |
| Manrope font | **Included** (`ui/fonts`, OFL 1.1, `OFL.txt` beside it) | Licence permits bundling; works offline under CSP |

**Rights:** the licence/ownership of the mock-ups is not confirmed (see `LICENSE_STATUS.md`).

### Contrast (WCAG 2.x)

| Pair | Ratio |
|---|---|
| white on teal `#167374` (primary buttons, selected chips) | 5.62:1 |
| ink `#0F2A2E` on chip `#CDEDE9` | 12.14:1 |
| muted `#3F5559` on background `#EAF7F5` | 7.20:1 |
| ink on coral `#FF9B82` (Now / Teraz) | 7.38:1 |
| teal text on background | 5.11:1 |

Focus: 3px `#0B4F9C` outline on every focusable element. `prefers-reduced-motion` disables transitions, and `forced-colors` (Windows High Contrast) maps the selected states to system colours. Sizes are in `rem`, so Windows text scaling and Ctrl+/− work. Keyboard: Tab through everything, Ctrl+N opens quick entry, Esc closes dialogs.

## 2. Brand assets — integration contract (logo pending)

**Status: the final brand integration has NOT been done.** The text "SymptoPage" is shown instead of a logo.

When the logo arrives:

1. Put `logo.svg` (preferred) or a PNG of at least 512×512 px into `ui/brand/`. Set `logo` and `logoAspect` in `ui/brand/brand.js`. The sidebar (40 px high) and About (96 px) keep the aspect ratio and do not upscale beyond the native size.
2. Windows icon: produce `assets/icon.ico` (16, 24, 32, 48, 64, 128, 256 px layers) and `assets/icon.png` (512 px) from the vector logo. Do not upscale a small raster; if only a small raster exists, document the quality limit in `NOTICE.md`.
3. Installer: electron-builder uses `assets/icon.ico` for the setup EXE and shortcuts. Optional: `build.nsis.installerSidebar` (164×314 BMP).
4. iOS: add a 1024×1024 PNG without transparency to `ios/SymptoPage/Assets.xcassets/AppIcon.appiconset` and reference it in `Contents.json`.
5. Record the source, owner and licence of the logo in `NOTICE.md`.

The current `assets/icon.*` files are the 0.4.0 icons (author unknown). They are not the SymptoPage logo.

## 3. Data contract (Windows renderer)

The renderer gets **snapshots** and sends **commands**. It never edits records directly and never touches files.

```js
import { api } from "./api.js";        // the only module using window.sympto
const r = await api.read();             // { ok, value: Snapshot } | { ok:false, error, code }
```

`Snapshot = { state, problem: {code}|null, migration: {...}|null, backups: [{name,size}], prefs: {runInBackground}, app: {version, electron, notifications} }`. `state` follows `docs/DATA_MODEL.md`. It is `null` when `problem` is set.

### Commands — `api.change(command, payload)` → `{ ok, value: Snapshot & { result } }`

| Command | Payload | `result` |
|---|---|---|
| `settings.update` | any of `language`, `notificationsEnabled`, `notificationDetails`, `country` | — |
| `doctor.save` | `id?`, `specialty`, `specialtyCustom`, `name`, `clinic`, `note` | id |
| `doctor.archive` / `observation.archive` | `id`, `archived: bool` | — |
| `doctor.delete` / `observation.delete` | `id` (call `api.impact(kind,id)` first and show the counts) | `{removedAttachments}` |
| `observation.save` | `id?`, `doctorId`, `reason`, `questions`, `visitDate?`, `visitTime?`, `previousObservationId?` | id |
| `observation.stage` | `id`, `stage` | — |
| `visit.save` | `id?`, `observationId`, `date`, `time?`, `status?`, `previousVisitId?` | id |
| `visit.outcome` | `id`, `notes`, `recommendations`, `returnAdvice`, `followUpDate?`, `source` | — |
| `visit.delete` | `id` | `{removedAttachments}` |
| `prescription.save` / `.delete` | `id?`, `visitId`, `kind`, `text`, `dueDate?`, `source` | id |
| `course.save` | `id?`, `observationId`, `prescriptionId?`, `name`, `dose`, `instructions`, `startDate`, `endDate|null`, `indefinite`, `times[]`, `days[]` | id |
| `course.stop` / `course.delete` | `id`, `stopped` | — |
| `dose.mark` | `courseId`, `date`, `time`, `status` taken/skipped/snoozed, `actualAt?`, `snoozeMinutes?` (5–240) | dose id |
| `dose.clear` | `id` | — |
| `entry.save` / `entry.delete` | `id?`, `symptom`, `customLabel`, `occurredAt`, `note`, `durationMinutes?`, `intensity?`, `count?`, `trigger`, `observationIds[]` | id |
| `daily.save` / `daily.delete` | `date`, `symptom`, `customLabel`, `frequency`, `note`, `observationIds?` | id |
| `assessment.save` | `observationId`, `date`, `rating`, `note` | id |
| `attachment.delete` | `id` | — |

Other bridge calls: `impact(kind,id)`, `setPrefs({runInBackground})`, `showData()`, `exportBackup()`, `importBackup("merge"|"replace")` → `{…snapshot, report}`, `restoreBackup(name)`, `startEmpty()`, `addAttachment(visitId)` (opens a file dialog in main), `openAttachment(id)`, `exportPDF(fileName)`, `print()`, `testNotification(title, body)`, `onNavigate(fn)`.

### Errors

Never thrown to the UI. `{ ok:false, error, code }`:

| `error` | Meaning | UI text key |
|---|---|---|
| `INVALID_DATA` | input rejected by validation (`code` e.g. `ENTRY_TIME`, `COURSE_END`) | `error.invalid` |
| `STORE_UNREADABLE` | data could not be opened; show the recovery screen | `error.unreadable` |
| `SAVE_FAILED` | write failed; the previous data is unchanged | `error.save` |
| `PRINT_FAILED`, `OPEN_FAILED` | printing / opening an attachment failed | `error.print`, `error.open` |

`ui/js/store.js#change()` shows these as a toast and returns `null`.

### Saving and unsaved input

Every successful command is already on disk when the promise resolves; there is no separate "save". Forms on pages must have `data-draft="<unique key>"`. `render()` stores their field values before re-rendering (filter switch, language change) and restores them afterwards. Modal dialogs are not re-rendered while open.

### Uploads

Attachments are chosen in a native dialog opened by the main process: PDF, JPEG or PNG, ≤ 15 MB. The UI never gets file paths. Files are copied into the data folder and verified by SHA-256 when imported. No OCR — a document's text is never read.

### Localisation

All texts are in `core/i18n.js` as `key: [English, Polski]`. Plural entries are objects with Intl plural categories (`one/other` for EN; `one/few/many/other` for PL) selected by `{n}`. Use `t("key", {vars})` from `ui/js/format.js`; dates go through `Intl` (`fmtDay`, `fmtDateTime`). `tests/i18n.test.mjs` fails if a key used in `ui/js`, `core` or the iOS Swift code is missing or if the two languages differ in placeholders. After a change run `pnpm export:i18n` for iOS.

### Adding a screen

Create `ui/js/views/<name>.js` exporting `render()` and optionally `actions`, `changes`, `inputs`, `submits` (keyed by `data-action`, `data-change`, `data-input`, `data-submit`). Register it in `ui/js/app.js` (`pages`, `NAV`), add `nav.<name>` / `page.<name>` texts, and add a Playwright step to `tests/app.spec.cjs`.
