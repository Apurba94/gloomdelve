// Gloomdelve rules: a turn-based dungeon crawl. No drawing happens here, so it can be tested.
import { Rng, clamp } from "./gamekit.js";

export const MW = 15, MH = 21, FLOORS = 10;
export const WALL = 0, FLOOR = 1, STAIRS = 2, DOOR = 3, MOSS = 4, PIT = 5;
export const SIGHT = 6;

export const MONSTERS = {
  rat: { name: "Gnaw Rat", hp: 6, atk: 2, def: 0, xp: 3, color: "#a8a29e", min: 1, max: 4, letter: "r" },
  bat: { name: "Cave Bat", hp: 5, atk: 2, def: 0, xp: 4, color: "#c4b5fd", min: 1, max: 5, letter: "b", erratic: true, fast: true },
  slime: { name: "Bog Slime", hp: 12, atk: 3, def: 0, xp: 6, color: "#86efac", min: 2, max: 6, letter: "s", splits: true },
  skeleton: { name: "Rattlebones", hp: 14, atk: 5, def: 1, xp: 9, color: "#e7e5e4", min: 3, max: 8, letter: "z" },
  archer: { name: "Bone Archer", hp: 10, atk: 4, def: 0, xp: 10, color: "#fcd34d", min: 4, max: 9, letter: "a", ranged: 5 },
  shade: { name: "Shade", hp: 16, atk: 6, def: 1, xp: 13, color: "#818cf8", min: 5, max: 10, letter: "h", drains: true },
  brute: { name: "Delve Brute", hp: 34, atk: 8, def: 3, xp: 20, color: "#f87171", min: 6, max: 10, letter: "B" },
  witch: { name: "Mire Witch", hp: 20, atk: 7, def: 1, xp: 22, color: "#f0abfc", min: 7, max: 10, letter: "w", ranged: 4, poisons: true },
  warden: { name: "The Gloom Warden", hp: 100, atk: 10, def: 3, xp: 100, color: "#fb7185", min: 99, max: 99, letter: "W", boss: true },
};

export const RUNES = {
  bolt: { name: "Spark", cost: 2, text: "Strike the nearest foe for 6 + level", color: "#fde047" },
  mend: { name: "Mend", cost: 3, text: "Heal 12 health", color: "#4ade80" },
  blink: { name: "Blink", cost: 2, text: "Vanish to a random spot in sight", color: "#60a5fa" },
  ward: { name: "Ward", cost: 3, text: "Block all damage for 3 turns", color: "#e2e8f0" },
  quake: { name: "Quake", cost: 4, text: "Hit every foe next to you for 8", color: "#fb923c" },
  hush: { name: "Hush", cost: 3, text: "Monsters lose your trail for 6 turns", color: "#a78bfa" },
};

export const RELICS = {
  fang: { name: "Serpent Fang", text: "+2 attack" },
  plate: { name: "Old Plate", text: "+2 armour" },
  heart: { name: "Ember Heart", text: "+15 max health" },
  lamp: { name: "Glass Lamp", text: "See 2 tiles further" },
  chalice: { name: "Thirsty Chalice", text: "Heal 2 on each kill" },
  boots: { name: "Soft Boots", text: "Monsters hear you less" },
};

/** Things earned across runs with embers, the currency that survives death. */
export const UPGRADES = [
  { id: "vigor", name: "Vigor", text: "+6 starting health", cost: 15, max: 5 },
  { id: "edge", name: "Keen Edge", text: "+1 starting attack", cost: 25, max: 3 },
  { id: "focus", name: "Focus", text: "+3 starting mana", cost: 20, max: 3 },
  { id: "pack", name: "Deep Pack", text: "Start with a potion", cost: 18, max: 2 },
];

function carve(map, a, b, rng) {
  let [x, y] = [a.cx, a.cy];
  const horizontalFirst = rng.chance(0.5);
  const walk = (tx, ty) => {
    while (x !== tx || y !== ty) {
      if (map[y][x] === WALL) map[y][x] = FLOOR;
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
    }
  };
  if (horizontalFirst) { walk(b.cx, y); walk(x, b.cy); } else { walk(x, b.cy); walk(b.cx, y); }
}

export function makeFloor(depth, seed) {
  const rng = new Rng(seed * 31 + depth * 977);
  const map = Array.from({ length: MH }, () => Array(MW).fill(WALL));
  const rooms = [];
  if (depth === FLOORS) {
    const room = { x: 2, y: 3, w: MW - 4, h: MH - 7 };
    room.cx = 7; room.cy = 10;
    rooms.push(room);
  }
  for (let t = 0; t < 60 && rooms.length < 7 && depth !== FLOORS; t++) {
    const w = rng.int(3, 6), h = rng.int(3, 6);
    const x = rng.int(1, MW - w - 2), y = rng.int(1, MH - h - 2);
    const room = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
    if (rooms.every((o) => x + w + 1 < o.x || o.x + o.w + 1 < x || y + h + 1 < o.y || o.y + o.h + 1 < y)) rooms.push(room);
  }
  for (const o of rooms) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) map[y][x] = rng.chance(0.08) ? MOSS : FLOOR;
  rooms.sort((a, b) => a.cy - b.cy);
  for (let i = 1; i < rooms.length; i++) carve(map, rooms[i - 1], rooms[i], rng);
  const start = rooms[depth === FLOORS ? 0 : rooms.length - 1];
  const exit = rooms[0];
  const stairs = depth === FLOORS ? null : { x: exit.cx, y: exit.cy };
  if (stairs) map[stairs.y][stairs.x] = STAIRS;
  const px = depth === FLOORS ? 7 : start.cx, py = depth === FLOORS ? MH - 6 : start.cy;
  map[py][px] = FLOOR;
  const free = () => {
    for (let t = 0; t < 200; t++) {
      const r = rng.pick(rooms);
      const x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
      if (map[y][x] !== STAIRS && Math.abs(x - px) + Math.abs(y - py) > 3) return { x, y };
    }
    return { x: rooms[0].cx, y: rooms[0].cy };
  };
  const monsters = [];
  const taken = new Set();
  const place = (kind) => {
    const p = free();
    const key = p.x + "," + p.y;
    if (taken.has(key)) return;
    taken.add(key);
    const d = MONSTERS[kind];
    const scale = 1 + (depth - 1) * 0.05;
    monsters.push({ kind, x: p.x, y: p.y, hp: Math.round(d.hp * scale), max: Math.round(d.hp * scale), awake: false, cool: 0, id: monsters.length + 1 });
  };
  if (depth === FLOORS) {
    monsters.push({ kind: "warden", x: 7, y: 6, hp: MONSTERS.warden.hp, max: MONSTERS.warden.hp, awake: true, cool: 0, id: 1 });
    for (let i = 0; i < 2; i++) place("skeleton");
  } else {
    const pool = Object.keys(MONSTERS).filter((k) => MONSTERS[k].min <= depth && MONSTERS[k].max >= depth);
    const n = 4 + Math.floor(depth * 0.8);
    for (let i = 0; i < n; i++) place(rng.pick(pool));
  }
  const items = [];
  const drop = (kind, value) => { const p = free(); if (!items.some((i) => i.x === p.x && i.y === p.y)) items.push({ ...p, kind, value }); };
  for (let i = 0; i < 2 + (depth >= 5 ? 1 : 0); i++) drop("potion");
  drop("mana");
  for (let i = 0; i < 3; i++) drop("gold", rng.int(4, 8) * depth);
  if (depth % 2 === 0 || rng.chance(0.4)) drop("rune", rng.pick(Object.keys(RUNES)));
  if (depth % 3 === 0) drop("relic", rng.pick(Object.keys(RELICS)));
  return { map, stairs, start: { x: px, y: py }, monsters, items, seen: Array.from({ length: MH }, () => Array(MW).fill(false)), depth };
}

/** Bresenham line of sight. */
export function canSee(map, ax, ay, bx, by) {
  let dx = Math.abs(bx - ax), dy = Math.abs(by - ay), sx = Math.sign(bx - ax), sy = Math.sign(by - ay), err = dx - dy;
  let x = ax, y = ay;
  while (x !== bx || y !== by) {
    const e = 2 * err;
    if (e > -dy) { err -= dy; x += sx; }
    if (e < dx) { err += dx; y += sy; }
    if (x === bx && y === by) return true;
    if (map[y][x] === WALL) return false;
  }
  return true;
}

export const passable = (t) => t !== WALL;

export class Run {
  constructor(seed = 1, meta = {}) {
    this.seed = seed;
    this.rng = new Rng(seed ^ 0x5a5a);
    const m = (k) => meta[k] || 0;
    this.hero = { x: 0, y: 0, hp: 30 + m("vigor") * 6, maxHp: 30 + m("vigor") * 6, mana: 6 + m("focus") * 3, maxMana: 6 + m("focus") * 3, atk: 4 + m("edge"), def: 0, level: 1, xp: 0, gold: 0, potions: m("pack"), ward: 0, hush: 0, poison: 0 };
    this.runes = ["bolt"];
    this.relics = [];
    this.depth = 0;
    this.kills = 0;
    this.turns = 0;
    this.state = "playing";
    this.log = [];
    this.fx = [];
    this.descend();
  }
  say(text) { this.log.push(text); if (this.log.length > 30) this.log.shift(); }
  sight() { return SIGHT + (this.relics.includes("lamp") ? 2 : 0); }
  descend() {
    this.depth++;
    this.floor = makeFloor(this.depth, this.seed);
    this.hero.x = this.floor.start.x;
    this.hero.y = this.floor.start.y;
    this.say(this.depth === FLOORS ? "The Gloom Warden turns towards you." : `Floor ${this.depth}.`);
    this.look();
  }
  look() {
    const f = this.floor, h = this.hero, s = this.sight();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (Math.hypot(x - h.x, y - h.y) <= s && canSee(f.map, h.x, h.y, x, y)) f.seen[y][x] = true;
  }
  visible(x, y) {
    const h = this.hero;
    return Math.hypot(x - h.x, y - h.y) <= this.sight() && canSee(this.floor.map, h.x, h.y, x, y);
  }
  monsterAt(x, y) { return this.floor.monsters.find((m) => m.x === x && m.y === y); }
  xpNeed() { return 10 + (this.hero.level - 1) * 12; }
  gainXp(n) {
    const h = this.hero;
    h.xp += n;
    while (h.xp >= this.xpNeed()) {
      h.xp -= this.xpNeed();
      h.level++;
      h.maxHp += 6;
      h.hp = Math.min(h.maxHp, h.hp + 14);
      if (h.level % 3 === 0) h.def++;
      h.mana = h.maxMana;
      h.atk += 1;
      this.say(`Level ${h.level}! You feel stronger.`);
      this.fx.push({ kind: "level" });
    }
  }
  hurtMonster(m, amount) {
    const d = MONSTERS[m.kind];
    const hit = Math.max(1, amount - d.def);
    m.hp -= hit;
    m.awake = true;
    this.fx.push({ kind: "hit", x: m.x, y: m.y, amount: hit });
    if (m.hp > 0) return;
    this.floor.monsters = this.floor.monsters.filter((o) => o !== m);
    this.kills++;
    this.say(`${d.name} falls.`);
    this.gainXp(d.xp);
    if (this.relics.includes("chalice")) this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 2);
    if (d.splits && m.max > 5) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = m.x + dx, y = m.y + dy;
        if (passable(this.floor.map[y]?.[x] ?? WALL) && !this.monsterAt(x, y) && !(x === this.hero.x && y === this.hero.y)) {
          const half = Math.floor(m.max / 2);
          this.floor.monsters.push({ kind: m.kind, x, y, hp: half, max: half, awake: true, cool: 0, id: 1000 + this.turns * 10 + dx + dy * 3 });
          break;
        }
      }
    }
    if (d.boss) { this.state = "won"; this.say("The Gloom lifts."); }
  }
  hurtHero(amount, who) {
    const h = this.hero;
    if (h.ward > 0) { this.fx.push({ kind: "block", x: h.x, y: h.y }); return; }
    const hit = Math.max(1, amount - h.def);
    h.hp -= hit;
    this.fx.push({ kind: "hurt", x: h.x, y: h.y, amount: hit });
    if (h.hp <= 0) { h.hp = 0; this.state = "dead"; this.killedBy = who; this.say(`Slain by ${who}.`); }
  }
  /** Move or attack one step. dx, dy are -1, 0 or 1. */
  move(dx, dy) {
    if (this.state !== "playing") return false;
    const h = this.hero, f = this.floor;
    const x = h.x + dx, y = h.y + dy;
    const m = this.monsterAt(x, y);
    if (m) {
      const roll = this.rng.int(0, 2);
      this.hurtMonster(m, h.atk + roll);
      this.endTurn();
      return true;
    }
    if (!passable(f.map[y]?.[x] ?? WALL)) return false;
    h.x = x;
    h.y = y;
    this.pickup();
    if (f.stairs && x === f.stairs.x && y === f.stairs.y) { this.descend(); return true; }
    this.endTurn();
    return true;
  }
  wait() { if (this.state === "playing") { this.hero.mana = Math.min(this.hero.maxMana, this.hero.mana + 1); this.endTurn(); } }
  pickup() {
    const h = this.hero, f = this.floor;
    const i = f.items.findIndex((t) => t.x === h.x && t.y === h.y);
    if (i < 0) return;
    const it = f.items[i];
    f.items.splice(i, 1);
    this.fx.push({ kind: "pickup", x: h.x, y: h.y });
    if (it.kind === "gold") { h.gold += it.value; this.say(`${it.value} gold.`); }
    if (it.kind === "potion") { h.potions++; this.say("A potion."); }
    if (it.kind === "mana") { h.mana = h.maxMana; this.say("Mana restored."); }
    if (it.kind === "rune") {
      if (this.runes.includes(it.value)) { h.gold += 15; this.say("A rune you know: sold for 15 gold."); } else if (this.runes.length < 4) { this.runes.push(it.value); this.say(`Rune learned: ${RUNES[it.value].name}.`); } else { h.gold += 15; this.say("No room for more runes: 15 gold."); }
    }
    if (it.kind === "relic") this.gainRelic(it.value);
  }
  gainRelic(id) {
    const h = this.hero;
    if (this.relics.includes(id)) { h.gold += 30; return; }
    this.relics.push(id);
    this.say(`Relic: ${RELICS[id].name}. ${RELICS[id].text}.`);
    if (id === "fang") h.atk += 2;
    if (id === "plate") h.def += 2;
    if (id === "heart") { h.maxHp += 15; h.hp += 15; }
  }
  drink() {
    const h = this.hero;
    if (!h.potions || h.hp >= h.maxHp || this.state !== "playing") return false;
    h.potions--;
    h.poison = 0;
    h.hp = Math.min(h.maxHp, h.hp + 15);
    this.fx.push({ kind: "heal", x: h.x, y: h.y, amount: 15 });
    this.endTurn();
    return true;
  }
  cast(id) {
    const r = RUNES[id], h = this.hero, f = this.floor;
    if (this.state !== "playing" || h.mana < r.cost || !this.runes.includes(id)) return false;
    if (id === "bolt") {
      const near = f.monsters.filter((m) => this.visible(m.x, m.y)).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (!near) return false;
      this.fx.push({ kind: "bolt", x: near.x, y: near.y });
      this.hurtMonster(near, 6 + h.level);
    }
    if (id === "mend") { h.hp = Math.min(h.maxHp, h.hp + 12); this.fx.push({ kind: "heal", x: h.x, y: h.y, amount: 12 }); }
    if (id === "ward") h.ward = 4;
    if (id === "hush") { h.hush = 7; for (const m of f.monsters) if (!MONSTERS[m.kind].boss) m.awake = false; }
    if (id === "quake") {
      const near = f.monsters.filter((m) => Math.abs(m.x - h.x) <= 1 && Math.abs(m.y - h.y) <= 1);
      if (!near.length) return false;
      this.fx.push({ kind: "quake" });
      for (const m of near) this.hurtMonster(m, 8);
    }
    if (id === "blink") {
      const spots = [];
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (f.map[y][x] === FLOOR && this.visible(x, y) && !this.monsterAt(x, y) && Math.hypot(x - h.x, y - h.y) > 2) spots.push({ x, y });
      if (!spots.length) return false;
      const s = this.rng.pick(spots);
      h.x = s.x;
      h.y = s.y;
      this.pickup();
    }
    h.mana -= r.cost;
    this.endTurn();
    return true;
  }
  /** One step towards the hero, using a walk map so monsters find their way around walls. */
  stepToward(m, dist) {
    const f = this.floor;
    let best = null, bestD = dist[m.y][m.x];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = m.x + dx, y = m.y + dy;
      const d = dist[y]?.[x];
      if (d != null && d >= 0 && d < bestD && passable(f.map[y][x]) && !this.monsterAt(x, y) && !(x === this.hero.x && y === this.hero.y)) { best = { x, y }; bestD = d; }
    }
    if (best) { m.x = best.x; m.y = best.y; }
  }
  walkMap() {
    const f = this.floor, h = this.hero;
    const d = Array.from({ length: MH }, () => Array(MW).fill(-1));
    d[h.y][h.x] = 0;
    const q = [[h.x, h.y]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (d[ny]?.[nx] === -1 && passable(f.map[ny][nx])) { d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); }
      }
    }
    return d;
  }
  act(m, dist) {
    const d = MONSTERS[m.kind], h = this.hero, f = this.floor;
    const near = Math.abs(m.x - h.x) + Math.abs(m.y - h.y);
    const hearing = this.relics.includes("boots") ? 3 : 5;
    if (!m.awake) {
      if (h.hush <= 0 && dist[m.y][m.x] >= 0 && dist[m.y][m.x] <= hearing) { m.awake = true; this.fx.push({ kind: "alert", x: m.x, y: m.y }); }
      return;
    }
    if (d.erratic && this.rng.chance(0.4)) {
      const [dx, dy] = this.rng.pick([[0, -1], [0, 1], [-1, 0], [1, 0]]);
      if (passable(f.map[m.y + dy]?.[m.x + dx] ?? WALL) && !this.monsterAt(m.x + dx, m.y + dy) && !(m.x + dx === h.x && m.y + dy === h.y)) { m.x += dx; m.y += dy; }
      return;
    }
    if (near === 1) {
      this.hurtHero(d.atk + this.rng.int(0, 1), d.name);
      if (d.drains && h.ward <= 0) h.mana = Math.max(0, h.mana - 1);
      return;
    }
    if (d.ranged && near <= d.ranged && canSee(f.map, m.x, m.y, h.x, h.y)) {
      if (m.cool > 0) { m.cool--; return; }
      m.cool = 1;
      this.fx.push({ kind: "arrow", x: m.x, y: m.y, tx: h.x, ty: h.y, color: d.color });
      this.hurtHero(d.atk, d.name);
      if (d.poisons && h.ward <= 0) h.poison = 3;
      return;
    }
    if (dist[m.y][m.x] > 0) this.stepToward(m, dist);
  }
  endTurn() {
    if (this.state !== "playing") return;
    const h = this.hero;
    this.turns++;
    if (this.turns % 4 === 0) h.mana = Math.min(h.maxMana, h.mana + 1);
    const dist = this.walkMap();
    for (const m of [...this.floor.monsters]) {
      if (this.state !== "playing") break;
      this.act(m, dist);
      if (MONSTERS[m.kind].fast && this.state === "playing") this.act(m, this.walkMap());
      if (MONSTERS[m.kind].boss && this.turns % 6 === 0 && this.floor.monsters.length < 5) this.summon(m);
    }
    if (h.poison > 0 && this.state === "playing") { h.poison--; this.hurtHero(2, "poison"); }
    h.ward = Math.max(0, h.ward - 1);
    h.hush = Math.max(0, h.hush - 1);
    this.look();
  }
  summon(boss) {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) {
      const x = boss.x + dx, y = boss.y + dy;
      if (passable(this.floor.map[y]?.[x] ?? WALL) && !this.monsterAt(x, y) && !(x === this.hero.x && y === this.hero.y)) {
        this.floor.monsters.push({ kind: "skeleton", x, y, hp: 10, max: 10, awake: true, cool: 0, id: 2000 + this.turns });
        this.say("The Warden calls up the dead.");
        return;
      }
    }
  }
  /** Embers kept after the run ends. */
  embers() { return this.depth * 3 + this.kills + Math.floor(this.hero.gold / 20) + (this.state === "won" ? 40 : 0); }
}

/** The first step of a shortest walk to a tile the hero has seen, for tap-to-walk. Returns [dx, dy] or null. */
export function pathStep(run, tx, ty) {
  const f = run.floor, h = run.hero;
  if (!f.map[ty]?.[tx] || !f.seen[ty][tx]) return null;
  const from = Array.from({ length: MH }, () => Array(MW).fill(null));
  from[h.y][h.x] = [0, 0];
  const q = [[h.x, h.y]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (x === tx && y === ty) {
      let cx = x, cy = y;
      while (true) {
        const [dx, dy] = from[cy][cx];
        if (cx - dx === h.x && cy - dy === h.y) return [dx, dy];
        cx -= dx;
        cy -= dy;
      }
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (from[ny]?.[nx] === null && passable(f.map[ny][nx]) && f.seen[ny][nx] && !(run.monsterAt(nx, ny) && !(nx === tx && ny === ty))) { from[ny][nx] = [dx, dy]; q.push([nx, ny]); }
    }
  }
  return null;
}

/** A careful player used by the tests to check that a run can be finished. */
export function botTurn(run) {
  const h = run.hero, f = run.floor;
  const foes = f.monsters.filter((m) => run.visible(m.x, m.y));
  if (h.hp < h.maxHp * 0.45 && h.potions) { if (run.drink()) return; }
  if (h.hp < h.maxHp * 0.5 && run.runes.includes("mend") && run.cast("mend")) return;
  const adj = foes.find((m) => Math.abs(m.x - h.x) + Math.abs(m.y - h.y) === 1);
  if (adj) { run.move(adj.x - h.x, adj.y - h.y); return; }
  if (foes.length && h.mana >= 2 && run.cast("bolt")) return;
  if (foes.length) { const s = pathStep(run, foes[0].x, foes[0].y); if (s) { run.move(...s); return; } }
  const loot = f.items.filter((i) => f.seen[i.y][i.x])[0];
  const targets = loot ? [loot] : [];
  if (h.hp >= h.maxHp * 0.6 && f.stairs && f.seen[f.stairs.y][f.stairs.x] && !loot) targets.push(f.stairs);
  if (!targets.length && h.hp < h.maxHp * 0.6) { run.wait(); return; }
  for (const t of targets) { const s = pathStep(run, t.x, t.y); if (s) { run.move(...s); return; } }
  // Walk to the nearest tile next to something unseen.
  const edge = [];
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) if (f.seen[y][x] && passable(f.map[y][x]) && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([a, b]) => !f.seen[y + b][x + a])) edge.push({ x, y, d: Math.abs(x - h.x) + Math.abs(y - h.y) });
  edge.sort((a, b) => a.d - b.d);
  for (const t of edge) { const s = pathStep(run, t.x, t.y); if (s) { run.move(...s); return; } }
  if (f.stairs) { const s = pathStep(run, f.stairs.x, f.stairs.y); if (s) { run.move(...s); return; } }
  if (f.monsters[0]) { const s = pathStep(run, f.monsters[0].x, f.monsters[0].y); if (s) { run.move(...s); return; } }
  run.wait();
}

export const clampCamera = (v, size, span) => clamp(v, 0, Math.max(0, size - span));
