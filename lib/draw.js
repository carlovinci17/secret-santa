'use strict';

/**
 * Assign every giver exactly one receiver such that:
 *  - nobody draws themselves
 *  - nobody draws someone on their exclusion list
 *  - every person receives exactly one gift
 *
 * Uses randomised backtracking, most-constrained giver first, so results are
 * random but a valid draw is always found if one exists.
 *
 * @param {Array<{id:string, name:string, exclusions?:string[]}>} participants
 * @param {() => number} [rng]
 * @returns {{ ok: true, assignments: Record<string,string> } | { ok: false, error: string }}
 */
function draw(participants, rng = Math.random) {
  if (participants.length < 2) {
    return { ok: false, error: 'You need at least 2 people to draw names.' };
  }

  const ids = participants.map((p) => p.id);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const allowed = new Map();

  for (const p of participants) {
    const excluded = new Set(p.exclusions || []);
    const options = ids.filter((id) => id !== p.id && !excluded.has(id));
    if (options.length === 0) {
      return { ok: false, error: `${p.name} has no one left they're allowed to draw. Remove some of their exclusions.` };
    }
    allowed.set(p.id, options);
  }

  // Everyone must be drawable by somebody.
  for (const id of ids) {
    const canBeDrawn = ids.some((g) => allowed.get(g).includes(id));
    if (!canBeDrawn) {
      return { ok: false, error: `Nobody is allowed to draw ${byId.get(id).name}. Remove some exclusions.` };
    }
  }

  const givers = shuffle(ids, rng).sort((a, b) => allowed.get(a).length - allowed.get(b).length);
  const taken = new Set();
  const result = {};
  let steps = 0;
  const MAX_STEPS = 500000;

  function solve(i) {
    if (i === givers.length) return true;
    if (++steps > MAX_STEPS) return false;
    const giver = givers[i];
    for (const receiver of shuffle(allowed.get(giver), rng)) {
      if (taken.has(receiver)) continue;
      taken.add(receiver);
      result[giver] = receiver;
      if (solve(i + 1)) return true;
      taken.delete(receiver);
      delete result[giver];
    }
    return false;
  }

  if (!solve(0)) {
    return {
      ok: false,
      error: 'No valid draw is possible with the current exclusions. Try removing a few exclusions and draw again.',
    };
  }
  return { ok: true, assignments: result };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { draw };
