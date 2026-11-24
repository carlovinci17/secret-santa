'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { draw } = require('../lib/draw');

const people = (names, excl = {}) =>
  names.map((n) => ({ id: n, name: n, exclusions: excl[n] || [] }));

function assertValid(list, assignments) {
  const receivers = Object.values(assignments);
  assert.strictEqual(Object.keys(assignments).length, list.length, 'everyone gives');
  assert.strictEqual(new Set(receivers).size, list.length, 'everyone receives once');
  for (const p of list) {
    assert.notStrictEqual(assignments[p.id], p.id, 'no self-draws');
    assert.ok(!p.exclusions.includes(assignments[p.id]), `${p.id} drew an excluded person`);
  }
}

test('basic draw is a valid derangement, 500 runs', () => {
  const list = people(['A', 'B', 'C', 'D', 'E', 'F']);
  for (let i = 0; i < 500; i++) {
    const r = draw(list);
    assert.ok(r.ok);
    assertValid(list, r.assignments);
  }
});

test('respects couples exclusions, 500 runs', () => {
  const list = people(['Carlo', 'Wife', 'Mum', 'Dad', 'Sis', 'BIL'], {
    Carlo: ['Wife'], Wife: ['Carlo'], Mum: ['Dad'], Dad: ['Mum'], Sis: ['BIL'], BIL: ['Sis'],
  });
  for (let i = 0; i < 500; i++) {
    const r = draw(list);
    assert.ok(r.ok);
    assertValid(list, r.assignments);
  }
});

test('forced single solution is found', () => {
  // A must give to B, B to C, C to A
  const list = people(['A', 'B', 'C'], { A: ['C'], B: ['A'], C: ['B'] });
  const r = draw(list);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.assignments, { A: 'B', B: 'C', C: 'A' });
});

test('reports impossible setups clearly', () => {
  assert.match(draw(people(['A'])).error, /at least 2/);
  assert.match(draw(people(['A', 'B'], { A: ['B'] })).error, /A has no one left/);
  assert.match(draw(people(['A', 'B', 'C'], { A: ['C'], B: ['C'] })).error, /Nobody is allowed to draw C/);
  // Two couples who exclude each other and the other couple's member pattern making it impossible
  const r = draw(people(['A', 'B', 'C'], { A: ['B'], B: ['A'] }));
  assert.strictEqual(r.ok, false);
});

test('larger group stays fast', () => {
  const names = Array.from({ length: 60 }, (_, i) => `P${i}`);
  const excl = {};
  names.forEach((n, i) => { excl[n] = [names[(i + 1) % 60], names[(i + 2) % 60]]; });
  const list = people(names, excl);
  const t = Date.now();
  const r = draw(list);
  assert.ok(r.ok);
  assertValid(list, r.assignments);
  assert.ok(Date.now() - t < 1000);
});
