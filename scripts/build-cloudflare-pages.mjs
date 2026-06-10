import { cp, mkdir, rm, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

const botPowerAnimations = {
  atlas: "atlas_balance_burst_animation.fbx",
  blaze: "blaze_flame_uppercut_animation.fbx",
  volt: "volt_lightning_dash_animation.fbx",
  sage: "sage_repair_field_animation.fbx",
  bastion: "bastion_fortress_guard_animation.fbx",
  vex: "vex_fox_glitch_animation.fbx",
  bruno: "bruno_bear_slam_animation.fbx"
};

const duplicateAnimationPattern =
  /_weapon_|pulse_rifle_attack|flame_blaster_attack|arc_pistols_attack|repair_staff_cast|heavy_cannon_attack|plasma_claws_attack|gravity_hammer_attack/;

async function copyIfExists(source, target) {
  if (!existsSync(source)) {
    return;
  }

  await cp(source, target, { recursive: true });
}

async function removeDuplicateWeaponAnimations(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await removeDuplicateWeaponAnimations(fullPath);
      continue;
    }

    if (entry.name.endsWith(".fbx") && duplicateAnimationPattern.test(entry.name)) {
      await rm(fullPath, { force: true });
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function rewriteBotJson() {
  for (const [botId, powerAnimation] of Object.entries(botPowerAnimations)) {
    const botDir = path.join(dist, "assets", "bots", botId);

    for (const filename of ["loadout.json", "weapon.json"]) {
      const filePath = path.join(botDir, filename);

      if (!existsSync(filePath)) {
        continue;
      }

      const data = await readJson(filePath);

      if (data.actions) {
        data.actions.idle = `animations/${botId}_idle.fbx`;
        data.actions.run = `animations/${botId}_run.fbx`;
        data.actions.power = `animations/${powerAnimation}`;

        if (data.actions.attack) {
          data.actions.attack = `animations/${botId}_attack.fbx`;
        }
      }

      if (Array.isArray(data.availableWeapons)) {
        for (const weapon of data.availableWeapons) {
          weapon.attack = `animations/${botId}_attack.fbx`;
        }
      }

      await writeJson(filePath, data);
    }
  }
}

async function rewriteGameManifest() {
  const manifestPath = path.join(dist, "game", "game_assets.json");

  if (!existsSync(manifestPath)) {
    return;
  }

  const manifest = await readJson(manifestPath);

  for (const bot of manifest.bots || []) {
    const powerAnimation = botPowerAnimations[bot.id];

    if (!powerAnimation || !bot.animations) {
      continue;
    }

    bot.animations.weaponIdle = `../assets/bots/${bot.id}/animations/${bot.id}_idle.fbx`;
    bot.animations.weaponRun = `../assets/bots/${bot.id}/animations/${bot.id}_run.fbx`;
    bot.animations.weaponAttack = `../assets/bots/${bot.id}/animations/${bot.id}_attack.fbx`;
    bot.animations.weaponPower = `../assets/bots/${bot.id}/animations/${powerAnimation}`;
  }

  await writeJson(manifestPath, manifest);
}

async function failOnOversizedFiles() {
  const limit = 25 * 1024 * 1024;
  const oversized = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const info = await stat(fullPath);

      if (info.size > limit) {
        oversized.push({
          file: path.relative(dist, fullPath),
          sizeMiB: (info.size / 1024 / 1024).toFixed(2)
        });
      }
    }
  }

  await walk(dist);

  if (oversized.length > 0) {
    throw new Error(`Cloudflare Pages file limit exceeded:\n${JSON.stringify(oversized, null, 2)}`);
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await copyIfExists(path.join(root, "index.html"), path.join(dist, "index.html"));
await copyIfExists(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
await copyIfExists(path.join(root, "game"), path.join(dist, "game"));
await copyIfExists(path.join(root, "assets", "bots"), path.join(dist, "assets", "bots"));
await copyIfExists(path.join(root, "assets", "textures"), path.join(dist, "assets", "textures"));
await copyIfExists(path.join(root, "assets", "ui"), path.join(dist, "assets", "ui"));

for (const largeBackground of [
  path.join(dist, "assets", "ui", "loading", "loading_background.png"),
  path.join(dist, "assets", "ui", "loading", "loading_background_robot.png")
]) {
  await rm(largeBackground, { force: true });
}

await removeDuplicateWeaponAnimations(path.join(dist, "assets", "bots"));
await rewriteBotJson();
await rewriteGameManifest();
await failOnOversizedFiles();

console.log("Cloudflare Pages build ready in dist/");
