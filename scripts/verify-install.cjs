// Launches an installed/unpacked SymptoPage.exe against a disposable data folder
// and checks what it shows. Used for release checks (WINDOWS_SETUP_RU.md §6).
//   node scripts/verify-install.cjs <exe> <dataDir> seed-v040   (drive 0.4.0: create visit + event)
//   node scripts/verify-install.cjs <exe> <dataDir> expect-migrated
//   node scripts/verify-install.cjs <exe> <dataDir> expect-empty
const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const [exe, dataDir, mode] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const app = await electron.launch({ executablePath: exe, env: { ...process.env, SYMPTOPAGE_TEST_DATA: dataDir } });
  const page = await app.firstWindow();
  const version = await app.evaluate(({ app }) => app.getVersion());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.waitForSelector("main h1, h1", { timeout: 20000 });
    if (mode === "seed-v040") {
      await page.locator("[name=specialist]").selectOption("neurologist");
      await page.locator("[name=date]").fill("2027-02-01");
      await page.locator("[name=reason]").fill("TEST upgrade reason");
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "!!! Now!" }).click();
      await page.getByLabel("Dizziness", { exact: true }).check();
      await page.getByPlaceholder("Add a note (optional)").fill("TEST note before upgrade ąę");
      await page.getByRole("button", { name: "Save observation", exact: true }).click();
      await page.waitForTimeout(500);
    } else if (mode === "expect-migrated") {
      await page.getByRole("heading", { name: "TEST upgrade reason" }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Symptom journal" }).click();
      await page.getByText("TEST note before upgrade ąę").waitFor({ timeout: 10000 });
      const backups = fs.readdirSync(path.join(dataDir, "backups"));
      if (!backups.some((b) => b.includes("pre-migration-v1"))) throw new Error("no pre-migration backup");
    } else if (mode === "expect-empty") {
      await page.getByRole("heading", { name: "Record symptoms. Show them to your doctor." }).waitFor({ timeout: 10000 });
    } else throw new Error("unknown mode");
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    console.log(`OK ${mode} version=${version}`);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error("FAIL", mode, e.message);
  process.exit(1);
});
