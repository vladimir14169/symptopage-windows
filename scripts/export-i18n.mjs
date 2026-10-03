// Exports the shared EN/PL texts for the iOS client.
// Output: ios/SymptoPage/Resources/i18n.json (same keys, placeholders and plural forms).
import fs from "node:fs";
import { messages } from "../core/i18n.js";
const out = new URL("../ios/SymptoPage/Resources/i18n.json", import.meta.url);
fs.mkdirSync(new URL(".", out), { recursive: true });
const data = { en: {}, pl: {} };
for (const [key, [en, pl]] of Object.entries(messages)) {
  data.en[key] = en;
  data.pl[key] = pl;
}
fs.writeFileSync(out, JSON.stringify(data, null, 1) + "\n");
console.log(`Exported ${Object.keys(messages).length} keys → ${out.pathname}`);
