# Gloomdelve

A roguelike built for one thumb. Swipe to step or tap to walk through generated dungeon floors, where every move gives the monsters a turn.
Sleeping monsters wake to noise, and archers need a clear line. Death is permanent, but the embers you earn buy upgrades for the next run.

**[Play it now](https://apurba94.github.io/gloomdelve/)** in your phone's browser, then use "Add to Home Screen" to install it. After the
first visit it works offline.

* 10 generated floors ending in a boss fight with the Gloom Warden.
* 9 monster types with their own behaviour: bats flutter, slimes split, archers keep their distance, shades drain mana.
* 6 runes, 6 relics, and fog of war.
* A daily delve with the same dungeon for everyone on that day, and an Ember Shrine of permanent upgrades.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

Plain JavaScript with no dependencies. `src/logic.js` holds the rules and dungeon generator, and `src/main.js` holds the screens.

## How it is tested

The tests check that everything on 250 generated floors can be reached, and cover each rule, rune and relic. A simple bot then plays 60
runs with and without upgrades: with all of them it has to win at least a quarter of its runs. That shows the game can be finished and that
the upgrades matter. It does not show that the balance feels right to a person.

## License

MIT
