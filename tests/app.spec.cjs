// End-to-end Electron tests. Each test uses its own temporary data folder with
// synthetic TEST data; nothing touches the real user profile.
const { test, expect, _electron: electron } = require("@playwright/test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function launch(dir) {
  const app = await electron.launch({ args: [path.resolve(__dirname, "..")], env: { ...process.env, SYMPTOPAGE_TEST_DATA: dir } });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.locator("main h1").waitFor();
  return { app, page, errors };
}
const records = async (dir) => JSON.parse(await fs.readFile(path.join(dir, "records.json"), "utf8"));
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inDays = (n) => localDay(new Date(Date.now() + n * 86400000));
// Screenshots of synthetic TEST data for visual review (test-results/ is not committed).
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, "..", "test-results", "screens", name + ".png"), fullPage: true });

test.describe.configure({ mode: "serial" });
let dir;
test.beforeAll(async () => (dir = await fs.mkdtemp(path.join(os.tmpdir(), "symptopage-ui-"))));
test.afterAll(async () => fs.rm(dir, { recursive: true, force: true }));

test("first run, several doctors, Now with shared links, filters, drafts, doses, report, restart", async () => {
  let { app, page, errors } = await launch(dir);
  try {
    // Empty first run: no demo data.
    await expect(page.getByRole("heading", { name: "Record symptoms. Show them to your doctor." })).toBeVisible();
    await expect(page.getByText("There is no sample data.")).toBeVisible();
    await shot(page, "01-welcome");

    // First doctor + observation + visit.
    await page.locator("select[name=specialty]").selectOption("cardiologist");
    await page.getByLabel("Doctor's name (optional)").fill("TEST Dr Nowak");
    await page.getByLabel("Visit date").fill(inDays(10));
    await page.getByLabel("Main reason for the visit").fill("TEST palpitations in the evening");
    await page.getByRole("button", { name: "Start observation" }).click();
    await expect(page.getByRole("heading", { name: "TEST palpitations in the evening" })).toBeVisible();

    // Second doctor with a custom specialty.
    await page.getByRole("button", { name: "Doctors & visits" }).click();
    await page.getByRole("button", { name: "Add doctor" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select[name=specialty]").selectOption("other");
    await dialog.getByLabel("Specialty name").fill("TEST Allergist");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Add observation" }).last().click();
    await dialog.getByLabel("Main reason for the visit").fill("TEST rash");
    await dialog.getByLabel("Visit date").fill(inDays(20));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "TEST rash" })).toBeVisible();

    // Now / Teraz: one record linked to both observations.
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Now", exact: true }).first().click();
    await dialog.getByRole("radio", { name: "Dizziness" }).check();
    await dialog.getByLabel("Note (optional)").fill("TEST zażółć gęślą jaźń <b>x</b>");
    await dialog.getByText("More details").click();
    await dialog.getByRole("radio", { name: "Moderate" }).check();
    for (const box of await dialog.getByRole("checkbox").all()) await box.check();
    await shot(page, "02-now-dialog");
    await dialog.getByRole("button", { name: "Save observation" }).click();
    await expect(dialog).not.toBeVisible();
    let saved = await records(dir);
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0].observationIds).toHaveLength(2);
    expect(saved.entries[0].intensity).toBe(2);

    await shot(page, "03-home");
    // Cancel leaves no record.
    await page.getByRole("button", { name: "Now", exact: true }).first().click();
    await dialog.getByRole("radio", { name: "Fatigue" }).check();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await records(dir)).entries).toHaveLength(1);

    // Filter: single doctor, then several; the shared entry appears once each time.
    await page.getByRole("button", { name: "Symptom journal" }).click();
    await page.locator(".filters").getByRole("button", { name: /Cardiologist/ }).click();
    await expect(page.locator(".active-filter")).toContainText("Cardiologist · TEST Dr Nowak");
    await expect(page.locator(".entries .entry")).toHaveCount(1);
    await page.getByLabel("Select several").check();
    await page.locator(".filters").getByRole("button", { name: /TEST Allergist/ }).click();
    await expect(page.locator(".active-filter")).toContainText("TEST Allergist");
    await expect(page.locator(".entries .entry")).toHaveCount(1);
    await expect(page.getByText("TEST zażółć gęślą jaźń <b>x</b>")).toBeVisible();
    await shot(page, "04-journal-filtered");
    await page.getByRole("button", { name: "All doctors" }).click();

    // Unsaved input survives a language switch (re-render).
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Visit results" }).first().click();
    await page.getByLabel("My notes from the visit").fill("TEST unsaved draft");
    await page.locator("#language").selectOption("pl");
    await expect(page.getByLabel("Moje notatki z wizyty")).toHaveValue("TEST unsaved draft");
    await page.locator("#language").selectOption("en");
    await page.getByRole("button", { name: "Save visit results" }).click();
    await expect(page.locator(".badge.done").first()).toBeVisible();

    // Prescription → course → dose marked twice = one record.
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await dialog.getByLabel("What was prescribed").fill("TEST Medicine 5 mg in the morning");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Set up reminders" }).click();
    await dialog.getByLabel("Medication", { exact: true }).fill("TEST Medicine");
    await dialog.getByLabel("Dose as prescribed").fill("5 mg");
    await dialog.getByLabel("Start date").fill(inDays(-2));
    await dialog.getByLabel("No end date (doctor did not set one)").check();
    await dialog.getByLabel("Time 1").fill("00:01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Medications" }).click();
    await page.locator(".doses").getByRole("button", { name: "Taken" }).click();
    await expect(page.locator(".doses .status")).toContainText("taken at");
    await page.locator(".doses").getByRole("button", { name: "Taken" }).click();
    await dialog.getByRole("button", { name: "Taken" }).click();
    saved = await records(dir);
    expect(saved.doseEvents).toHaveLength(1);
    expect(saved.doseEvents[0].scheduledTime).toBe("00:01");
    await shot(page, "05-medications");

    // Progress self-assessment.
    await page.getByRole("button", { name: "Progress" }).click();
    await page.getByRole("button", { name: "Better" }).first().click();
    await expect(page.getByRole("button", { name: "Better" }).first()).toHaveAttribute("aria-pressed", "true");
    await shot(page, "07-progress");

    // Report preview + PDF bytes, Polish characters included.
    await page.getByRole("button", { name: "Report for doctor" }).click();
    const preview = page.locator(".report-preview");
    await expect(preview).toContainText("Summary of my observations");
    await expect(preview).toContainText("Dizziness");
    await expect(preview).toContainText("TEST Medicine");
    await expect(preview).toContainText("zażółć gęślą jaźń");
    await shot(page, "06-report");
    const pdf = await app.evaluate(async ({ BrowserWindow }) => Array.from(await BrowserWindow.getAllWindows()[0].webContents.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true })));
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    await fs.writeFile(path.join(__dirname, "..", "test-results", "screens", "report-test.pdf"), Buffer.from(pdf));

    // Language persists; data survives restart.
    await page.locator("#language").selectOption("pl");
    await expect(page.getByRole("button", { name: "Teraz", exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
    await app.close();
    ({ app, page, errors } = await launch(dir));
    await expect(page.getByRole("button", { name: "Teraz", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Dziennik objawów" }).click();
    await expect(page.getByText("TEST zażółć gęślą jaźń <b>x</b>")).toBeVisible();
    expect((await records(dir)).settings.language).toBe("pl");
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("archiving keeps history; deleting a doctor explains consequences and keeps entries", async () => {
  const { app, page, errors } = await launch(dir);
  try {
    await page.locator("#language").selectOption("en");
    await page.getByRole("button", { name: "Doctors & visits" }).click();
    const allergist = page.locator("article.doctor", { hasText: "TEST Allergist" });
    await allergist.getByRole("button", { name: "Archive", exact: true }).first().click();
    await expect(page.locator("article.doctor", { hasText: "TEST Allergist" })).toHaveCount(0);
    await page.getByLabel("Show archived").check();
    await page.locator("article.doctor", { hasText: "TEST Allergist" }).getByRole("button", { name: "Delete" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 observation(s)");
    await expect(dialog).toContainText("Symptom records are kept");
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    const saved = await records(dir);
    expect(saved.doctors).toHaveLength(1);
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0].observationIds).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("v0.4.0 data is migrated on first start with a safety copy", async () => {
  const old = await fs.mkdtemp(path.join(os.tmpdir(), "symptopage-v040-"));
  try {
    await fs.copyFile(path.join(__dirname, "fixtures", "v0.4.0-records.json"), path.join(old, "records.json"));
    const { app, page, errors } = await launch(old);
    try {
      await expect(page.locator("#notice")).toContainText("Dane zaktualizowano");
      await expect(page.getByRole("heading", { name: /TEST — synthetic fixture/ })).toBeVisible();
      const backups = await fs.readdir(path.join(old, "backups"));
      expect(backups.some((b) => b.includes("pre-migration-v1"))).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  } finally {
    await fs.rm(old, { recursive: true, force: true });
  }
});

test("damaged data shows recovery options and is never overwritten", async () => {
  const bad = await fs.mkdtemp(path.join(os.tmpdir(), "symptopage-bad-"));
  try {
    await fs.writeFile(path.join(bad, "records.json"), "{ TEST damaged");
    const { app, page } = await launch(bad);
    try {
      await expect(page.getByRole("heading", { name: "Your data could not be opened" })).toBeVisible();
      await expect(page.getByText("NOT_JSON")).toBeVisible();
      expect(await fs.readFile(path.join(bad, "records.json"), "utf8")).toBe("{ TEST damaged");
      await page.getByRole("button", { name: "Keep damaged file and start empty" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Keep damaged file and start empty" }).click();
      await expect(page.getByRole("heading", { name: "Record symptoms. Show them to your doctor." })).toBeVisible();
      expect((await fs.readdir(bad)).some((n) => n.startsWith("records.unreadable-"))).toBe(true);
    } finally {
      await app.close();
    }
  } finally {
    await fs.rm(bad, { recursive: true, force: true });
  }
});

test("basic accessibility: every control has an accessible name; keyboard reaches Now", async () => {
  const { app, page } = await launch(dir);
  try {
    for (const p of ["Home", "Symptom journal", "Doctors & visits", "Medications", "Progress", "Report for doctor", "Help", "Settings"]) {
      await page.getByRole("button", { name: p, exact: true }).click();
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll("#app button, #app input, #app select, #app textarea")]
          .filter((el) => el.type !== "hidden" && el.offsetParent !== null)
          .filter((el) => {
            const label = el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || el.title;
            return !label || !label.trim();
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(unnamed, p).toEqual([]);
    }
    await page.keyboard.press("Control+n");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally {
    await app.close();
  }
});
