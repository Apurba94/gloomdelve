// Gloomdelve screens: swipe or tap to move, and the upgrade shop between runs.
import { Game, Result, Scene, Title, backdrop, bar, compose, dot, panel, para, text } from "./gamekit.js";
import { FLOORS, MH, MONSTERS, MOSS, MW, RELICS, RUNES, Run, STAIRS, UPGRADES, WALL, pathStep } from "./logic.js";

export const game = new Game({ id: "gloomdelve", title: "Gloomdelve", theme: { accent: "#c084fc", onAccent: "#1a0b2e", bg: "#0a0610", bg2: "#1d1029", panel: "#281838" }, defaults: { embers: 0, meta: {}, runs: 0, wins: 0, deepest: 0, daily: "" } });
const data = game.store.data;
const T = 25;

const HELP = [
  ["The delve", "Reach the bottom of the dungeon, ten floors down, and defeat the Gloom Warden. Death is final: each run starts again from the top."],
  ["Moving", "Swipe in any direction to take one step, or tap a tile you have seen to walk there. Walking into a monster attacks it.\n\nEverything moves when you do, so think before each step."],
  ["Runes and potions", "Tap a rune to cast it. Spark needs a target in sight. The Rest button passes a turn and restores a little mana."],
  ["Sound", "Sleeping monsters wake when you come near. Soft Boots let you pass closer, and the Hush rune sends awake monsters back to sleep."],
  ["Embers", "Each run earns embers, however it ends. Spend them at the Ember Shrine on upgrades that last forever."],
];

function art(c, g, t) {
  backdrop(c, g, t);
  for (let i = 0; i < 9; i++) {
    const y = 250 + i * 34, w = 300 - i * 26;
    panel(c, 195 - w / 2, y, w, 24, `rgba(192,132,252,${0.05 + i * 0.05})`, 6);
  }
  dot(c, 195, 560 + Math.sin(t * 2) * 3, 5, "#fbbf24");
}

const title = () => new Title(game, {
  tag: `${data.wins} wins, deepest floor ${data.deepest}, ${data.embers} embers`,
  art,
  help: HELP,
  play: () => game.go(new Delve(game, Date.now() % 1000000)),
  buttons: [["Daily delve", () => game.go(new Delve(game, dailySeed())), "ghost"], ["Ember Shrine", () => game.go(new Shrine(game)), "ghost"]],
});

function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
}

class Shrine extends Scene {
  enter() { this.layout(); }
  layout() {
    const g = this.g;
    this.ui.clear();
    UPGRADES.forEach((u, i) => {
      const lvl = data.meta[u.id] || 0;
      const cost = u.cost * (lvl + 1);
      const b = this.ui.button(24, 120 + i * 92, 342, 80, u.name, () => {
        if (lvl >= u.max || data.embers < cost) { g.sound.play("bad"); return; }
        data.embers -= cost;
        data.meta[u.id] = lvl + 1;
        g.store.save();
        g.sound.play("power");
        this.layout();
      }, {
        draw: (c) => {
          text(c, `${u.name} ${lvl}/${u.max}`, b.x + 16, b.y + 26, { size: 17, align: "left", weight: 800 });
          text(c, u.text, b.x + 16, b.y + 54, { size: 13, align: "left", color: g.theme.muted });
          text(c, lvl >= u.max ? "Done" : cost + " embers", b.x + b.w - 14, b.y + 40, { size: 14, align: "right", color: data.embers >= cost ? g.theme.gold : g.theme.muted, weight: 700 });
        },
      });
    });
    this.ui.button(55, g.H - 70, 280, 50, "Back", () => g.go(title()));
  }
  draw(c) {
    const g = this.g;
    backdrop(c, g, this.t);
    text(c, "Ember Shrine", g.W / 2, 62, { size: 28, weight: 800 });
    text(c, `${data.embers} embers`, g.W / 2, 94, { size: 16, color: g.theme.gold, weight: 700 });
  }
}

class Delve extends Scene {
  constructor(g, seed) { super(g); this.seed = seed; }
  get top() { return 58; }
  get rows() { return Math.floor((this.g.H - 58 - 164) / T); }
  enter() {
    this.run = new Run(this.seed, data.meta);
    this.g.sound.music(compose(this.seed % 50, 60, 73));
    this.hits = [];
    this.walk = null;
    this.buttons();
  }
  buttons() {
    const g = this.g, ui = this.ui, run = this.run, y = g.H - 62;
    ui.clear();
    const w = 342 / 4;
    for (let i = 0; i < 4; i++) {
      const id = run.runes[i];
      ui.button(24 + i * w, y - 58, w - 6, 52, id ? RUNES[id].name : "-", () => this.act(() => run.cast(id)), { disabled: !id, sub: id ? RUNES[id].cost + " mana" : "", size: 13, stroke: id ? RUNES[id].color : undefined });
    }
    this.pot = ui.button(24, y, 104, 52, "Potion", () => this.act(() => run.drink()), { size: 13 });
    ui.button(136, y, 104, 52, "Rest", () => this.act(() => { run.wait(); return true; }), { size: 13, sub: "+1 mana" });
    ui.button(248, y, 118, 52, "Stairs", () => { this.walk = run.floor.stairs ? { ...run.floor.stairs } : null; if (!this.walk) this.note("No stairs on this floor"); }, { size: 13 });
  }
  note(s) { this.run.say(s); }
  act(fn) {
    this.walk = null;
    if (fn()) this.after(); else this.g.sound.play("bad");
  }
  after() {
    const g = this.g, run = this.run;
    const col = (x) => this.px(x), row = (y) => this.py(y);
    for (const e of run.fx) {
      if (e.kind === "hit") { g.fx.burst(col(e.x), row(e.y), "#fff", 6, 70, 0.3); g.fx.float(col(e.x), row(e.y) - 10, "-" + e.amount, "#fde047", 14); g.sound.play("hit"); }
      if (e.kind === "hurt") { g.fx.float(col(e.x), row(e.y) - 10, "-" + e.amount, "#fb7185", 15); g.shake(0.15); g.buzz(30); g.sound.play("bad"); }
      if (e.kind === "heal") { g.fx.float(col(e.x), row(e.y) - 10, "+" + e.amount, "#4ade80", 15); g.sound.play("ok"); }
      if (e.kind === "pickup") g.sound.play("coin");
      if (e.kind === "level") g.sound.play("win");
      if (e.kind === "alert") g.fx.float(col(e.x), row(e.y) - 10, "!", "#fbbf24", 16);
      if (e.kind === "block") g.fx.float(col(e.x), row(e.y) - 10, "Warded", "#e2e8f0", 13);
      if (e.kind === "quake") { g.shake(0.3); g.sound.play("boom"); }
      if (e.kind === "bolt") g.sound.tone(900, 0.15, { type: "square", vol: 0.1, slide: -600 });
    }
    run.fx.length = 0;
    this.pot.label = `Potion x${run.hero.potions}`;
    this.pot.disabled = !run.hero.potions;
    if (run.runes.filter(Boolean).length !== this.known) { this.known = run.runes.length; this.buttons(); this.pot.label = `Potion x${run.hero.potions}`; this.pot.disabled = !run.hero.potions; }
    if (run.state !== "playing") this.finish();
  }
  finish() {
    const g = this.g, run = this.run;
    g.sound.stopMusic();
    const embers = run.embers();
    data.embers += embers;
    data.runs++;
    data.deepest = Math.max(data.deepest, run.depth);
    if (run.state === "won") data.wins++;
    g.store.save();
    g.go(new Result(g, {
      title: run.state === "won" ? "The Gloom lifts" : "You fell",
      good: run.state === "won",
      lines: [run.state === "won" ? "The dungeon is free" : `Slain by ${run.killedBy} on floor ${run.depth}`, `${run.kills} foes, ${run.hero.gold} gold, level ${run.hero.level}`, `${embers} embers earned`],
      buttons: [["New delve", () => g.go(new Delve(g, Date.now() % 1000000)), "primary"], ["Ember Shrine", () => g.go(new Shrine(g))], ["Menu", () => g.go(title())]],
    }));
  }
  camX() { return Math.max(0, Math.min(MW * T - 390, this.run.hero.x * T - 195 + T / 2)); }
  camY() { return Math.max(0, Math.min(MH * T - this.rows * T, this.run.hero.y * T - (this.rows * T) / 2)); }
  px(x) { return x * T + T / 2 - this.camX(); }
  py(y) { return y * T + T / 2 - this.camY() + this.top; }
  down(p) { this.start = p; this.walk = null; }
  up(p) {
    const s = this.start;
    this.start = null;
    if (!s || this.run.state !== "playing") return;
    const dx = p.x - s.x, dy = p.y - s.y;
    if (Math.hypot(dx, dy) > 22) {
      const step = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      if (this.run.move(...step)) this.after();
      return;
    }
    const x = Math.floor((p.x + this.camX()) / T), y = Math.floor((p.y - this.top + this.camY()) / T);
    if (y < 0 || y >= MH || p.y > this.top + this.rows * T) return;
    if (Math.abs(x - this.run.hero.x) + Math.abs(y - this.run.hero.y) === 1) { if (this.run.move(x - this.run.hero.x, y - this.run.hero.y)) this.after(); } else this.walk = { x, y };
  }
  update(dt) {
    if (!this.walk || this.run.state !== "playing") return;
    this.walkT = (this.walkT || 0) - dt;
    if (this.walkT > 0) return;
    this.walkT = 0.11;
    const run = this.run, depth = run.depth;
    const danger = run.floor.monsters.some((m) => m.awake && run.visible(m.x, m.y));
    const step = pathStep(run, this.walk.x, this.walk.y);
    if (!step || (danger && !run.monsterAt(this.walk.x, this.walk.y))) { this.walk = null; return; }
    if (run.move(...step)) this.after(); else this.walk = null;
    if (run.depth !== depth || (run.hero.x === this.walk?.x && run.hero.y === this.walk?.y)) this.walk = null;
  }
  draw(c) {
    const g = this.g, run = this.run, h = run.hero, f = run.floor;
    c.fillStyle = "#050308";
    c.fillRect(0, 0, g.W, g.H);
    c.save();
    c.beginPath();
    c.rect(0, this.top, g.W, this.rows * T);
    c.clip();
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        if (!f.seen[y][x]) continue;
        const t = f.map[y][x], sx = x * T - this.camX(), sy = y * T - this.camY() + this.top;
        const lit = run.visible(x, y);
        c.fillStyle = t === WALL ? (lit ? "#4a3a5c" : "#2a2036") : t === MOSS ? (lit ? "#2f4a3a" : "#1a2b22") : lit ? "#2d2438" : "#17121e";
        c.fillRect(sx, sy, T + 0.5, T + 0.5);
        if (t === WALL) { c.fillStyle = lit ? "#5d4a72" : "#322740"; c.fillRect(sx, sy, T, 4); }
        if (t === STAIRS) { for (let i = 0; i < 3; i++) { c.fillStyle = `rgba(250,204,21,${0.8 - i * 0.2})`; c.fillRect(sx + 4 + i * 2, sy + 5 + i * 5, T - 8 - i * 4, 3); } }
      }
    }
    for (const it of f.items) {
      if (!f.seen[it.y][it.x]) continue;
      const x = this.px(it.x), y = this.py(it.y);
      const col = { gold: "#fbbf24", potion: "#fb7185", mana: "#60a5fa", rune: "#e879f9", relic: "#fde047" }[it.kind];
      if (it.kind === "gold") dot(c, x, y, 5, col);
      else if (it.kind === "potion" || it.kind === "mana") { panel(c, x - 5, y - 6, 10, 13, col, 4); panel(c, x - 2, y - 9, 4, 4, "#d6d3d1", 1); } else { panel(c, x - 7, y - 7, 14, 14, col, 3); text(c, it.kind === "rune" ? "R" : "*", x, y + 1, { size: 11, color: "#1a0b2e", weight: 900 }); }
    }
    for (const m of f.monsters) {
      if (!run.visible(m.x, m.y)) continue;
      const d = MONSTERS[m.kind], x = this.px(m.x), y = this.py(m.y), r = d.boss ? 12 : 9;
      dot(c, x, y, r, d.color);
      text(c, d.letter, x, y + 1, { size: d.boss ? 14 : 12, color: "#111", weight: 900 });
      if (!m.awake) text(c, "z", x + 9, y - 9, { size: 10, color: "#cbd5e1" });
      if (m.hp < m.max) bar(c, x - 10, y - r - 5, 20, 3, m.hp / m.max, "#f87171", "rgba(0,0,0,.6)");
    }
    dot(c, this.px(h.x), this.py(h.y), 10, h.ward ? "#e2e8f0" : "#fbbf24");
    text(c, "@", this.px(h.x), this.py(h.y) + 1, { size: 13, color: "#1a0b2e", weight: 900 });
    c.restore();
    text(c, `Floor ${run.depth}/${FLOORS}`, 14, 16, { size: 13, align: "left", weight: 800 });
    text(c, `Lv ${h.level}   Atk ${h.atk}   Def ${h.def}   ${h.gold}g`, 380, 16, { size: 12, align: "right", color: g.theme.muted });
    bar(c, 14, 30, 178, 10, h.hp / h.maxHp, h.poison ? "#a3e635" : "#ef4444");
    text(c, `${h.hp}/${h.maxHp}`, 103, 46, { size: 9, color: g.theme.muted });
    bar(c, 200, 30, 90, 10, h.mana / h.maxMana, "#60a5fa");
    text(c, `${h.mana}/${h.maxMana}`, 245, 46, { size: 9, color: g.theme.muted });
    bar(c, 298, 30, 78, 10, h.xp / run.xpNeed(), "#c084fc");
    text(c, "xp", 337, 46, { size: 9, color: g.theme.muted });
    const y = this.top + this.rows * T + 4;
    const last = run.log.slice(-2);
    last.forEach((l, i) => para(c, l, 14, y + i * 15, 362, { size: 12, color: i === last.length - 1 ? g.theme.ink : g.theme.muted }));
    if (run.relics.length) text(c, run.relics.map((r) => RELICS[r].name).join(", "), g.W / 2, g.H - 8, { size: 9, color: g.theme.muted });
  }
}

game.start(title());
