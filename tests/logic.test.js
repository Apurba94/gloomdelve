import assert from "node:assert/strict";
import test from "node:test";
import { FLOOR, FLOORS, MH, MONSTERS, MW, RELICS, RUNES, Run, STAIRS, WALL, botTurn, canSee, makeFloor, pathStep, passable } from "../src/logic.js";

function open(run) {
  // A bare room, so that rules can be tested without the luck of generation.
  const f = run.floor;
  f.map = Array.from({ length: MH }, (_, y) => Array.from({ length: MW }, (_, x) => (x === 0 || y === 0 || x === MW - 1 || y === MH - 1 ? WALL : FLOOR)));
  f.monsters = [];
  f.items = [];
  f.stairs = null;
  run.hero.x = 7; run.hero.y = 10;
  return f;
}
const foe = (kind, x, y, extra = {}) => ({ kind, x, y, hp: MONSTERS[kind].hp, max: MONSTERS[kind].hp, awake: true, cool: 0, id: x * 100 + y, ...extra });

function reachable(f) {
  const seen = new Set([f.start.x + "," + f.start.y]);
  const q = [[f.start.x, f.start.y]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + a, ny = y + b, k = nx + "," + ny;
      if (!seen.has(k) && passable(f.map[ny]?.[nx] ?? WALL)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return seen;
}

test("floors repeat for a seed and differ between seeds", () => {
  assert.deepEqual(makeFloor(3, 11).map, makeFloor(3, 11).map);
  assert.notDeepEqual(makeFloor(3, 11).map, makeFloor(3, 12).map);
});

test("on every floor, the stairs, monsters and items can all be reached", () => {
  for (let seed = 1; seed <= 25; seed++) {
    for (let d = 1; d <= FLOORS; d++) {
      const f = makeFloor(d, seed);
      const r = reachable(f);
      if (f.stairs) { assert.ok(r.has(f.stairs.x + "," + f.stairs.y), `seed ${seed} floor ${d}`); assert.equal(f.map[f.stairs.y][f.stairs.x], STAIRS); }
      for (const t of [...f.monsters, ...f.items]) assert.ok(r.has(t.x + "," + t.y), `seed ${seed} floor ${d}`);
    }
  }
});

test("the last floor holds the Warden and has no stairs", () => {
  const f = makeFloor(FLOORS, 4);
  assert.equal(f.stairs, null);
  assert.ok(f.monsters.some((m) => m.kind === "warden"));
});

test("walls block sight", () => {
  const map = Array.from({ length: 5 }, () => Array(5).fill(FLOOR));
  assert.ok(canSee(map, 0, 2, 4, 2));
  map[2][2] = WALL;
  assert.equal(canSee(map, 0, 2, 4, 2), false);
});

test("walking into a wall takes no turn", () => {
  const r = new Run(1);
  open(r);
  r.hero.x = 1;
  const t = r.turns;
  assert.equal(r.move(-1, 0), false);
  assert.equal(r.turns, t);
});

test("walking into a monster attacks it and armour reduces the blow", () => {
  const r = new Run(1);
  const f = open(r);
  f.monsters.push(foe("brute", 8, 10));
  r.move(1, 0);
  const m = f.monsters[0];
  assert.equal(r.hero.x, 7);
  assert.ok(m.hp < m.max);
  assert.ok(m.max - m.hp <= r.hero.atk + 2 - MONSTERS.brute.def);
});

test("sleeping monsters wake on noise, and the boots make that harder", () => {
  const r = new Run(1);
  const f = open(r);
  f.monsters.push(foe("rat", 11, 10, { awake: false }));
  r.wait();
  assert.equal(f.monsters[0].awake, true);
  const s = new Run(1);
  const g = open(s);
  s.relics.push("boots");
  g.monsters.push(foe("rat", 11, 10, { awake: false }));
  s.wait();
  assert.equal(g.monsters[0].awake, false);
});

test("monsters find their way around walls", () => {
  const r = new Run(1);
  const f = open(r);
  for (let y = 1; y < MH - 1; y++) if (y !== 18) f.map[y][5] = WALL;
  r.hero.x = 3; r.hero.y = 3;
  f.monsters.push(foe("rat", 8, 3));
  for (let i = 0; i < 45; i++) { r.hero.hp = r.hero.maxHp; r.wait(); }
  const m = f.monsters[0];
  assert.equal(Math.abs(m.x - 3) + Math.abs(m.y - 3), 1);
});

test("archers fire from range only with a clear line", () => {
  const r = new Run(1);
  const f = open(r);
  f.monsters.push(foe("archer", 7, 6));
  const hp = r.hero.hp;
  r.wait();
  assert.ok(r.hero.hp < hp);
  f.map[8][7] = WALL;
  const after = r.hero.hp;
  r.wait();
  r.wait();
  assert.equal(r.hero.hp, after);
});

test("slimes split when killed", () => {
  const r = new Run(1);
  const f = open(r);
  const s = foe("slime", 8, 10, { hp: 1 });
  f.monsters.push(s);
  r.hurtMonster(s, 50);
  assert.equal(f.monsters.length, 1);
  assert.equal(f.monsters[0].max, 6);
});

test("every rune does its job and costs mana", () => {
  const r = new Run(1);
  const f = open(r);
  r.runes = Object.keys(RUNES);
  r.hero.mana = r.hero.maxMana = 99;
  const m = foe("brute", 9, 10);
  f.monsters.push(m);
  assert.ok(r.cast("bolt"));
  assert.ok(m.hp < m.max);
  r.hero.hp = 5;
  assert.ok(r.cast("mend"));
  assert.ok(r.hero.hp > 5);
  r.hero.hp = r.hero.maxHp = 999;
  assert.ok(r.cast("ward"));
  assert.ok(r.hero.ward > 0);
  const hp = r.hero.hp;
  r.hurtHero(50, "test");
  assert.equal(r.hero.hp, hp);
  r.hero.ward = 0;
  assert.ok(r.cast("hush"));
  assert.equal(m.awake, false);
  m.x = r.hero.x + 1; m.y = r.hero.y;
  const before = m.hp;
  assert.ok(r.cast("quake"));
  assert.ok(m.hp < before);
  const [x, y] = [r.hero.x, r.hero.y];
  assert.ok(r.cast("blink"));
  assert.notDeepEqual([r.hero.x, r.hero.y], [x, y]);
  r.hero.mana = 0;
  assert.equal(r.cast("mend"), false);
});

test("a spell with no target wastes neither mana nor a turn", () => {
  const r = new Run(1);
  open(r);
  const { mana } = r.hero, t = r.turns;
  assert.equal(r.cast("bolt"), false);
  assert.equal(r.hero.mana, mana);
  assert.equal(r.turns, t);
});

test("potions heal and cure, and are not wasted at full health", () => {
  const r = new Run(1, { pack: 1 });
  open(r);
  assert.equal(r.drink(), false);
  r.hero.hp = 5; r.hero.poison = 3;
  assert.ok(r.drink());
  assert.equal(r.hero.poison, 0);
  assert.equal(r.hero.potions, 0);
});

test("relics change the hero", () => {
  const r = new Run(1);
  const { atk, def, maxHp } = r.hero;
  for (const id of Object.keys(RELICS)) r.gainRelic(id);
  assert.equal(r.hero.atk, atk + 2);
  assert.equal(r.hero.def, def + 2);
  assert.equal(r.hero.maxHp, maxHp + 15);
  assert.equal(r.sight(), 8);
});

test("permanent upgrades apply to a new run", () => {
  const plain = new Run(1), strong = new Run(1, { vigor: 2, edge: 1, focus: 1, pack: 2 });
  assert.equal(strong.hero.maxHp, plain.hero.maxHp + 12);
  assert.equal(strong.hero.atk, plain.hero.atk + 1);
  assert.equal(strong.hero.maxMana, plain.hero.maxMana + 3);
  assert.equal(strong.hero.potions, 2);
});

test("experience levels up the hero", () => {
  const r = new Run(1);
  const { atk } = r.hero;
  r.gainXp(r.xpNeed());
  assert.equal(r.hero.level, 2);
  assert.equal(r.hero.atk, atk + 1);
});

test("tap-to-walk finds a route around walls and refuses unknown tiles", () => {
  const r = new Run(1);
  const f = open(r);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) f.seen[y][x] = true;
  for (let y = 1; y < MH - 2; y++) f.map[y][8] = WALL;
  assert.deepEqual(pathStep(r, 7, 12), [0, 1]);
  assert.ok(pathStep(r, 10, 10));
  f.seen[3][3] = false;
  assert.equal(pathStep(r, 3, 3), null);
});

test("the stairs lead down, and dying ends the run with embers", () => {
  const r = new Run(2);
  const f = open(r);
  f.stairs = { x: 8, y: 10 };
  f.map[10][8] = STAIRS;
  r.move(1, 0);
  assert.equal(r.depth, 2);
  r.hurtHero(9999, "a test");
  assert.equal(r.state, "dead");
  assert.equal(r.killedBy, "a test");
  assert.ok(r.embers() >= 6);
});

test("killing the Warden wins", () => {
  const r = new Run(3);
  const f = open(r);
  const w = foe("warden", 8, 10, { hp: 1 });
  f.monsters.push(w);
  r.hurtMonster(w, 99);
  assert.equal(r.state, "won");
  assert.ok(r.embers() >= 40);
});

function campaign(meta) {
  const depths = [];
  let wins = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const r = new Run(seed, meta);
    for (let t = 0; t < 6000 && r.state === "playing"; t++) botTurn(r);
    depths.push(r.depth);
    if (r.state === "won") wins++;
  }
  return { wins, mean: depths.reduce((a, b) => a + b) / depths.length };
}

test("a careful bot gets deep into the dungeon without upgrades", () => {
  assert.ok(campaign({}).mean >= 5);
});

test("permanent upgrades make a real difference to winning", () => {
  const plain = campaign({}), full = campaign({ vigor: 5, edge: 3, focus: 3, pack: 2 });
  assert.ok(full.wins >= 15, `wins ${full.wins}`);
  assert.ok(full.wins > plain.wins * 3, `${full.wins} against ${plain.wins}`);
});
