// Shared vocabulary of the SymptoPage data model (schema v2).
// Pure module: imported by the Electron main process, the renderer and tests.
// The iOS client mirrors these values in ios/SymptoPage/Model (see docs/DATA_MODEL.md).

export const SCHEMA_VERSION = 2;
export const BACKUP_FORMAT = "symptopage-backup";
export const BACKUP_FORMAT_VERSION = 1;

export const LANGUAGES = ["en", "pl"];
export const SPECIALTIES = [
  "cardiologist",
  "neurologist",
  "endocrinologist",
  "orthopedist",
  "internist",
  "gp",
  "other",
];
// "custom" entries carry their own label in customLabel.
export const SYMPTOMS = [
  "palpitations",
  "dizziness",
  "dyspnea",
  "headache",
  "pain",
  "fatigue",
  "custom",
];
export const STAGES = ["waiting", "visited", "treatment", "followup", "closed"];
export const FREQUENCIES = ["none", "once", "several"];
export const INTENSITIES = [1, 2, 3, 4]; // mild, moderate, severe, very severe
export const VISIT_KINDS = ["initial", "followup"];
export const VISIT_STATUSES = ["planned", "done", "cancelled"];
export const PRESCRIPTION_KINDS = ["medication", "test", "other"];
export const SOURCES = ["user", "document"];
export const DOSE_STATUSES = ["taken", "skipped", "snoozed"];
export const RATINGS = ["better", "same", "worse"];
// Countries with verified emergency numbers in core/help.js. null = not confirmed.
export const COUNTRIES = ["PL", "DE", "GB", "IE", "US", "EU"];
export const ATTACHMENT_TYPES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT = 4000;

export function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      language: "en",
      notificationsEnabled: true,
      // Lock-screen privacy: reminders say only "scheduled reminder" unless enabled.
      notificationDetails: false,
      country: null,
    },
    doctors: [],
    observations: [],
    visits: [],
    prescriptions: [],
    courses: [],
    doseEvents: [],
    entries: [],
    dailyRatings: [],
    assessments: [],
    attachments: [],
  };
}
