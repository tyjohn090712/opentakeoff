// RFP breakdown (lib/rfpInfo.js) — the per-project bid-scope fields: governing
// documents that drive pricing, bid breakouts, and estimate/takeoff duration.
// The invariants under test:
//   - a well-formed rfp_info object survives the save → JSON → hydrate
//     round-trip unchanged (sanitizeRfpInfo is hydrate's gate), modulo id
//     stability for its two repeatable lists;
//   - hydrate defensiveness: non-object → the empty-but-complete shape, day
//     counts clamp to a finite non-negative number or "", strings cap length,
//     list items without a usable id get a fresh one, duplicate ids resolve,
//     and both lists cap at their max length;
//   - hasRfpContent mirrors the client_info omit-when-empty convention so
//     buildPayload can skip the key on an untouched project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRfpInfo, hasRfpContent, mintDocument, mintBreakout, RFP_DOC_CAP, RFP_BREAKOUT_CAP } from "../src/lib/rfpInfo.js";

const filled = () => ({
  bid_due_date: "8/14, 2pm",
  estimate_duration_days: 5,
  takeoff_duration_days: 2,
  documents: [
    { id: "doc-1", name: "Addendum 3", drives_pricing: true, note: "revises panel schedule" },
    { id: "doc-2", name: "Spec 26 0000", drives_pricing: false, note: "" },
  ],
  bid_breakouts: [
    { id: "brk-1", label: "Base Bid", note: "" },
    { id: "brk-2", label: "Alt 1 — LED upgrade", note: "all fixtures" },
  ],
  notes: "Owner wants unit pricing on panel change",
});

// ── sanitizeRfpInfo ───────────────────────────────────────────────────────────

test("round-trip: a saved rfp_info object hydrates unchanged", () => {
  const saved = filled();
  const hydrated = sanitizeRfpInfo(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(hydrated, saved);
});

test("non-object payloads hydrate to the empty-but-complete shape", () => {
  const empty = {
    bid_due_date: "", estimate_duration_days: "", takeoff_duration_days: "",
    documents: [], bid_breakouts: [], notes: "",
  };
  for (const raw of [undefined, null, 42, "x", []]) {
    assert.deepEqual(sanitizeRfpInfo(raw), empty, String(raw));
  }
});

test("day counts: negative, NaN, non-numeric, and out-of-range sanitize to ''", () => {
  for (const bad of [-1, NaN, "not a number", 1000, Infinity, {}]) {
    const out = sanitizeRfpInfo({ estimate_duration_days: bad, takeoff_duration_days: bad });
    assert.equal(out.estimate_duration_days, "");
    assert.equal(out.takeoff_duration_days, "");
  }
});

test("day counts: a valid number (including fractional) rounds to hundredths", () => {
  const out = sanitizeRfpInfo({ estimate_duration_days: 4.567, takeoff_duration_days: "2.5" });
  assert.equal(out.estimate_duration_days, 4.57);
  assert.equal(out.takeoff_duration_days, 2.5);
});

test("string fields cap length and drop whitespace-only", () => {
  const out = sanitizeRfpInfo({ bid_due_date: "   ", notes: "x".repeat(2000) });
  assert.equal(out.bid_due_date, "");
  assert.equal(out.notes.length, 1000);
});

test("document/breakout rows without a usable id get a fresh one", () => {
  const out = sanitizeRfpInfo({
    documents: [{ name: "Addendum 1" }, { id: 42, name: "Addendum 2" }],
    bid_breakouts: [{ label: "Base Bid" }],
  });
  assert.equal(out.documents.length, 2);
  assert.ok(out.documents[0].id);
  assert.ok(out.documents[1].id);
  assert.notEqual(out.documents[0].id, out.documents[1].id);
  assert.ok(out.bid_breakouts[0].id);
});

test("duplicate document/breakout ids: the second occurrence gets a fresh id", () => {
  const out = sanitizeRfpInfo({
    documents: [{ id: "dup", name: "A" }, { id: "dup", name: "B" }],
  });
  assert.equal(out.documents.length, 2);
  assert.equal(out.documents[0].id, "dup");
  assert.notEqual(out.documents[1].id, "dup");
});

test("drives_pricing is strictly boolean — anything but true sanitizes to false", () => {
  const out = sanitizeRfpInfo({ documents: [{ name: "A", drives_pricing: "yes" }, { name: "B", drives_pricing: 1 }] });
  assert.equal(out.documents[0].drives_pricing, false);
  assert.equal(out.documents[1].drives_pricing, false);
});

test("lists cap at their max length", () => {
  const documents = Array.from({ length: RFP_DOC_CAP + 10 }, (_, i) => ({ name: `Doc ${i}` }));
  const bid_breakouts = Array.from({ length: RFP_BREAKOUT_CAP + 10 }, (_, i) => ({ label: `Breakout ${i}` }));
  const out = sanitizeRfpInfo({ documents, bid_breakouts });
  assert.equal(out.documents.length, RFP_DOC_CAP);
  assert.equal(out.bid_breakouts.length, RFP_BREAKOUT_CAP);
});

test("non-object list items are dropped, not crashed on", () => {
  const out = sanitizeRfpInfo({ documents: [null, "x", 42, { name: "Real" }], bid_breakouts: [[], { label: "Real" }] });
  assert.equal(out.documents.length, 1);
  assert.equal(out.documents[0].name, "Real");
  assert.equal(out.bid_breakouts.length, 1);
  assert.equal(out.bid_breakouts[0].label, "Real");
});

// ── mintDocument / mintBreakout ────────────────────────────────────────────────

test("mintDocument/mintBreakout produce fresh, distinct ids and blank fields", () => {
  const a = mintDocument(); const b = mintDocument();
  assert.notEqual(a.id, b.id);
  assert.deepEqual({ ...a, id: "" }, { id: "", name: "", drives_pricing: false, note: "" });
  const c = mintBreakout();
  assert.deepEqual({ ...c, id: "" }, { id: "", label: "", note: "" });
});

// ── hasRfpContent ────────────────────────────────────────────────────────────

test("hasRfpContent: false for null/empty, true when any field is set", () => {
  assert.equal(hasRfpContent(null), false);
  assert.equal(hasRfpContent(sanitizeRfpInfo(undefined)), false);
  assert.equal(hasRfpContent(sanitizeRfpInfo({ bid_due_date: "8/14" })), true);
  assert.equal(hasRfpContent(sanitizeRfpInfo({ estimate_duration_days: 3 })), true);
  assert.equal(hasRfpContent(sanitizeRfpInfo({ documents: [{ name: "A" }] })), true);
  assert.equal(hasRfpContent(sanitizeRfpInfo({ bid_breakouts: [{ label: "Base Bid" }] })), true);
  assert.equal(hasRfpContent(sanitizeRfpInfo({ notes: "x" })), true);
});
