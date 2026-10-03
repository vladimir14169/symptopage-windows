// Progress: the user's own "better / same / worse" self-assessment and charts
// of their records. Gaps are drawn as "no record", comparisons always state the
// amount of data, and the app never concludes recovery or treatment failure.
import { RATINGS } from "../../../core/schema.js";
import { localDay, addDays } from "../../../core/time.js";
import { selectedObservations, symptomSummary, dailySeries, comparePeriods } from "../../../core/views.js";
import { t, esc, button, fmtDay, doctorLabel, symptomLabel } from "../format.js";
import { ui, S, change, notify, filterArg, rerender } from "../store.js";
import { scopedRecords } from "./journal.js";

function chart(series, label) {
  const w = 14, gap = 3, h = 90;
  const max = Math.max(2, ...series.map((d) => d.value ?? 0));
  const width = series.length * (w + gap);
  const bars = series
    .map((d, i) => {
      const x = i * (w + gap);
      if (d.value === null) return `<rect x="${x}" y="${h - 10}" width="${w}" height="10" class="gap"><title>${fmtDay(d.date)}: ${t("progress.noRecord")}</title></rect>`;
      const bh = Math.max(3, (d.value / max) * (h - 4));
      return `<rect x="${x}" y="${h - bh}" width="${w}" height="${bh}" class="${d.value === 0 ? "zero" : "bar"}"><title>${fmtDay(d.date)}: ${d.events ? t("progress.events", { n: d.events }) : t("frequency." + d.rating)}</title></rect>`;
    })
    .join("");
  return `<figure class="chart"><svg viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(label)}" preserveAspectRatio="none">${bars}</svg><figcaption><span class="key bar"></span>${t("progress.keyRecorded")} <span class="key zero"></span>${t("progress.keyNone")} <span class="key gap"></span>${t("progress.keyGap")}</figcaption></figure>`;
}

export function render() {
  const s = S();
  const v = (ui.view.progress ??= { days: 30 });
  const today = localDay();
  const from = addDays(today, -(v.days - 1));
  const entries = scopedRecords(s.entries);
  const ratings = scopedRecords(s.dailyRatings);
  const summary = symptomSummary(entries, ratings, from, today);
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const observations = selectedObservations(s, filterArg());
  return `<p class="note">${t("progress.notice")}</p>
  <article class="card"><h2>${t("progress.selfTitle")}</h2><p class="hint">${t("progress.selfIntro")}</p>
  ${observations.length ? observations.map((o) => {
    const todayA = s.assessments.find((a) => a.observationId === o.id && a.date === today);
    const recent = s.assessments.filter((a) => a.observationId === o.id).slice(0, 10);
    return `<section class="assessment"><h3>${esc(doctorLabel(doctors.get(o.doctorId)))} — ${esc(o.reason)}</h3>
    <div class="segmented" role="group" aria-label="${t("progress.selfQuestion")}">${RATINGS.map((r) => button(t("rating." + r), "assess", { cls: todayA?.rating === r ? "seg on" : "seg", data: { id: o.id, rating: r }, pressed: todayA?.rating === r })).join("")}</div>
    ${recent.length ? `<p class="meta">${t("progress.recent")}: ${recent.map((a) => `${fmtDay(a.date, "short")} ${t("rating." + a.rating)}`).join(" · ")}</p>` : `<p class="meta">${t("progress.noAssessments")}</p>`}</section>`;
  }).join("") : `<p class="empty">${t("home.noObservations")}</p>`}</article>
  <article class="card"><div class="row"><h2>${t("progress.chartsTitle")}</h2><label class="field inline-label">${t("progress.range")}<select data-change="progressRange">${[14, 30, 90].map((d) => `<option value="${d}" ${v.days === d ? "selected" : ""}>${t("progress.lastDays", { n: d })}</option>`).join("")}</select></label></div>
  <p class="meta" role="status">${t("progress.coverage", { recorded: summary.recordedDays, total: summary.totalDays, missing: summary.missingDays })}</p>
  ${summary.symptoms.length ? summary.symptoms.map((g) => {
    const mid = addDays(from, Math.floor(v.days / 2));
    const cmp = comparePeriods(entries, ratings, g.key, { from, to: addDays(mid, -1) }, { from: mid, to: today });
    return `<section class="symptom-progress"><h3>${esc(symptomLabel(g))}</h3>${chart(dailySeries(entries, ratings, from, today, g.key), symptomLabel(g))}
    <p class="meta">${t("progress.stats", { events: g.events, days: g.eventDays })}${g.maxIntensity ? " · " + t("progress.maxIntensity", { level: t("intensity." + g.maxIntensity), n: g.intensityRecords }) : ""}</p>
    <p class="meta">${cmp.enoughData ? t("progress.compare", { a: cmp.first.events, ad: cmp.first.recordedDays, b: cmp.second.events, bd: cmp.second.recordedDays, n: cmp.first.totalDays }) : t("progress.notEnough", { a: cmp.first.recordedDays, b: cmp.second.recordedDays })}</p></section>`;
  }).join("") : `<p class="empty">${t("progress.empty")}</p>`}
  <p class="hint">${t("progress.disclaimer")}</p></article>`;
}

export const actions = {
  assess: async (el) => {
    if (await change("assessment.save", { observationId: el.dataset.id, date: localDay(), rating: el.dataset.rating })) notify(t("progress.saved"));
  },
};
export const changes = {
  progressRange: (el) => ((ui.view.progress.days = Number(el.value)), rerender()),
};
