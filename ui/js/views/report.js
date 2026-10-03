// Doctor report (PDF / print). Page 1 is a short summary; the full chronology
// follows as an appendix. Nothing is concluded or invented: every number is a
// count of the user's own records, and all records in scope are listed.
import { localDay, addDays, dayOfInstant } from "../../../core/time.js";
import { selectedObservations, recordsFor, symptomSummary } from "../../../core/views.js";
import { plannedDoses } from "../../../core/schedule.js";
import { t, esc, button, fmtDay, fmtDateTime, doctorLabel, symptomLabel, intensityLabel, fmtWeekday } from "../format.js";
import { ui, S, notify, filterArg, rerender } from "../store.js";
import { api } from "../api.js";
import { entryDetails } from "./journal.js";
import { brand } from "../../brand/brand.js";

const SECTIONS = ["symptoms", "daily", "medications", "outcomes", "questions", "assessments", "chronology"];

function options() {
  const s = S();
  const v = (ui.view.report ??= { from: addDays(localDay(), -29), to: localDay(), general: true, sections: [...SECTIONS], observationIds: null });
  const available = selectedObservations(s, filterArg()).map((o) => o.id);
  // Default and filter-driven selection: the observations in the current filter.
  const chosen = (v.observationIds ?? available).filter((id) => s.observations.some((o) => o.id === id));
  return { ...v, observationIds: chosen, available };
}

function reportData() {
  const s = S();
  const o = options();
  const obs = s.observations.filter((x) => o.observationIds.includes(x.id));
  const inRange = (d) => d >= o.from && d <= o.to;
  const entries = recordsFor(s.entries, o.observationIds, { includeGeneral: o.general }).filter((e) => inRange(dayOfInstant(e.occurredAt))).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const ratings = recordsFor(s.dailyRatings, o.observationIds, { includeGeneral: o.general }).filter((r) => inRange(r.date)).sort((a, b) => a.date.localeCompare(b.date));
  const courses = s.courses.filter((c) => o.observationIds.includes(c.observationId));
  const doses = plannedDoses({ ...s, courses }, o.from, o.to > localDay() ? localDay() : o.to);
  return { s, o, obs, entries, ratings, courses, doses, summary: symptomSummary(entries, ratings, o.from, o.to) };
}

const has = (o, k) => o.sections.includes(k);

export function printHTML() {
  if (ui.page !== "report") return "";
  const { s, o, obs, entries, ratings, courses, doses, summary } = reportData();
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const visitsOf = (ob) => s.visits.filter((v) => v.observationId === ob.id).sort((a, b) => a.date.localeCompare(b.date));
  const empty = !entries.length && !ratings.length;
  const section = (title, body) => `<section class="r-section"><h3>${title}</h3>${body}</section>`;

  const head = `<header class="r-head"><div><p class="r-brand">${esc(brand.name)}</p><h1>${t("report.docTitle")}</h1></div><p class="r-meta">${t("report.generated", { date: fmtDateTime(new Date().toISOString()) })}<br>${t("report.period", { from: fmtDay(o.from), to: fmtDay(o.to) })}</p></header>
  <p class="r-disclaimer">${t("report.disclaimer")}</p>`;

  const reasons = section(t("report.reasons"), obs.length ? `<ul>${obs.map((ob) => {
    const vs = visitsOf(ob);
    return `<li><strong>${esc(doctorLabel(doctors.get(ob.doctorId)))}</strong> — ${esc(ob.reason)}<br><span class="r-small">${t("report.stage")}: ${t("stage." + ob.stage)}${vs.length ? " · " + t("report.visits") + ": " + vs.map((v) => `${fmtDay(v.date)} (${t("visit.status." + v.status)})`).join(", ") : ""}</span></li>`;
  }).join("")}</ul>` : `<p>${t("report.noObservations")}</p>`);

  const coverage = `<p class="r-small">${t("progress.coverage", { recorded: summary.recordedDays, total: summary.totalDays, missing: summary.missingDays })} ${t("report.gapNote")}</p>`;

  const symptomTable = has(o, "symptoms") ? section(t("report.symptoms"), empty ? `<p>${t("report.noRecords")}</p>` : `${coverage}<table class="r-table"><thead><tr><th>${t("entry.symptom")}</th><th>${t("report.colEvents")}</th><th>${t("report.colDays")}</th><th>${t("report.colIntensity")}</th><th>${t("report.colDaily")}</th><th>${t("report.colFirstLast")}</th></tr></thead><tbody>${summary.symptoms.map((g) => `<tr><td>${esc(symptomLabel(g))}</td><td>${g.events}</td><td>${g.eventDays}</td><td>${g.maxIntensity ? `${t("report.max")}: ${intensityLabel(g.maxIntensity)} (${t("report.ofN", { n: g.intensityRecords })})` : "—"}</td><td>${g.daily.none + g.daily.once + g.daily.several ? `${t("frequency.none")} ${g.daily.none} · ${t("frequency.once")} ${g.daily.once} · ${t("frequency.several")} ${g.daily.several}` : "—"}</td><td>${g.first ? `${fmtDay(dayOfInstant(g.first), "short")} – ${fmtDay(dayOfInstant(g.last), "short")}` : "—"}</td></tr>`).join("")}</tbody></table>`) : "";

  const assess = has(o, "assessments") ? (() => {
    const list = s.assessments.filter((a) => o.observationIds.includes(a.observationId) && a.date >= o.from && a.date <= o.to);
    if (!list.length) return "";
    const n = (r) => list.filter((a) => a.rating === r).length;
    return section(t("report.assessments"), `<p>${t("report.assessmentCounts", { better: n("better"), same: n("same"), worse: n("worse"), total: list.length })}</p><p class="r-small">${t("report.assessmentNote")}</p>`);
  })() : "";

  const meds = has(o, "medications") ? section(t("report.medications"), courses.length ? `<table class="r-table"><thead><tr><th>${t("course.name")}</th><th>${t("course.dose")}</th><th>${t("report.schedule")}</th><th>${t("report.colMarks")}</th></tr></thead><tbody>${courses.map((c) => {
    const ds = doses.filter((d) => d.courseId === c.id);
    const n = (st) => ds.filter((d) => d.status === st).length;
    return `<tr><td>${esc(c.name)}</td><td>${esc(c.dose)}${c.instructions ? `<br><span class="r-small">${esc(c.instructions)}</span>` : ""}</td><td>${c.times.join(", ")} · ${c.days.length === 7 ? t("course.everyDay") : c.days.map(fmtWeekday).join(", ")}<br><span class="r-small">${fmtDay(c.startDate)} – ${c.indefinite ? t("course.noEnd") : fmtDay(c.endDate)}${c.stoppedAt ? " · " + t("course.stoppedOn", { date: fmtDay(localDay(new Date(c.stoppedAt))) }) : ""}</span></td><td>${t("report.marks", { taken: n("taken"), skipped: n("skipped"), pending: n("pending") + n("snoozed"), total: ds.length })}</td></tr>`;
  }).join("")}</tbody></table><p class="r-small">${t("report.marksNote")}</p>` : `<p>${t("report.noMedications")}</p>`) : "";

  const questions = has(o, "questions") ? section(t("report.questions"), obs.some((x) => x.questions) ? `<ul>${obs.filter((x) => x.questions).map((x) => `<li class="user-text">${esc(x.questions)}</li>`).join("")}</ul>` : `<p>${t("report.noQuestions")}</p>`) : "";

  const outcomes = has(o, "outcomes") ? (() => {
    const vs = obs.flatMap(visitsOf).filter((v) => v.outcome);
    if (!vs.length) return "";
    return section(t("report.outcomes"), vs.map((v) => {
      const ps = s.prescriptions.filter((p) => p.visitId === v.id);
      return `<div class="r-outcome"><p><strong>${fmtDay(v.date)}</strong> · ${t("source." + v.outcome.source)}</p>${v.outcome.notes ? `<p class="user-text">${esc(v.outcome.notes)}</p>` : ""}${v.outcome.recommendations ? `<p class="user-text"><strong>${t("outcome.recommendations")}:</strong> ${esc(v.outcome.recommendations)}</p>` : ""}${v.outcome.returnAdvice ? `<p class="user-text"><strong>${t("outcome.returnAdvice")}:</strong> ${esc(v.outcome.returnAdvice)}</p>` : ""}${v.outcome.followUpDate ? `<p>${t("outcome.followUpDate")}: ${fmtDay(v.outcome.followUpDate)}</p>` : ""}${ps.length ? `<ul>${ps.map((p) => `<li>${t("prescription.kind." + p.kind)}: <span class="user-text">${esc(p.text)}</span>${p.dueDate ? ` (${t("prescription.due")}: ${fmtDay(p.dueDate)})` : ""} · ${t("source." + p.source)}</li>`).join("")}</ul>` : ""}</div>`;
    }).join(""));
  })() : "";

  const chronology = has(o, "chronology") ? `<section class="r-appendix"><h2>${t("report.appendix")}</h2>${entries.length ? `<ol class="r-chrono">${entries.map((e) => `<li><strong>${fmtDateTime(e.occurredAt)}</strong> — ${esc(symptomLabel(e))}${entryDetails(e) ? `<br><span class="r-small">${entryDetails(e)}</span>` : ""}${e.note ? `<br><span class="user-text">${esc(e.note)}</span>` : ""}</li>`).join("")}</ol>` : `<p>${t("report.noEvents")}</p>`}
  ${has(o, "daily") ? `<h3>${t("journal.daily")}</h3>${ratings.length ? `<table class="r-table"><tbody>${ratings.map((r) => `<tr><td>${fmtDay(r.date)}</td><td>${esc(symptomLabel(r))}</td><td>${t("frequency." + r.frequency)}</td><td class="user-text">${esc(r.note)}</td></tr>`).join("")}</tbody></table>` : `<p>${t("journal.noDaily")}</p>`}` : ""}</section>` : "";

  return `<div class="r-page">${head}${reasons}${symptomTable}${assess}${meds}${questions}${outcomes}</div>${chronology}<p class="r-foot">${t("report.footer")}</p>`;
}

export function render() {
  const s = S();
  const o = options();
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const all = selectedObservations(s, { archived: true });
  return `<article class="card"><h2>${t("report.options")}</h2><form class="stack" data-submit="noop">
  <div class="grid-2"><label class="field">${t("journal.from")}<input type="date" name="from" value="${o.from}" data-change="reportField"></label><label class="field">${t("journal.to")}<input type="date" name="to" value="${o.to}" data-change="reportField"></label></div>
  <fieldset class="checks"><legend>${t("report.observations")}</legend>${all.map((x) => `<label class="check"><input type="checkbox" name="observationIds" value="${x.id}" data-change="reportObs" ${o.observationIds.includes(x.id) ? "checked" : ""}><span>${esc(doctorLabel(doctors.get(x.doctorId)))} — ${esc(x.reason)}${x.archivedAt ? ` (${t("observation.archived")})` : ""}</span></label>`).join("")}</fieldset>
  <label class="check"><input type="checkbox" name="general" data-change="reportGeneral" ${o.general ? "checked" : ""}> ${t("report.includeGeneral")}</label>
  <fieldset class="chips"><legend>${t("report.sections")}</legend>${SECTIONS.map((k) => `<label class="chip-choice"><input type="checkbox" name="sections" value="${k}" data-change="reportSection" ${o.sections.includes(k) ? "checked" : ""}><span>${t("report.section." + k)}</span></label>`).join("")}</fieldset>
  ${o.from > o.to ? `<p class="form-error">${t("report.badRange")}</p>` : ""}
  <div class="actions">${button(t("report.pdf"), "pdf", { cls: "primary", disabled: o.from > o.to })}${button(t("report.print"), "print", { disabled: o.from > o.to })}</div></form></article>
  <article class="card"><h2>${t("report.preview")}</h2><div class="report-preview" aria-label="${t("report.preview")}">${printHTML()}</div></article>`;
}

const v = () => ui.view.report;
export const changes = {
  reportField: (el) => ((v()[el.name] = el.value), rerender()),
  reportGeneral: (el) => ((v().general = el.checked), rerender()),
  reportObs: () => {
    v().observationIds = [...document.querySelectorAll('input[name="observationIds"]:checked')].map((x) => x.value);
    rerender();
  },
  reportSection: () => {
    v().sections = [...document.querySelectorAll('input[name="sections"]:checked')].map((x) => x.value);
    rerender();
  },
};
export const actions = {
  pdf: async (el) => {
    el.disabled = true;
    const o = options();
    const r = await api.exportPDF(`SymptoPage-${o.from}_${o.to}.pdf`);
    el.disabled = false;
    if (!r.ok) notify(t("error.save"), "error");
    else if (r.value) notify(t("report.saved"));
  },
  print: async (el) => {
    el.disabled = true;
    const r = await api.print();
    el.disabled = false;
    if (!r.ok) notify(t("error.print"), "error");
  },
};
