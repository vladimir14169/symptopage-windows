// The iOS core tests use copies of the shared fixtures; they must not drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url));
test("iOS fixtures and exported texts match the Windows sources", () => {
  for (const f of ["v0.4.0-records.json", "v2-sample.json", "windows-backup.json"])
    assert.deepEqual(read(`ios/SymptoPageCore/Tests/SymptoPageCoreTests/Fixtures/${f}`), read(`tests/fixtures/${f}`), f);
  assert.deepEqual(read("ios/SymptoPageCore/Tests/SymptoPageCoreTests/Fixtures/i18n.json"), read("ios/SymptoPage/Resources/i18n.json"));
  const exported = JSON.parse(read("ios/SymptoPage/Resources/i18n.json"));
  assert.ok(Object.keys(exported.en).length > 400);
});
