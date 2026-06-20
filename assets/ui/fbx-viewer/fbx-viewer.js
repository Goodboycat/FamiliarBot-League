import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/OBJLoader.js";
import { MeshoptDecoder } from "https://esm.sh/three@0.164.1/examples/jsm/libs/meshopt_decoder.module.js";

const weaponCatalog = [
  { id: "atlas_pulse_rifle", name: "Pulse Rifle", file: "atlas_pulse_rifle.obj", type: "rifle" },
  { id: "blaze_flame_blaster", name: "Flame Blaster", file: "blaze_flame_blaster.obj", type: "blaster" },
  { id: "volt_arc_pistols", name: "Arc Pistols", file: "volt_arc_pistols.obj", type: "dual_pistols" },
  { id: "sage_repair_staff", name: "Repair Staff", file: "sage_repair_staff.obj", type: "support_staff" },
  { id: "bastion_heavy_cannon", name: "Heavy Cannon", file: "bastion_heavy_cannon.obj", type: "cannon" },
  { id: "vex_plasma_claws", name: "Plasma Claws", file: "vex_plasma_claws.obj", type: "claws" },
  { id: "bruno_gravity_hammer", name: "Gravity Hammer", file: "bruno_gravity_hammer.obj", type: "hammer" }
];

const robotRoster = [
  {
    id: "atlas",
    name: "Atlas",
    model: "./assets/bots/atlas/model/atlas_all_rounder.fbx",
    defaultWeapon: "atlas_pulse_rifle",
    powerName: "Balance Burst",
    animations: [
      "atlas_idle.fbx",
      "atlas_run.fbx",
      "atlas_attack.fbx",
      "atlas_death.fbx",
      "atlas_balance_burst_animation.fbx",
      "atlas_balance_burst_weapon.fbx"
    ]
  },
  {
    id: "bastion",
    name: "Bastion",
    model: "./assets/bots/bastion/model/bastion_tank.fbx",
    defaultWeapon: "bastion_heavy_cannon",
    powerName: "Fortress Guard",
    animations: [
      "bastion_idle.fbx",
      "bastion_run.fbx",
      "bastion_attack.fbx",
      "bastion_death.fbx",
      "bastion_dying.fbx",
      "bastion_fortress_guard_animation.fbx",
      "bastion_fortress_guard_weapon.fbx",
      "bastion_gunplay_01.fbx",
      "bastion_gunplay_02.fbx",
      "bastion_standing_run_back.fbx",
      "bastion_taunt_battlecry.fbx",
      "bastion_warrior_idle.fbx"
    ]
  },
  {
    id: "blaze",
    name: "Blaze",
    model: "./assets/bots/blaze/model/blaze_fighter.fbx",
    defaultWeapon: "blaze_flame_blaster",
    powerName: "Flame Uppercut",
    animations: [
      "blaze_idle.fbx",
      "blaze_run.fbx",
      "blaze_attack.fbx",
      "blaze_death.fbx",
      "blaze_flame_uppercut_animation.fbx",
      "blaze_flame_uppercut_weapon.fbx"
    ]
  },
  {
    id: "bruno",
    name: "Bruno",
    model: "./assets/bots/bruno/model/bruno_robotic_bear.fbx",
    defaultWeapon: "bruno_gravity_hammer",
    powerName: "Bear Slam",
    animations: [
      "bruno_idle.fbx",
      "bruno_run.fbx",
      "bruno_attack.fbx",
      "bruno_death.fbx",
      "bruno_bear_slam_animation.fbx",
      "bruno_bear_slam_weapon.fbx"
    ]
  },
  {
    id: "sage",
    name: "Sage",
    model: "./assets/bots/sage/model/sage_supporter.fbx",
    defaultWeapon: "sage_repair_staff",
    powerName: "Repair Field",
    animations: [
      "sage_idle.fbx",
      "sage_run.fbx",
      "sage_attack.fbx",
      "sage_death.fbx",
      "sage_repair_field_animation.fbx",
      "sage_repair_field_weapon.fbx"
    ]
  },
  {
    id: "vex",
    name: "Vex",
    model: "./assets/bots/vex/model/vex_robot_fox.fbx",
    defaultWeapon: "vex_plasma_claws",
    powerName: "Fox Glitch",
    animations: [
      "vex_idle.fbx",
      "vex_run.fbx",
      "vex_attack.fbx",
      "vex_death.fbx",
      "vex_fox_glitch_animation.fbx",
      "vex_fox_glitch_weapon.fbx"
    ]
  },
  {
    id: "volt",
    name: "Volt",
    model: "./assets/bots/volt/model/volt_speedster.fbx",
    defaultWeapon: "volt_arc_pistols",
    powerName: "Lightning Dash",
    animations: [
      "volt_idle.fbx",
      "volt_run.fbx",
      "volt_attack.fbx",
      "volt_death.fbx",
      "volt_lightning_dash_animation.fbx",
      "volt_lightning_dash_weapon.fbx"
    ]
  }
];

const sampleRobot = robotRoster[0];

const dom = {
  viewport: document.querySelector("[data-viewport]"),
  dropZone: document.querySelector("[data-drop-zone]"),
  robotSelect: document.querySelector("[data-robot-select]"),
  loadRobot: document.querySelector("[data-load-robot]"),
  weaponSelect: document.querySelector("[data-weapon-select]"),
  loadWeapon: document.querySelector("[data-load-weapon]"),
  powerSelect: document.querySelector("[data-power-select]"),
  playPower: document.querySelector("[data-play-power]"),
  modelInput: document.querySelector("[data-model-input]"),
  animationInput: document.querySelector("[data-animation-input]"),
  animationSelect: document.querySelector("[data-animation-select]"),
  loadAtlas: document.querySelector("[data-load-atlas]"),
  play: document.querySelector("[data-play]"),
  pause: document.querySelector("[data-pause]"),
  restart: document.querySelector("[data-restart]"),
  clear: document.querySelector("[data-clear]"),
  currentAnimation: document.querySelector("[data-current-animation]"),
  timeReadout: document.querySelector("[data-time-readout]"),
  rigStatus: document.querySelector("[data-rig-status]"),
  status: document.querySelector("[data-status]"),
  log: document.querySelector("[data-log]")
};

const state = {
  model: null,
  baseModel: null,
  weapon: null,
  selectedRobot: sampleRobot,
  mixer: null,
  currentAction: null,
  animations: [],
  clock: new THREE.Clock(),
  paused: false,
  objectUrls: []
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071018);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
camera.position.set(2.6, 1.8, 4.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
dom.viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xcff8ff, 0x13202a, 2.4));

const key = new THREE.DirectionalLight(0xffffff, 3);
key.position.set(4, 6, 4);
scene.add(key);

const rim = new THREE.DirectionalLight(0x39f5ff, 1.4);
rim.position.set(-4, 3, -3);
scene.add(rim);

const grid = new THREE.GridHelper(8, 24, 0x39f5ff, 0x243845);
scene.add(grid);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(2.7, 72),
  new THREE.MeshStandardMaterial({
    color: 0x111d27,
    metalness: 0.2,
    roughness: 0.55
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.012;
scene.add(floor);

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

function log(message) {
  const time = new Date().toLocaleTimeString();
  dom.log.textContent += `[${time}] ${message}\n`;
  dom.log.scrollTop = dom.log.scrollHeight;
}

function setStatus(message) {
  dom.status.textContent = message;
}

function basename(path) {
  return path.split(/[\\/]/).pop() || path;
}

function robotAnimationPath(robot, fileName) {
  return `./assets/bots/${robot.id}/animations/${fileName}`;
}

function robotWeaponPath(robot, weapon) {
  return `./assets/bots/${robot.id}/weapons/${weapon.file}`;
}

function selectedRobot() {
  return robotRoster.find((robot) => robot.id === dom.robotSelect.value) || sampleRobot;
}

function selectedWeapon() {
  return weaponCatalog.find((weapon) => weapon.id === dom.weaponSelect.value) || weaponCatalog[0];
}

function cleanupObjectUrls() {
  for (const url of state.objectUrls) {
    URL.revokeObjectURL(url);
  }

  state.objectUrls = [];
}

function createObjectUrl(file) {
  const url = URL.createObjectURL(file);
  state.objectUrls.push(url);
  return url;
}

function fitModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x || 1, size.y || 1, size.z || 1);
  const scale = 2.35 / maxAxis;

  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  controls.target.set(0, Math.min(1.1, size.y * scale * 0.48), 0);
  controls.update();
}

function fitWeapon(object, weapon) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x || 1, size.y || 1, size.z || 1);
  const scale = 0.85 / maxAxis;

  object.scale.setScalar(scale);
  object.position.set(0.92 - center.x * scale, 0.82 - center.y * scale, 0.22 - center.z * scale);
  object.rotation.set(-0.12, -0.48, 0.1);

  if (weapon.type === "hammer" || weapon.type === "support_staff") {
    object.scale.multiplyScalar(1.18);
    object.position.y += 0.1;
    object.rotation.set(0.35, -0.36, -0.7);
  }

  if (weapon.type === "dual_pistols" || weapon.type === "claws") {
    object.scale.multiplyScalar(0.86);
    object.position.y -= 0.06;
  }
}

function styleWeapon(object) {
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;

    if (!child.material || child.material.type === "MeshBasicMaterial") {
      child.material = new THREE.MeshStandardMaterial({
        color: 0xdaf7ff,
        metalness: 0.62,
        roughness: 0.34,
        emissive: 0x082a30,
        emissiveIntensity: 0.18
      });
    }
  });
}

function collectNodeNames(object) {
  const names = new Set();

  object.traverse((child) => {
    if (child.name) {
      names.add(child.name);
    }
  });

  return names;
}

function trackTargetName(trackName) {
  const dotIndex = trackName.indexOf(".");
  return dotIndex === -1 ? trackName : trackName.slice(0, dotIndex);
}

function checkRigMatch(clip) {
  if (!state.model || !clip) {
    dom.rigStatus.textContent = "No animation loaded";
    return { matched: 0, missing: [] };
  }

  const nodeNames = collectNodeNames(state.model);
  const targetNames = [...new Set(clip.tracks.map((track) => trackTargetName(track.name)))];
  const missing = targetNames.filter((name) => !nodeNames.has(name));
  const matched = targetNames.length - missing.length;

  if (missing.length === 0) {
    dom.rigStatus.textContent = "Rig names match";
    log(`Rig check passed for ${clip.name || "animation"}.`);
    return { matched, missing };
  }

  dom.rigStatus.textContent = `${missing.length} unmatched tracks`;
  log(`Warning: ${missing.length} animation tracks do not match the loaded model. First missing: ${missing.slice(0, 8).join(", ")}`);
  return { matched, missing };
}

function setSceneModel(object) {
  if (state.model) {
    scene.remove(state.model);
  }

  state.model = object;
  state.mixer = new THREE.AnimationMixer(object);
  scene.add(object);
  fitModel(object);

  if (state.weapon) {
    scene.add(state.weapon);
  }
}

function hasAnimatedTarget(object, clip) {
  const nodeNames = collectNodeNames(object);
  const targetNames = [...new Set(clip.tracks.map((track) => trackTargetName(track.name)))];
  return targetNames.some((name) => nodeNames.has(name));
}

function rebuildAnimationSelect() {
  dom.animationSelect.innerHTML = "";

  for (const [index, item] of state.animations.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = item.name;
    dom.animationSelect.appendChild(option);
  }
}

function rebuildPowerSelect() {
  dom.powerSelect.innerHTML = "";

  for (const [index, item] of state.animations.entries()) {
    if (!/_animation\.fbx$|_weapon\.fbx$|attack\.fbx$/i.test(item.name)) {
      continue;
    }

    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = item.name;
    dom.powerSelect.appendChild(option);
  }
}

function clearCurrentAction() {
  if (state.currentAction) {
    state.currentAction.stop();
    state.currentAction = null;
  }
}

function playAnimation(index = Number(dom.animationSelect.value || 0)) {
  const item = state.animations[index];

  if (!state.model || !state.mixer || !item) {
    setStatus("Load a model and animation first");
    return;
  }

  clearCurrentAction();
  const rigCheck = checkRigMatch(item.clip);

  if (rigCheck.matched === 0 && item.sourceObject && hasAnimatedTarget(item.sourceObject, item.clip)) {
    log(`${item.name} uses its own FBX preview rig because the robot mesh has no matching animation bones.`);
    setSceneModel(item.sourceObject);
  }

  const action = state.mixer.clipAction(item.clip);
  action.reset().play();
  state.currentAction = action;
  state.paused = false;
  dom.currentAnimation.textContent = item.name;
  setStatus(`Playing ${item.name}`);
  checkRigMatch(item.clip);
}

function clearSceneModel() {
  clearCurrentAction();

  if (state.model) {
    scene.remove(state.model);
  }

  if (state.weapon) {
    scene.remove(state.weapon);
  }

  state.model = null;
  state.baseModel = null;
  state.weapon = null;
  state.mixer = null;
  state.animations = [];
  rebuildAnimationSelect();
  rebuildPowerSelect();
  dom.currentAnimation.textContent = "None";
  dom.timeReadout.textContent = "0.00 / 0.00";
  dom.rigStatus.textContent = "No animation loaded";
}

function clearWeapon() {
  if (state.weapon) {
    scene.remove(state.weapon);
    state.weapon = null;
  }
}

async function loadFbx(url, label) {
  setStatus(`Loading ${label}`);
  return new Promise((resolve, reject) => {
    fbxLoader.load(url, resolve, undefined, reject);
  });
}

async function loadModelAsset(url, label) {
  const cleanUrl = url.split("?")[0].toLowerCase();

  if (cleanUrl.endsWith(".glb") || cleanUrl.endsWith(".gltf")) {
    setStatus(`Loading ${label}`);
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => resolve(gltf.scene || gltf.scenes?.[0]),
        undefined,
        reject
      );
    });
  }

  return loadFbx(url, label);
}

async function loadModel(url, label) {
  const object = await loadModelAsset(url, label);
  clearSceneModel();
  state.baseModel = object;
  setSceneModel(object);
  setStatus(`Loaded model: ${label}`);
  log(`Loaded model: ${label}`);
}

async function loadWeapon(robot = state.selectedRobot, weapon = selectedWeapon()) {
  clearWeapon();
  const path = robotWeaponPath(robot, weapon);
  setStatus(`Loading ${weapon.name}`);

  return new Promise((resolve, reject) => {
    objLoader.load(
      path,
      (object) => {
        styleWeapon(object);
        fitWeapon(object, weapon);
        state.weapon = object;
        scene.add(object);
        setStatus(`Loaded weapon: ${weapon.name}`);
        log(`Loaded weapon: ${weapon.name}`);
        resolve(object);
      },
      undefined,
      reject
    );
  });
}

async function loadAnimation(url, label) {
  const object = await loadFbx(url, label);
  const clip = object.animations?.[0];

  if (!clip) {
    log(`No animation clip found in ${label}`);
    return;
  }

  clip.name = clip.name || label;
  state.animations.push({ name: label, clip, sourceObject: object });
  rebuildAnimationSelect();
  rebuildPowerSelect();
  setStatus(`Loaded animation: ${label}`);
  log(`Loaded animation: ${label} (${clip.duration.toFixed(2)}s)`);

  if (state.animations.length === 1) {
    dom.animationSelect.value = "0";
    playAnimation(0);
  }
}

async function loadModelFile(file) {
  const url = createObjectUrl(file);
  await loadModel(url, file.name);
}

async function loadAnimationFiles(files) {
  for (const file of files) {
    const url = createObjectUrl(file);
    await loadAnimation(url, file.name);
  }
}

async function loadRobot(robot) {
  clearSceneModel();
  cleanupObjectUrls();
  dom.log.textContent = "";
  state.selectedRobot = robot;
  dom.weaponSelect.value = robot.defaultWeapon;

  await loadModel(robot.model, basename(robot.model));

  for (const fileName of robot.animations) {
    const path = robotAnimationPath(robot, fileName);
    try {
      await loadAnimation(path, basename(path));
    } catch (error) {
      log(`Skipped ${fileName}: ${error.message}`);
    }
  }

  const runIndex = state.animations.findIndex((item) => item.name.includes("_run.fbx"));
  if (runIndex >= 0) {
    dom.animationSelect.value = String(runIndex);
    playAnimation(runIndex);
  }

  await loadWeapon(robot, selectedWeapon()).catch((error) => {
    log(`Weapon load failed: ${error.message}`);
  });
  selectDefaultPower(robot);
  setStatus(`Loaded ${robot.name}`);
  log(`${robot.name} robot and ${robot.animations.length} animations loaded.`);
}

function selectDefaultPower(robot) {
  const powerName = robot.powerName.toLowerCase().replace(/\s+/g, "_");
  const powerIndex = state.animations.findIndex((item) => item.name.toLowerCase().includes(powerName));

  if (powerIndex >= 0) {
    dom.powerSelect.value = String(powerIndex);
  }
}

async function loadAtlasSample() {
  dom.robotSelect.value = sampleRobot.id;
  await loadRobot(sampleRobot);
}

function handleFiles(files) {
  const assetFiles = [...files].filter((file) => /\.(fbx|glb|gltf)$/i.test(file.name));
  const fbxFiles = assetFiles.filter((file) => file.name.toLowerCase().endsWith(".fbx"));

  if (assetFiles.length === 0) {
    log("No FBX, GLB, or glTF files found.");
    return;
  }

  const modelFile =
    assetFiles.find((file) => /\.(glb|gltf)$/i.test(file.name)) ||
    assetFiles.find((file) => /model|character|robot|rounder|fighter|tank|bear|fox|sage|volt/i.test(file.name)) ||
    assetFiles[0];
  const animationFiles = fbxFiles.filter((file) => file !== modelFile);

  loadModelFile(modelFile)
    .then(() => loadAnimationFiles(animationFiles))
    .catch((error) => {
      console.error(error);
      log(`Load error: ${error.message}`);
      setStatus("Load failed");
    });
}

function resize() {
  const rect = dom.viewport.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(320, rect.height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function updateReadout() {
  if (!state.currentAction) {
    dom.timeReadout.textContent = "0.00 / 0.00";
    return;
  }

  const clip = state.currentAction.getClip();
  dom.timeReadout.textContent = `${state.currentAction.time.toFixed(2)} / ${clip.duration.toFixed(2)}`;
}

function animate() {
  const delta = state.clock.getDelta();

  if (state.mixer && !state.paused) {
    state.mixer.update(delta);
  }

  controls.update();
  updateReadout();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

dom.modelInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (file) {
    loadModelFile(file).catch((error) => log(`Model load error: ${error.message}`));
  }
});

dom.animationInput.addEventListener("change", (event) => {
  loadAnimationFiles(event.target.files || []).catch((error) => log(`Animation load error: ${error.message}`));
});

dom.animationSelect.addEventListener("change", () => playAnimation());
dom.weaponSelect.addEventListener("change", () => loadWeapon(state.selectedRobot, selectedWeapon()).catch((error) => log(`Weapon load failed: ${error.message}`)));
dom.loadWeapon.addEventListener("click", () => loadWeapon(state.selectedRobot, selectedWeapon()).catch((error) => log(`Weapon load failed: ${error.message}`)));
dom.powerSelect.addEventListener("change", () => playAnimation(Number(dom.powerSelect.value || 0)));
dom.playPower.addEventListener("click", () => {
  const index = Number(dom.powerSelect.value || 0);

  if (Number.isFinite(index)) {
    playAnimation(index);
  }
});
dom.loadRobot.addEventListener("click", () => loadRobot(selectedRobot()).catch((error) => log(`Robot load failed: ${error.message}`)));
dom.loadAtlas.addEventListener("click", () => loadAtlasSample().catch((error) => log(`Atlas sample failed: ${error.message}`)));
dom.play.addEventListener("click", () => {
  if (state.currentAction) {
    state.paused = false;
    setStatus("Playing");
  } else {
    playAnimation();
  }
});
dom.pause.addEventListener("click", () => {
  state.paused = true;
  setStatus("Paused");
});
dom.restart.addEventListener("click", () => {
  if (state.currentAction) {
    state.currentAction.reset().play();
    state.paused = false;
    setStatus("Restarted");
  }
});
dom.clear.addEventListener("click", () => {
  clearSceneModel();
  cleanupObjectUrls();
  dom.log.textContent = "";
  setStatus("Cleared");
});

for (const eventName of ["dragenter", "dragover"]) {
  dom.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dom.dropZone.classList.add("is-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dom.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dom.dropZone.classList.remove("is-over");
  });
}

dom.dropZone.addEventListener("drop", (event) => {
  handleFiles(event.dataTransfer.files);
});

window.addEventListener("resize", resize);

for (const robot of robotRoster) {
  const option = document.createElement("option");
  option.value = robot.id;
  option.textContent = robot.name;
  dom.robotSelect.appendChild(option);
}

for (const weapon of weaponCatalog) {
  const option = document.createElement("option");
  option.value = weapon.id;
  option.textContent = weapon.name;
  dom.weaponSelect.appendChild(option);
}

dom.robotSelect.value = sampleRobot.id;
dom.weaponSelect.value = sampleRobot.defaultWeapon;
resize();
animate();
log("Viewer ready. Pick a robot, weapon, and power, or drop model and animation files.");
