# Loading Screen

This folder contains the game loading screen shown whenever a player enters FamiliarBot League.

Files:

- `loading_background.png`: generated sci-fi loading background.
- `loading_screen.json`: loading screen settings and asset groups.
- `loading-screen.css`: screen styling.
- `loading-screen.js`: small reusable loader controller for browser builds.
- `preview.html`: standalone preview file for checking the loading screen in a browser.

The loader is asset-aware: pass a list of files to `FamiliarBotLoadingScreen.start(...)`, or let it use the default asset groups from `loading_screen.json`.

Game engines can use the same config even if they do not use the HTML preview. Show `loading_background.png`, preload the listed manifests/assets, update the progress bar, then transition into the game.
