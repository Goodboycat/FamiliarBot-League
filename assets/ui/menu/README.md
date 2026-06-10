# Main Menu

This folder contains the first menu shown after the loading screen.

Files:

- `menu_screen.json`: menu configuration.
- `menu-screen.css`: menu styling.
- `menu-screen.js`: menu behavior and asset-manifest loading.
- `preview.html`: standalone browser preview.

The menu reads `game/game_assets.json`, so bot names, roles, weapon loadouts, and powers come from the game-facing manifest instead of being hard-coded in the UI.
