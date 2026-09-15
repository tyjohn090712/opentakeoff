// RFP breakdown — the per-project bid-scope fields an estimator fills in once
// a bid set lands: which documents in the package actually drive pricing, how
// the bid is broken out (base bid / alternates / unit prices), and how many
// work days the estimate — and specifically the on-screen takeoff inside it —
// is expected to take. Persisted as the additive `rfp_info` payload key,
// alongside client_info (the same per-project, saved-with-the-project home).
// Pure helpers here so hydrate defensiveness is testable independent of the
// canvas, mirroring conditionColumns.js / shapeLabels.js.
import { round2 } from "./num.js";

export const RFP_DOC_CAP = 40;
export const RFP_BREAKOUT_CAP = 20;
const NAME_MAX = 160;
const NOTE_MAX = 300;
const DATE_MAX = 60;
const NOTES_MAX = 1000;

// The visible-string rule everything below shares (the client_info /
// conditionColumns precedent): a string with visible content counts, capped
// to its field's max length; anything else — non-string, empty,
// whitespace-only — is "".
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");

// A day count is a finite, non-negative number, rounded to hundredths and
// capped at a generous 999 — anything else (blank, NaN, a negative or absurd
// paste) sanitizes to "" so the field renders blank rather than a corrupt
// number.
const days = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 999 ? round2(n) : "";
};

let idSeq = 0;
// Runtime-only id mint (mirrors identity.js's newId) — collision-safe within
// a session, which is all a React list key needs.
export function mintRfpId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;
}

// New-row factories for the two repeatable lists — the Add-row buttons in
// ProjectInfoModal call these directly.
export function mintDocument() {
  return { id: mintRfpId("doc"), name: "", drives_pricing: false, note: "" };
}
export function mintBreakout() {
  return { id: mintRfpId("brk"), label: "", note: "" };
}

// A row keeps its incoming id if it's a usable, not-yet-seen string;
// otherwise it mints a fresh one — a hand-edited/merged payload must not
// collide two rows on the same React key.
function normalizeId(id, seen, prefix) {
  if (typeof id === "string" && id && !seen.has(id)) { seen.add(id); return id; }
  const fresh = mintRfpId(prefix);
  seen.add(fresh);
  return fresh;
}

// Defensive hydrate for the additive `rfp_info` payload key: a non-object (or
// array) input sanitizes to the empty-but-complete shape below — the
// sheet_levels else-clear rule, so a snapshot load without this key (every
// payload saved before this feature shipped) can't inherit the replaced
// project's RFP fields. Every reader gets every key, always the right type,
// so no caller needs an `rfpInfo?.documents || []` guard.
export function sanitizeRfpInfo(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const seenDoc = new Set();
  const documents = (Array.isArray(r.documents) ? r.documents : [])
    .filter((d) => d && typeof d === "object" && !Array.isArray(d))
    .slice(0, RFP_DOC_CAP)
    .map((d) => ({
      id: normalizeId(d.id, seenDoc, "doc"),
      name: str(d.name, NAME_MAX),
      drives_pricing: d.drives_pricing === true,
      note: str(d.note, NOTE_MAX),
    }));
  const seenBrk = new Set();
  const bid_breakouts = (Array.isArray(r.bid_breakouts) ? r.bid_breakouts : [])
    .filter((b) => b && typeof b === "object" && !Array.isArray(b))
    .slice(0, RFP_BREAKOUT_CAP)
    .map((b) => ({
      id: normalizeId(b.id, seenBrk, "brk"),
      label: str(b.label, NAME_MAX),
      note: str(b.note, NOTE_MAX),
    }));
  return {
    bid_due_date: str(r.bid_due_date, DATE_MAX),
    estimate_duration_days: days(r.estimate_duration_days),
    takeoff_duration_days: days(r.takeoff_duration_days),
    documents,
    bid_breakouts,
    notes: str(r.notes, NOTES_MAX),
  };
}

// Save-worthy check, mirroring the client_info `Object.values(...).some(...)`
// omit-when-empty convention in buildPayload — but rfp_info's values aren't
// all strings (arrays, a boolean, numbers), so it gets its own predicate
// rather than reusing that one-liner.
export function hasRfpContent(info) {
  if (!info) return false;
  return Boolean(
    info.bid_due_date || info.notes ||
    info.estimate_duration_days !== "" || info.takeoff_duration_days !== "" ||
    info.documents?.length || info.bid_breakouts?.length
  );
}
