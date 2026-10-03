// Personal urgency assessment — CONTRACT ONLY, NOT RELEASED.
//
// A symptom-based urgency assessment is a separate clinical module. It must not
// be built from intuition, arbitrary thresholds or a language model's answer.
// Release prerequisites (docs/CLINICAL_SAFETY_REQUIREMENTS.md): an agreed
// intended purpose, a responsible medical professional, verified sources and
// rules, clinical test scenarios, and a regulatory assessment (e.g. EU MDR
// qualification as medical device software).
//
// Until then this module always reports "unavailable" and the user build shows
// no automatic triage and no reassurance such as "everything is fine".

export const TRIAGE_ENABLED = false;

/**
 * @typedef {Object} TriageInput
 * @property {Array<{symptom:string, customLabel:string, occurredAt:string, intensity:number|null}>} entries
 * @property {string|null} country      user-confirmed country
 * @property {string} language          "en" | "pl"
 *
 * @typedef {Object} TriageResult
 * @property {"unavailable"|"assessed"} status
 * @property {string|null} rulesetId     identifier + version of the approved ruleset
 * @property {"emergency"|"urgent"|"routine"|null} level  never "fine"/"no action"
 * @property {string[]} reasons          rule IDs that fired, for audit
 */

/** @param {TriageInput} _input @returns {TriageResult} */
export function assessUrgency(_input) {
  return { status: "unavailable", rulesetId: null, level: null, reasons: [] };
}
