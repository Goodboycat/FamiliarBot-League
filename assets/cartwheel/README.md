# Cartwheel Weapon Animation Pipeline

Use Cartwheel to generate or retarget character motion, then export FBX files into the bot animation folders listed in `animation_exports.json`.

Cartwheel supports animation downloads in formats including `.fbx`, `.glb`, `.ma`, `.mb`, `.bvh`, and `.mp4`. Use `.fbx` for this repository so it matches the existing bot assets.

## Workflow

1. Upload the bot model from `assets/bots/<bot-id>/model/`.
2. Use the matching prompt in `assets/cartwheel/prompts/`.
3. Export each motion as FBX.
4. Save the exported files using the exact paths in `assets/cartwheel/animation_exports.json`.
5. Attach the weapon from `assets/weapons/manifest.json` to the listed socket in the game engine.

## Weapon Attachment

Weapons should usually be attached in the game engine, not baked into every animation file. That keeps the same weapon usable across idle, run, attack, and power motions.

Use these default sockets:

- `right_hand`: rifles, blasters, staff, cannon, hammer
- `both_hands`: dual pistols and claws

If a bot model does not expose hand bones clearly, create a small empty/socket on the hand in Blender or the engine, then parent the weapon to that socket.
