# FamiliarBot League Game Assets

This folder is the game-facing entry point for loading assets from the repository.

Use `game_assets.json` when the game starts. It points to the loading screen, bot roster, bot models, animations, powers, weapons, and weapon loadouts in their repository locations.

The actual FBX, OBJ, PNG, and JSON assets stay under `assets/` so they are not duplicated.

## Load Order

1. Show `loadingScreen.config`.
2. Load `roster`.
3. Load each entry in `bots`.
4. Load each bot's model, animations, power file, weapon file, and loadout file.
5. Enter the game once all required assets are ready.
