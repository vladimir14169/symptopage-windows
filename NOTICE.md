# Third-party notices — SymptoPage 0.5.0

SymptoPage has **no runtime npm dependencies**. The desktop package contains:

| Component | Version | Licence | Where |
|---|---|---|---|
| Electron (runtime) | 44.5.1 | MIT | `LICENSE.electron.txt` in the installation folder |
| Chromium and its components (inside Electron) | bundled with Electron 44.5.1 | various (BSD-3-Clause, LGPL, MIT, …) | `LICENSES.chromium.html` in the installation folder |
| Manrope font (latin and latin-ext subsets, variable weight) | 4.504 | SIL Open Font License 1.1 | `resources/app.asar` → `ui/fonts/OFL.txt`; © 2018 The Manrope Project Authors |

Build and test tools (not shipped): electron-builder 26.15.3 (MIT), @playwright/test 1.63.0 (Apache-2.0).

## Design and brand material

- **Interface design** follows mock-ups provided by a project colleague (`zdrowo — ekran startowy`, four screens). Colours, shapes and icon outlines were re-implemented in CSS/SVG; the mock-ups' design-tool runtime is **not** included. The licence and ownership of the mock-ups have **not been confirmed** in writing — see `LICENSE_STATUS.md`.
- **Logo**: not delivered yet. The app shows the text name "SymptoPage" only. No third-party or generated logo is used.

## Emergency numbers

Numbers shown in Help were checked on 2026-10-03 against public sources listed in `docs/CLINICAL_SAFETY_REQUIREMENTS.md`. They are facts, not licensed content.
