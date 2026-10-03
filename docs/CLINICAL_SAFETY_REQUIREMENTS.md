# Clinical safety requirements

## 1. What SymptoPage 0.5.0 is — and is not

SymptoPage records the user's own observations, the doctor's instructions as the user wrote them, and reminders the user set up. It **does not** diagnose, triage, change or suggest treatment, interpret results, decide recovery, or monitor the user. Nobody sees the entries in real time.

Built-in safeguards (all with tests or explicit UI text):

| Risk | Safeguard |
|---|---|
| A missing record is read as "no symptom" | Gaps are shown as "no record" in charts, the PDF and the daily card |
| One record linked to several doctors inflates the counts | Records are stored once and counted once (core test) |
| A dose schedule is inferred from a drug name | Courses are free-text "as prescribed"; nothing is derived from the name |
| The app suggests doubling, changing or stopping a dose | No such feature or text; the notice says "ask your doctor or pharmacist" |
| A notification is mistaken for a taken dose | Doses stay "not marked" until the user marks them; reminders are not replayed late |
| The end of a course is read as recovery | Text: "A finished course only means the planned dates have passed." |
| A chart is read as "treatment works / does not work" | Only counts plus record volume; "not enough data" below 4 recorded days per half |
| False reassurance | No "everything is fine" message anywhere; triage is unavailable and says so |
| Urgency tied to private vs public care | Help text states that urgency does not depend on it |
| Wrong emergency number | Only for a country the user **confirms**; numbers checked on 2026-10-03 (sources below) |
| The "Now / Teraz" button looks like an emergency call | Coral pill with a pen icon and the hint "Not an emergency call" |
| Sensitive details on the lock screen | Reminder text is generic by default |

## 2. Help section (released)

Title: **"Seek medical help earlier than your planned appointment"** / „Zgłoś się po pomoc medyczną wcześniej niż na zaplanowaną wizytę".

Contacts (checked 2026-10-03; re-verify before every release):

| Country | Numbers | Source |
|---|---|---|
| PL | 112, 999, 800 190 590 (NFZ Telefoniczna Informacja Pacjenta, 24/7: night and holiday care, nearest emergency department) | nfz.gov.pl/kontakt/telefoniczna-informacja-pacjenta; NIK report on 112 |
| DE | 112, 116117 (ärztlicher Bereitschaftsdienst) | Bundesgesundheitsministerium (116117 launch), KBV |
| GB | 999, 112, 111 (NHS 111) | NHS 111 service pages |
| IE | 112, 999 | national emergency numbers |
| US | 911, 988 (Suicide & Crisis Lifeline) | samhsa.gov 988 fact sheet |
| Other EU | 112 | EU single emergency number |

To add a country: add numbers to `core/help.js` and `HelpView.swift` with a source, add `country.XX` / `contact.*` texts, and update this table.

## 3. Personal urgency assessment (NOT released)

`core/triage.js` defines the interface (`assessUrgency(input) → {status, rulesetId, level, reasons}`) and always returns `status: "unavailable"`. `TRIAGE_ENABLED = false`. The UI shows only "Not available in this version".

**It must not be built from intuition, arbitrary thresholds or a language model's answer.**

Release prerequisites:

1. **Intended purpose** — a written statement (who, which symptoms, which outputs, which countries), agreed by the owner.
2. **Responsible medical professional** — named, with authority to approve the rules and the texts.
3. **Verified sources and rules** — a published, citable triage protocol (for example national guidance), versioned as `rulesetId`. Each rule must be traceable to its source.
4. **Clinical test scenarios** — a set of cases with the expected level, signed off by the clinician, run in CI. It must include red-flag symptoms, ambiguous cases, missing data and Polish/English wording.
5. **Regulatory analysis** — software that gives individual urgency advice is likely to qualify as medical device software (EU MDR 2017/745, Rule 11; MDCG 2019-11; in the UK, MHRA guidance; in the US, FDA guidance on clinical decision support). This needs: classification, a quality management system (ISO 13485), risk management (ISO 14971), software lifecycle (IEC 62304), usability (IEC 62366-1), clinical evaluation, and post-market surveillance.
6. **Output rules** — never "fine / no action"; always show the emergency contacts; log the `rulesetId` with every result; the user can always ignore it and call for help.
7. **Data protection** — a DPIA (GDPR art. 35) if processing changes.

Until all are met, the clinical module stays out of user builds. Its absence does not block releasing the journal and the "follow recorded instructions" features.

## 4. Before every release

- [ ] Re-check the contacts table above.
- [ ] Search the UI texts for wording that diagnoses, reassures or advises on treatment (`core/i18n.js`).
- [ ] Generate a PDF from synthetic data and read it as a doctor would: nothing invented, nothing silently omitted.
