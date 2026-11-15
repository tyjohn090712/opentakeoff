// One physical symbol, one count (electrical fork). At a low threshold the
// symbol engine can accept the SAME symbol under two readings — a receptacle
// whose circle and bar look alike turned 0° and 180° — so the finds at one
// spot are collapsed to the best-scoring reading. A "?" sitting on an accepted
// find (or on the seed) is the same symbol again and is dropped too.
//   matches, questions: [{ at: [x, y], score, … }]   r: same-spot radius, px
//   seed: [x, y] on the seed sheet (its own spot is already counted), or null
/**
 * @param {any[]} matches
 * @param {any[]} questions
 * @param {number} r
 * @param {number[] | null} [seed]
 * @returns {{ matches: any[], questions: any[] }}
 */
export function collapseFinds(matches, questions, r, seed = null) {
  const kept = [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
  for (const m of [...matches].sort((a, b) => b.score - a.score)) {
    if (seed && near(m.at, seed)) continue;
    const twin = kept.find((k) => near(k.at, m.at));
    if (twin) { twin.readings = (twin.readings || 1) + 1; continue; }
    kept.push({ ...m, readings: 1 });
  }
  const qs = (questions || []).filter((q) => !kept.some((k) => near(k.at, q.at)) && !(seed && near(q.at, seed)));
  return { matches: kept, questions: qs };
}
