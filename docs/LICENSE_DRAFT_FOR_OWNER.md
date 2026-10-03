# ⚠️ DRAFT — NOT IN EFFECT ⚠️

> This file is a **draft prepared for the repository owner**. It grants nothing to anyone.
> No licence applies to SymptoPage until the owner commits a real `LICENSE` file at the
> repository root. See `LICENSE_STATUS.md`.

Fill in `<COPYRIGHT HOLDER>` and `<YEAR>` and pick **one** option.

## Option A — keep all rights reserved (proprietary)

Create `LICENSE` with:

```
Copyright (c) <YEAR> <COPYRIGHT HOLDER>. All rights reserved.

This software and its source code are proprietary. No permission is granted to
copy, modify, distribute or use it, except as agreed in writing with the
copyright holder. Third-party components are licensed separately (NOTICE.md).
```

Suitable if SymptoPage will be sold, distributed through the App Store, or kept closed.

## Option B — MIT (permissive open source)

Use the unmodified MIT text from https://opensource.org/license/mit with
`Copyright (c) <YEAR> <COPYRIGHT HOLDER>`. Anyone may reuse the code, including commercially.

## Option C — Apache-2.0 (permissive, with patent grant)

Use the unmodified text from https://www.apache.org/licenses/LICENSE-2.0.txt and add a
`NOTICE` line `SymptoPage — Copyright <YEAR> <COPYRIGHT HOLDER>`.

## Option D — MPL-2.0 (file-level copyleft)

Use https://www.mozilla.org/en-US/MPL/2.0/. Changes to SymptoPage files must stay open;
combining with closed code is allowed.

## Before committing any option

- [ ] Copyright holder name confirmed.
- [ ] Colleague's written permission for the interface design.
- [ ] Logo owner's permission for app icon / installer / store use.
- [ ] `package.json` → add `"license": "<SPDX id>"` (or `"UNLICENSED"` for option A).
- [ ] Update `NOTICE.md` and the About screen text (`settings.licences` in `core/i18n.js`).
