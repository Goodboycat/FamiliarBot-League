# Garage

The garage is the screen between the main menu and the arena. It shows the
roster of FamiliarBots, lets the player pick one, displays per-bot stats, and
exposes a single `DEPLOY` button that launches the arena.

Files:

- `garage_screen.json`: roster, stat caps, per-bot stats, label strings.
- `garage-screen.css`: holographic hangar styling (animated grid floor, mech
  silhouette, stat bars, deploy CTA).
- `garage-screen.js`: builds the DOM from the JSON, handles selection, and
  exposes `FamiliarBotGarage.start({ onBack, onDeploy })`.
- `preview.html`: standalone browser preview.

## Flow

`index.html` wires the four screens together:

```
loading ──▶ menu ──▶ garage ──▶ game (arena)
                ▲                  │
                └──────── back ────┘
```

- The **menu** mech-arena button calls `FamiliarBotGarage.start(...)`.
- The garage's **DEPLOY** button calls `FamiliarBotGame.start(...)`.
- The garage's **← MAIN MENU** button calls `FamiliarBotMainMenu.start(...)` again.

## Music

Each screen plays its own track via `assets/audio/audio-manager.js`:

| Screen   | Track                                            |
| -------- | ------------------------------------------------ |
| loading  | `assets/music/Loading_background_music.mp3`     |
| menu     | `assets/music/Menu_background_music.mp3`        |
| garage   | `assets/music/Garage_background_music.mp3`      |
| game     | `assets/music/Arena_background_music.mp3`       |

The audio manager crossfades between tracks (~800ms) so transitions feel
smooth. Browsers block autoplay until the user clicks/keys once — the
manager queues the first track and starts it on the first interaction.
