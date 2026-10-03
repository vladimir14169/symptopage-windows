// Help contacts for a country the USER has confirmed (never inferred from
// locale, IP or language). Checked on 2026-10-03 against public sources listed in
// docs/CLINICAL_SAFETY_REQUIREMENTS.md; re-verify before every release.
export const HELP_CONTACTS = {
  PL: [
    { number: "112", kind: "emergency" },
    { number: "999", kind: "ambulance" },
    { number: "800 190 590", kind: "patientInfoPL" }, // NFZ Telefoniczna Informacja Pacjenta, 24/7
  ],
  DE: [
    { number: "112", kind: "emergency" },
    { number: "116117", kind: "onCallDE" },
  ],
  GB: [
    { number: "999", kind: "emergency" },
    { number: "112", kind: "emergency" },
    { number: "111", kind: "nhs111" },
  ],
  IE: [
    { number: "112", kind: "emergency" },
    { number: "999", kind: "emergency" },
  ],
  US: [
    { number: "911", kind: "emergency" },
    { number: "988", kind: "crisisUS" },
  ],
  EU: [{ number: "112", kind: "emergency" }],
};
export const HELP_VERIFIED_ON = "2026-10-03";
