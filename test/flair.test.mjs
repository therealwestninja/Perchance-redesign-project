// test/flair.test.mjs
//
// Unit tests for src/profile/flair.js. Focuses on:
//   - getAvailableTitles returns unlocked achievements sorted by rarity
//   - getAccents reports isUnlocked correctly per tier-count criterion
//   - resolveActiveTitle fallback chain (pick → override → auto → default)
//   - resolveActiveAccent fallback chain (pick-if-valid → default)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  ACCENTS,
  getAvailableTitles,
  getAccents,
  resolveActiveTitle,
  resolveActiveAccent,
  resolveAccentVars,
  hexToRgb,
} = await import('../src/profile/flair.js');

// ---- getAvailableTitles ----

test('getAvailableTitles: returns only unlocked achievements', () => {
  const titles = getAvailableTitles(['first_word', 'first_character']);
  const names = titles.map(t => t.name);
  assert.ok(names.includes('First Word'));
  assert.ok(names.includes('First Character'));
});

test('getAvailableTitles: sorts by tier rank descending', () => {
  // first_word is common; streak_100day is legendary. Pass both; legendary first.
  const titles = getAvailableTitles(['first_word', 'streak_100day']);
  assert.equal(titles[0].tier, 'legendary');
  assert.equal(titles[1].tier, 'common');
});

test('getAvailableTitles: empty input returns empty array', () => {
  assert.deepEqual(getAvailableTitles([]), []);
  assert.deepEqual(getAvailableTitles(null), []);
});

test('getAvailableTitles: unknown IDs are ignored', () => {
  const titles = getAvailableTitles(['bogus_id', 'first_word']);
  assert.equal(titles.length, 1);
  assert.equal(titles[0].id, 'first_word');
});

// ---- getAccents ----

test('getAccents: amber always unlocked', () => {
  const all = getAccents({}, []);
  const amber = all.find(a => a.id === 'amber');
  assert.ok(amber);
  assert.equal(amber.isUnlocked, true);
});

test('getAccents: slate unlocks at 5 silver-tier achievements (new palette)', () => {
  // Slate was bumped from bronze (3 commons) to silver (5 rares) in the
  // 24-accent palette revamp — it now sits in row 2 alongside the
  // other metals + jewels.
  const at4  = getAccents({}, ['curator_silver', 'namer_silver',
                               'organizer_silver', 'shuffler_silver']);
  const at5  = getAccents({}, ['curator_silver', 'namer_silver',
                               'organizer_silver', 'shuffler_silver',
                               'sorter_silver']);
  assert.equal(at4.find(a => a.id === 'slate').isUnlocked, false);
  assert.equal(at5.find(a => a.id === 'slate').isUnlocked, true);
});

test('getAccents: moss unlocks at 1 bronze-tier achievement', () => {
  const below = getAccents({}, []);
  const at    = getAccents({}, ['first_word']);
  assert.equal(below.find(a => a.id === 'moss').isUnlocked, false);
  assert.equal(at.find(a => a.id === 'moss').isUnlocked, true);
});

test('getAccents: first-4 starter accents (amber/sage/ash/clay) are always available', () => {
  const all = getAccents({}, []);
  for (const id of ['amber', 'sage', 'ash', 'clay']) {
    const entry = all.find(a => a.id === id);
    assert.ok(entry, `accent '${id}' should exist`);
    assert.equal(entry.isUnlocked, true, `accent '${id}' should be free`);
  }
});

test('getAccents: pink requires 1 legendary AND all 5 prompt categories', () => {
  // Only legendary — not enough
  const onlyLegend = getAccents({ promptCategoriesTouched: 3 }, ['streak_100day']);
  assert.equal(onlyLegend.find(a => a.id === 'pink').isUnlocked, false);
  // Only breadth — not enough
  const onlyBreadth = getAccents({ promptCategoriesTouched: 5 }, []);
  assert.equal(onlyBreadth.find(a => a.id === 'pink').isUnlocked, false);
  // Both — unlocked
  const both = getAccents({ promptCategoriesTouched: 5 }, ['streak_100day']);
  assert.equal(both.find(a => a.id === 'pink').isUnlocked, true);
});

test('getAccents: purple requires 1 legendary AND 30-day streak', () => {
  const weak  = getAccents({ streaks: { longest: 10 } }, ['streak_100day']);
  const ready = getAccents({ streaks: { longest: 30 } }, ['streak_100day']);
  assert.equal(weak.find(a => a.id === 'purple').isUnlocked, false);
  assert.equal(ready.find(a => a.id === 'purple').isUnlocked, true);
});

test('getAccents: sky requires 1 legendary AND 5 events responded', () => {
  const weak  = getAccents({ eventsResponded: 3 }, ['streak_100day']);
  const ready = getAccents({ eventsResponded: 5 }, ['streak_100day']);
  assert.equal(weak.find(a => a.id === 'sky').isUnlocked, false);
  assert.equal(ready.find(a => a.id === 'sky').isUnlocked, true);
});

test('getAccents: obsidian unlocks when all four endgame conditions met', () => {
  // After the legendary expansion (novelist, saga, director, cosmologist,
  // annual_voyager, prompt_maven, year_round_reveler, master, plus the
  // pre-existing streak_100day = 9 legendaries available), obsidian is
  // reachable by:
  //   * 5 legendary achievements
  //   * all 5 prompt categories touched
  //   * 30-day longest streak
  //   * 15 distinct events responded
  const all5Legendaries = ['streak_100day', 'novelist', 'saga', 'director', 'cosmologist'];

  // Missing breadth → locked
  const missingBreadth = getAccents(
    { promptCategoriesTouched: 4, streaks: { longest: 30 }, eventsResponded: 15 },
    all5Legendaries,
  );
  assert.equal(missingBreadth.find(a => a.id === 'obsidian').isUnlocked, false);

  // Missing legendaries → locked
  const onlyOneLegend = getAccents(
    { promptCategoriesTouched: 5, streaks: { longest: 30 }, eventsResponded: 15 },
    ['streak_100day'],
  );
  assert.equal(onlyOneLegend.find(a => a.id === 'obsidian').isUnlocked, false);

  // All conditions met → unlocked
  const grandmaster = getAccents(
    { promptCategoriesTouched: 5, streaks: { longest: 30 }, eventsResponded: 15 },
    all5Legendaries,
  );
  assert.equal(grandmaster.find(a => a.id === 'obsidian').isUnlocked, true);
});

test('getAccents: gold unlocks at 2 legendaries; ruby at 3; teal at 5', () => {
  // The mid-row endgame swatches are now reachable via the new
  // legendary capstones. Verify each threshold.
  const oneLegend = ['streak_100day'];
  const twoLegends = ['streak_100day', 'novelist'];
  const threeLegends = ['streak_100day', 'novelist', 'saga'];
  const fiveLegends = ['streak_100day', 'novelist', 'saga', 'director', 'cosmologist'];

  assert.equal(getAccents({}, oneLegend).find(a => a.id === 'gold').isUnlocked, false);
  assert.equal(getAccents({}, twoLegends).find(a => a.id === 'gold').isUnlocked, true);

  assert.equal(getAccents({}, twoLegends).find(a => a.id === 'ruby').isUnlocked, false);
  assert.equal(getAccents({}, threeLegends).find(a => a.id === 'ruby').isUnlocked, true);

  assert.equal(getAccents({}, threeLegends).find(a => a.id === 'teal').isUnlocked, false);
  assert.equal(getAccents({}, fiveLegends).find(a => a.id === 'teal').isUnlocked, true);
});

test('getAccents: total accent count is 24 (full 3-row palette)', () => {
  const all = getAccents({}, []);
  assert.equal(all.length, 24);
});

test('getAccents: returns every accent regardless of unlock state', () => {
  const all = getAccents({}, []);
  assert.equal(all.length, ACCENTS.length);
});

// ---- resolveActiveTitle ----

test('resolveActiveTitle: uses flair.title pick when unlocked', () => {
  const title = resolveActiveTitle(
    { profile: { flair: { title: 'first_word' } } },
    ['first_word']
  );
  assert.equal(title, 'First Word');
});

test('resolveActiveTitle: ignores flair.title when pick not unlocked', () => {
  // Picked 'streak_100day' but they don't actually have it — should fall
  // through to titleOverride or auto.
  const title = resolveActiveTitle(
    { profile: { flair: { title: 'streak_100day' }, titleOverride: 'Hand-typed' } },
    ['first_word']
  );
  assert.equal(title, 'Hand-typed');
});

test('resolveActiveTitle: titleOverride wins when no flair pick', () => {
  const title = resolveActiveTitle(
    { profile: { titleOverride: 'Hand-typed' } },
    ['first_word']
  );
  assert.equal(title, 'Hand-typed');
});

test('resolveActiveTitle: falls back to rarest unlocked when no override', () => {
  const title = resolveActiveTitle(
    { profile: {} },
    ['first_word', 'streak_100day']
  );
  // streak_100day is legendary → rarest of the unlocked set
  assert.equal(title, 'Centurion');
});

test('resolveActiveTitle: falls back to Newcomer when nothing', () => {
  assert.equal(resolveActiveTitle({}, []), 'Newcomer');
  assert.equal(resolveActiveTitle(null, null), 'Newcomer');
});

// ---- resolveActiveAccent ----

test('resolveActiveAccent: uses picked accent when unlocked', () => {
  // 'moss' in the 24-accent palette unlocks at 1 bronze achievement
  const accent = resolveActiveAccent(
    { profile: { flair: { accent: 'moss' } } },
    {},
    ['first_word']
  );
  assert.equal(accent.id, 'moss');
});

test('resolveActiveAccent: falls back to amber if pick not unlocked', () => {
  const accent = resolveActiveAccent(
    { profile: { flair: { accent: 'obsidian' } } },
    {}, // no stats
    [] // no achievements, so obsidian definitely locked
  );
  assert.equal(accent.id, 'amber');
});

test('resolveActiveAccent: falls back to amber when no settings', () => {
  assert.equal(resolveActiveAccent(null, {}, []).id, 'amber');
  assert.equal(resolveActiveAccent({}, {}, []).id, 'amber');
});

test('resolveActiveAccent: returns color alongside id', () => {
  const accent = resolveActiveAccent({}, {}, []);
  assert.equal(typeof accent.color, 'string');
  assert.match(accent.color, /^#[0-9a-f]{6}$/i);
});

// ---- hexToRgb helper ----

test('hexToRgb: converts #rrggbb hex to comma-separated rgb triple', () => {
  assert.equal(hexToRgb('#d8b36a'), '216, 179, 106');
  assert.equal(hexToRgb('#000000'), '0, 0, 0');
  assert.equal(hexToRgb('#ffffff'), '255, 255, 255');
});

test('hexToRgb: tolerates shorthand #rgb', () => {
  assert.equal(hexToRgb('#fff'), '255, 255, 255');
  assert.equal(hexToRgb('#abc'), '170, 187, 204');
});

test('hexToRgb: tolerates missing leading #', () => {
  assert.equal(hexToRgb('d8b36a'), '216, 179, 106');
});

test('hexToRgb: falls back to amber rgb on malformed input', () => {
  const AMBER = '216, 179, 106';
  assert.equal(hexToRgb(''), AMBER);
  assert.equal(hexToRgb('not-a-color'), AMBER);
  assert.equal(hexToRgb(null), AMBER);
  assert.equal(hexToRgb(undefined), AMBER);
  assert.equal(hexToRgb(42), AMBER);
  assert.equal(hexToRgb('#gggggg'), AMBER);
});

// ---- resolveAccentVars ----

test('resolveAccentVars: returns { id, color, rgb } for the default amber', () => {
  const vars = resolveAccentVars({}, {}, []);
  assert.equal(vars.id, 'amber');
  assert.equal(vars.color, '#d8b36a');
  assert.equal(vars.rgb, '216, 179, 106');
});

test('resolveAccentVars: derives rgb from a picked unlocked accent', () => {
  const vars = resolveAccentVars(
    { profile: { flair: { accent: 'moss' } } },
    {},
    ['first_word']  // unlocks moss (1 bronze)
  );
  assert.equal(vars.id, 'moss');
  assert.equal(vars.color, '#5a7a4e');
  // moss hex → rgb
  assert.equal(vars.rgb, '90, 122, 78');
});
