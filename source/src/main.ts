import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SparkRenderer } from '@sparkjsdev/spark';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect } from 'postprocessing';
import { WUKONG_CHAPTERS } from './data/ChaptersData';
import { WukongController } from './player/WukongController';
import { EnemyManager } from './enemies/EnemyManager';
import type { ActiveEnemy } from './enemies/EnemyManager';
import { ChapterWorld } from './world/ChapterWorld';
import { CombatVFX } from './vfx/CombatVFX';
import { WukongAudio } from './audio/WukongAudio';

// Core Three.js + Postprocessing Setup
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;

const scene = new THREE.Scene();
const spark = new SparkRenderer({ renderer });
scene.add(spark);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 280);
camera.position.set(0, 6.5, 22);

// Lock-on reticle (screen-facing diamond above the target)
const lockCanvas = document.createElement('canvas');
lockCanvas.width = lockCanvas.height = 64;
const lc = lockCanvas.getContext('2d')!;
lc.translate(32, 32); lc.rotate(Math.PI / 4);
lc.strokeStyle = '#ffd166'; lc.lineWidth = 3; lc.strokeRect(-13, -13, 26, 26);
lc.strokeStyle = 'rgba(255,90,60,.85)'; lc.lineWidth = 1.5; lc.strokeRect(-7, -7, 14, 14);
const lockSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lockCanvas), transparent: true, depthTest: false }));
lockSprite.scale.set(1.1, 1.1, 1);
lockSprite.renderOrder = 20;
lockSprite.visible = false;
scene.add(lockSprite);

// Cinematic Mythic Lighting
const hemiLight = new THREE.HemisphereLight(0xf2c27a, 0x1a2428, 1.35);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffd09a, 2.35);
sunLight.position.set(18, 32, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 2;
sunLight.shadow.camera.far = 95;
const d = 34;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x6fe3d6, 0.9);
rimLight.position.set(-20, 14, -22);
scene.add(rimLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({
  intensity: 0.5,
  luminanceThreshold: 0.62,
  luminanceSmoothing: 0.25,
  mipmapBlur: true,
});
composer.addPass(new EffectPass(camera, bloom));

// EVA-like cinematic grade: desaturated, high-contrast, dark edges.


// Subsystems
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const audio = new WukongAudio();
const vfx = new CombatVFX(scene, camera);
const world = new ChapterWorld(scene);
const enemies = new EnemyManager(scene, camera);
const hero = new WukongController(scene);
hero.loadHeroModel(gltfLoader);

// Game State
let gameStarted = false;
let modalOpen = false;
let currentChapter = 0;
let gourdCharges = 3;
let roots = 0;
let karma = 0;
let damageBonus = 0;
let camYaw = 0;
let camPitch = 0.28;
let lockTarget: ActiveEnemy | null = null;
let heavySlamBeans = 1;
let chapterClearedTriggered = false;
let chapterReady = false;
let fireBurnCooldown = 0;
let lastComboVoice = 0;
let paused = false;
let lowQuality = false;
let fpsTime = 0;
let fpsFrames = 0;
let lowHpPlayed = false;
let comboCount = 0;
let comboTimer = 0;

const keys = new Set<string>();

// UI Elements
const titleScreen = document.getElementById('title-screen')!;
const hud = document.getElementById('hud')!;
const hudChapCode = document.getElementById('hud-chap-code')!;
const hudObjective = document.getElementById('hud-objective')!;
const bossHud = document.getElementById('boss-hud')!;
const bossNameEl = document.getElementById('boss-name')!;
const bossTitleEl = document.getElementById('boss-title')!;
const bossPhaseTag = document.getElementById('boss-phase-tag')!;
const bossBarFill = document.getElementById('boss-bar-fill')!;
const chapterBanner = document.getElementById('chapter-banner')!;
const bannerCode = document.getElementById('banner-code')!;
const bannerTitle = document.getElementById('banner-title')!;
const bannerPoem = document.getElementById('banner-poem')!;
const combatToast = document.getElementById('combat-toast')!;

const hpFill = document.getElementById('hp-fill')!;
const hpNum = document.getElementById('hp-num')!;
const mpFill = document.getElementById('mp-fill')!;
const mpNum = document.getElementById('mp-num')!;
const gourdCountEl = document.getElementById('gourd-charges')!;
const beanEls = [
  document.getElementById('bean-1')!,
  document.getElementById('bean-2')!,
  document.getElementById('bean-3')!,
];
const focusSubFill = document.getElementById('focus-sub-fill')!;
const cd1 = document.getElementById('cd-1')!;
const cd2 = document.getElementById('cd-2')!;
const cd3 = document.getElementById('cd-3')!;
const spell4Btn = document.getElementById('spell-4')!;

const modalOverlay = document.getElementById('modal-overlay')!;
const modalTag = document.getElementById('modal-tag')!;
const modalTitle = document.getElementById('modal-title')!;
const modalDesc = document.getElementById('modal-desc')!;
const btnModalAction = document.getElementById('btn-modal-action') as HTMLButtonElement;
const btnModalAlt = document.getElementById('btn-modal-alt') as HTMLButtonElement;
const pauseOverlay = document.getElementById('pause-overlay')!;
const btnPauseResume = document.getElementById('btn-pause-resume')!;
const btnPauseSound = document.getElementById('btn-pause-sound') as HTMLButtonElement;
const btnPauseRestart = document.getElementById('btn-pause-restart')!;
const storySub = document.getElementById('story-sub')!;
const chapterLoading = document.getElementById('chapter-loading')!;
const chapterLoadingText = chapterLoading.querySelector('.cl-t')!;
const lowHp = document.getElementById('low-hp')!;
const hitFlash = document.getElementById('hit-flash')!;
const comboHud = document.getElementById('combo-hud')!;
const comboCountEl = document.getElementById('combo-count')!;
const rootsCountEl = document.getElementById('roots-count')!;
const karmaFillEl = document.getElementById('karma-fill')!;
const karmaLabelEl = document.getElementById('karma-label')!;

let toastTimer: number | null = null;
function showToast(msg: string): void {
  combatToast.textContent = msg;
  combatToast.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => combatToast.classList.remove('show'), 1550);
}

async function startChapter(idx: number): Promise<void> {
  currentChapter = THREE.MathUtils.clamp(idx, 0, WUKONG_CHAPTERS.length - 1);
  const cfg = WUKONG_CHAPTERS[currentChapter];
  chapterClearedTriggered = false;
  chapterReady = false;
  lockTarget = null;
  lockSprite.visible = false;
  document.body.classList.remove('eva-alert');
  resetCombo();
  modalOpen = false;
  chapterLoadingText.textContent = `正在展开${cfg.title.split(' · ')[0]}`;
  chapterLoading.classList.remove('hidden');
  modalOverlay.classList.add('hidden');

  // Reset Wukong vitals & position
  hero.hp = hero.maxHp;
  hero.mana = hero.maxMana;
  hero.onNimbus = false;
  hero.nimbusCloud.visible = false;
  gourdCharges = 3;
  lowHpPlayed = false;
  audio.setBossPhase(false);
  const startY = world.getTerrainHeight(0, 14);
  hero.root.position.set(0, startY, 14);
  hero.yaw = Math.PI;
  hero.root.rotation.y = Math.PI;
  camYaw = 0;

  document.querySelectorAll('.chap-btn').forEach((b, i) => {
    b.classList.toggle('active', i === currentChapter);
  });
  hudChapCode.textContent = cfg.code;
  hudObjective.textContent = cfg.objectiveHint;

  // Show Chapter Calligraphic Scroll
  bannerCode.textContent = cfg.code;
  bannerTitle.textContent = cfg.title;
  bannerPoem.textContent = cfg.introPoem;
  chapterBanner.classList.remove('hidden');
  chapterBanner.style.animation = 'none';
  void chapterBanner.offsetWidth;
  chapterBanner.style.animation = 'bannerFade 3.8s ease forwards';

  await world.loadChapter(cfg, gltfLoader);
  await enemies.spawnChapterEnemies(cfg.enemies, gltfLoader, (x, z) => world.getTerrainHeight(x, z));
  // Give the player one beat to land before clear can trigger.
  window.setTimeout(() => { chapterReady = true; chapterLoading.classList.add('hidden'); }, 900);
  const bossName = cfg.enemies.find((e) => e.isBoss)?.name ?? '';
  window.setTimeout(() => { showStory(`${cfg.code} · ${cfg.title}　|　妖王：${bossName}`, 3800); audio.playVoice('boss-intro'); }, 1300);
  window.setTimeout(() => { audio.playBossRoar(); }, 1200);
}

// Combat Actions
function performLightAttack(): void {
  if (!gameStarted || modalOpen) return;
  // Auto soft-face nearest enemy within 7m for snappy action feel
  autoFaceNearestEnemy(7.5);
  if (hero.startLightAttack()) {
    audio.playLightSwing(hero.comboStep);
    const now = performance.now();
    if (now - lastComboVoice > 2400) {
      lastComboVoice = now;
      audio.playVoice('combo');
    }
  }
}

function performHeavySlam(): void {
  if (!gameStarted || modalOpen) return;
  autoFaceNearestEnemy(9.5);
  const beans = hero.startHeavyPillarSlam();
  if (beans > 0) {
    heavySlamBeans = beans;
    audio.playLightSwing(2);
    if (beans >= 2) showToast(`棍势爆发 · ${beans}豆擎天重劈！`);
    audio.playVoice('heavy');
  }
}

function performDodge(): void {
  if (!gameStarted || modalOpen) return;
  const imminent = enemies.isAnyAttackImminentNear(hero.root.position, 6.4);
  if (hero.triggerDodge()) {
    audio.playDodge();
    if (imminent) {
      audio.playVoice('dodge');
      // Perfect Dodge ("幻影身法") -> Bullet-time + +100 Focus Bean!
      hero.focusPoints = Math.min(300, hero.focusPoints + 100);
      vfx.triggerPerfectDodgeSlowMo();
      audio.playPerfectDodge();
      showToast('幻影闪身 · 完美识破 (+1 棍势豆)');
    }
  }
}

function castSpell(slot: number): void {
  if (!gameStarted || modalOpen) return;
  if (slot === 1) {
    if (hero.cdDing > 0 || hero.mana < 20) return;
    hero.mana -= 20;
    hero.cdDing = 9.0;
    const count = enemies.castDingShen(hero.root.position, 15);
    audio.playDingShenSpell();
    audio.playVoice('ding');
    vfx.spawnShockwave(hero.root.position, 9.5, 0xffdf73);
    showToast(count > 0 ? `「定！」定住 ${count} 名妖邪！` : '定身真言 · 金光护体');
  } else if (slot === 2) {
    if (hero.summonHairClones()) {
      audio.playCloneSpell();
      vfx.spawnShockwave(hero.root.position, 5.5, 0xffcc55);
      showToast('拔毛变猴 · 身外身法！');
    }
  } else if (slot === 3) {
    if (hero.cdFan > 0 || hero.mana < 22) return;
    hero.mana -= 22;
    hero.cdFan = 8.0;
    const fwd = new THREE.Vector3(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
    const hitCount = enemies.castPlantainHurricane(hero.root.position, fwd);
    const putOutFire = world.extinguishFireWall();
    audio.playWindFan();
    audio.playVoice('fan');
    vfx.spawnShockwave(hero.root.position, 13.5, 0x5effc5);
    if (putOutFire) {
      hudObjective.textContent = '三昧真火已熄！直捣火焰山深处击败「赤炎魔将」！';
      showToast('芭蕉神风 · 八百里三昧火墙熄灭！');
    } else {
      showToast(`芭蕉飓风 · 震退 ${hitCount} 敌！`);
    }
  } else if (slot === 4) {
    const flying = hero.toggleNimbus();
    spell4Btn.classList.toggle('active-cloud', flying);
    showToast(flying ? '筋斗腾云 · 空格升空 / C 降落' : '收云落步');
  }
}

function useImmortalGourd(): void {
  if (!gameStarted || modalOpen || gourdCharges <= 0 || hero.hp >= hero.maxHp) return;
  gourdCharges--;
  hero.hp = Math.min(hero.maxHp, hero.hp + 135);
  vfx.spawnShockwave(hero.root.position, 3.8, 0x7dffb3);
  vfx.spawnFloatingText(hero.root.position, '+135 仙酿回血', true);
}

function pickLockTarget(): ActiveEnemy | null {
  let best: ActiveEnemy | null = null;
  let bestDist = 26;
  for (const e of enemies.getAliveEnemies()) {
    const d = e.root.position.distanceTo(hero.root.position);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function toggleLockOn(): void {
  if (!gameStarted || modalOpen) return;
  if (lockTarget && !lockTarget.dead) {
    lockTarget = null;
    lockSprite.visible = false;
    showToast('解除锁定');
    return;
  }
  lockTarget = pickLockTarget();
  if (lockTarget) showToast(`锁定 · ${lockTarget.spec.name}`);
}

function updateLockOn(): void {
  if (lockTarget && (lockTarget.dead || lockTarget.root.position.distanceTo(hero.root.position) > 32)) {
    lockTarget = null;
  }
  if (!lockTarget) { lockSprite.visible = false; return; }
  lockSprite.visible = true;
  lockSprite.position.set(
    lockTarget.root.position.x,
    lockTarget.root.position.y + (lockTarget.spec.isBoss ? 3.6 : 2.6),
    lockTarget.root.position.z
  );
  const scale = lockTarget.spec.isBoss ? 1.6 : 1.0;
  lockSprite.scale.set(scale, scale, 1);
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, t);
}

function autoFaceNearestEnemy(maxRange: number): void {
  let bestDist = maxRange;
  let targetPos: THREE.Vector3 | null = lockTarget && !lockTarget.dead ? lockTarget.root.position : null;
  if (targetPos) bestDist = targetPos.distanceTo(hero.root.position);
  for (const e of enemies.getAliveEnemies()) {
    const d = e.root.position.distanceTo(hero.root.position);
    if (d < bestDist) {
      bestDist = d;
      targetPos = e.root.position;
    }
  }
  if (targetPos) {
    const dx = targetPos.x - hero.root.position.x;
    const dz = targetPos.z - hero.root.position.z;
    hero.yaw = Math.atan2(dx, dz);
    hero.root.rotation.y = hero.yaw;
  }
}

// Input Bindings
document.getElementById('btn-start-game')!.addEventListener('click', async () => {
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  gameStarted = true;
  togglePause(false);
  roots = 0;
  karma = 0;
  damageBonus = 0;
  updateRootHud();
  // Start gameplay immediately; audio (reverb + voice preload) initializes in parallel.
  void audio.init().then(() => audio.playVoice('start'));
  await startChapter(0);
});

document.querySelectorAll('.chap-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const idx = Number((btn as HTMLElement).dataset.chap ?? 0);
    startChapter(idx);
  });
});

document.getElementById('btn-gourd')!.addEventListener('click', useImmortalGourd);
document.querySelectorAll('.spell-slot').forEach((slot) => {
  slot.addEventListener('click', () => {
    castSpell(Number((slot as HTMLElement).dataset.spell ?? 1));
  });
});

btnPauseResume.addEventListener('click', () => togglePause(false));
btnPauseRestart.addEventListener('click', () => { togglePause(false); startChapter(currentChapter); });
btnPauseSound.addEventListener('click', (ev) => { const m = audio.toggleMute(); (ev.currentTarget as HTMLButtonElement).textContent = m ? '声音：关' : '声音：开'; });
document.getElementById('btn-mute')!.addEventListener('click', (ev) => {
  const muted = audio.toggleMute();
  (ev.currentTarget as HTMLButtonElement).textContent = muted ? '声音：关' : '声音：开';
});

const techDrawer = document.getElementById('tech-drawer')!;
document.getElementById('btn-tech')!.addEventListener('click', () => {
  techDrawer.classList.toggle('hidden');
});
document.getElementById('btn-close-tech')!.addEventListener('click', () => {
  techDrawer.classList.add('hidden');
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'j') performLightAttack();
  if (k === 'k') performHeavySlam();
  if (e.key === 'Shift') performDodge();
  if (k === '1') castSpell(1);
  if (k === '2') castSpell(2);
  if (k === '3') castSpell(3);
  if (k === '4') castSpell(4);
  if (k === 'r') useImmortalGourd();
  if (e.key === 'Escape') { togglePause(); return; }
  if (k === 'q') toggleLockOn();
  if (e.key === 'Tab') { e.preventDefault(); toggleLockOn(); }
  if (k === 'm') { const m = audio.toggleMute(); (document.getElementById('btn-mute') as HTMLButtonElement).textContent = m ? '声音：关' : '声音：开'; }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

canvas.addEventListener('mousedown', (e) => {
  if (!gameStarted || modalOpen) return;
  if (e.button === 1) { e.preventDefault(); toggleLockOn(); return; }
  if (e.button === 0) performLightAttack();
  if (e.button === 2) performHeavySlam();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', (e) => {
  if (!gameStarted || modalOpen) return;
  // Orbit camera smoothly when moving mouse (or holding pointer lock)
  if (!lockTarget && (document.pointerLockElement === canvas || e.buttons === 1 || Math.abs(e.movementX) > 0)) {
    camYaw -= e.movementX * 0.0032;
    camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0022, 0.08, 0.72);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Modal handler
let storyTimer = 0;
function showStory(text: string, ms = 4200): void {
  storySub.textContent = text;
  storySub.classList.remove('hidden');
  window.clearTimeout(storyTimer);
  storyTimer = window.setTimeout(() => storySub.classList.add('hidden'), ms);
}

function bumpCombo(): void {
  comboCount += 1;
  comboTimer = 2.2;
  comboCountEl.textContent = String(comboCount);
  comboHud.classList.toggle('hidden', comboCount < 2);
}

function resetCombo(): void {
  comboCount = 0;
  comboTimer = 0;
  comboHud.classList.add('hidden');
}

function flashPlayerHit(): void {
  hitFlash.classList.remove('active');
  void hitFlash.offsetWidth;
  hitFlash.classList.add('active');
}

function updateRootHud(): void {
  rootsCountEl.textContent = String(roots);
  karmaFillEl.style.width = `${Math.min(100, karma)}%`;
  karmaLabelEl.textContent = `业障 ${karma}`;
  document.body.classList.toggle('high-karma', karma >= 60);
}

function openChoice(
  tag: string,
  title: string,
  desc: string,
  mainLabel: string,
  mainAction: () => void,
  altLabel: string,
  altAction: () => void
): void {
  modalOpen = true;
  modalTag.textContent = tag;
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  btnModalAction.textContent = mainLabel;
  btnModalAction.classList.remove('hidden');
  btnModalAction.onclick = mainAction;
  btnModalAlt.textContent = altLabel;
  btnModalAlt.classList.remove('hidden');
  btnModalAlt.onclick = altAction;
  audio.playVoice('choice');
  modalOverlay.classList.remove('hidden');
}

function openModal(tag: string, title: string, desc: string, btnLabel: string, onConfirm: () => void): void {
  modalOpen = true;
  modalTag.textContent = tag;
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  btnModalAction.textContent = btnLabel;
  btnModalAlt.classList.add('hidden');
  modalOverlay.classList.remove('hidden');
  btnModalAction.onclick = onConfirm;
}

function resolveRoot(kind: 'mercy' | 'devour', isFinal: boolean): void {
  roots = Math.min(6, roots + 2);
  modalOverlay.classList.add('hidden');
  modalOpen = false;
  if (kind === 'mercy') {
    hero.hp = Math.min(hero.maxHp, hero.hp + 80);
    karma = Math.max(0, karma - 15);
    showToast('超度 · 两根归位，业障 -15，气血 +80');
  } else {
    damageBonus += 0.12;
    karma = Math.min(100, karma + 25);
    showToast('吞噬 · 两根归位，增伤 +12%，业障 +25');
  }
  updateRootHud();
  if (isFinal) {
    window.setTimeout(showEnding, 350);
  } else {
    window.setTimeout(() => startChapter(currentChapter + 1), 450);
  }
}

function showEnding(): void {
  if (karma < 40) {
    audio.playVoice('ending-good');
    openModal(
      '齐天大圣 · 金箍落下',
      '你渡了自己',
      `六根归位，你却一根未留。金箍从头上落下，花果山的风第一次没有血腥味。\n（业障 ${karma}）`,
      '重游花果山第一回',
      () => { roots = 0; karma = 0; damageBonus = 0; updateRootHud(); startChapter(0); }
    );
  } else {
    audio.playVoice('ending-bad');
    openModal(
      '齐天大圣 · 新的妖王',
      '你成了自己打的那只妖',
      `六根归位，全部收下。你坐在凌霄殿上，听见山下又有人喊“大圣”。\n（业障 ${karma}）`,
      '再走一遍',
      () => { roots = 0; karma = 0; damageBonus = 0; updateRootHud(); startChapter(0); }
    );
  }
}

function togglePause(next?: boolean): void {
  if (modalOpen && !paused) return;
  paused = next ?? !paused;
  pauseOverlay.classList.toggle('hidden', !paused);
  if (paused) {
    btnPauseSound.textContent = audio.muted ? '声音：关' : '声音：开';
  }
}

// Main 60fps Game Loop
let lastTime = performance.now();

function animate(now: number): void {
  (window as unknown as { __W: unknown }).__W = { enemies, hero, world };
requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, (now - lastTime) * 0.001);
  lastTime = now;

  fpsTime += rawDt; fpsFrames++;
  if (fpsTime > 2.5) {
    const fps = fpsFrames / fpsTime;
    if (!lowQuality && fps < 42) {
      lowQuality = true;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      bloom.intensity = 0.35;
    }
    fpsTime = 0; fpsFrames = 0;
  }

  if (!gameStarted) {
    // Cinematic slow camera orbit on Title Screen
    const t = now * 0.00035;
    camera.position.set(Math.sin(t) * 11, 5.2, 14 + Math.cos(t) * 8);
    camera.lookAt(0, 2.0, 0);
    composer.render(rawDt);
    return;
  }

  if (paused) { composer.render(rawDt); return; }
  const dt = vfx.update(rawDt);
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) resetCombo();
  }
  fireBurnCooldown = Math.max(0, fireBurnCooldown - rawDt);

  if (!modalOpen) {
    // 1. Update Sun Wukong
    hero.update(dt, keys, camYaw, (x, z) => world.getTerrainHeight(x, z));

    // 2. Check Wukong Staff Hit Detection during active swing window
    if (hero.attackTimer > 0.08 && hero.attackTimer < 0.48 && !hero.hitDealtThisSwing) {
      const reach = hero.isHeavySlam ? 5.6 : 3.5;
      const fwd = new THREE.Vector3(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
      const strikeCenter = hero.root.position.clone().addScaledVector(fwd, hero.isHeavySlam ? 2.4 : 1.5);

      let landed = false;
      for (const e of enemies.getAliveEnemies()) {
        if (e.root.position.distanceTo(strikeCenter) <= reach + e.spec.scale * 0.45) {
          landed = true;
          const baseDmg = Math.round(
            (hero.isHeavySlam ? 85 + heavySlamBeans * 58 : 34 + hero.comboStep * 9) * (1 + damageBonus) * (1 + Math.min(comboCount, 20) * 0.015)
          );
          const enteredP2 = enemies.applyDamage(e, baseDmg, fwd);
          vfx.triggerHitJuice(
            e.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
            baseDmg,
            hero.isHeavySlam,
            hero.isHeavySlam ? `暴击 ${baseDmg}!` : `${baseDmg}`
          );
          if (!hero.isHeavySlam) {
            hero.focusPoints = Math.min(300, hero.focusPoints + 36);
          }
          if (enteredP2) {
            vfx.spawnShockwave(e.root.position, 12, 0xff3b1f);
            document.body.classList.add('eva-alert');
            audio.setBossPhase(true);
            audio.playBossRoar();
            audio.playVoice('phase');
            showToast(`${e.spec.name} · 法天象地狂暴二阶段！`);
          }
        }
      }
      if (landed) {
        bumpCombo();
        hero.hitDealtThisSwing = true;
        audio.playStaffHit(hero.isHeavySlam);
      }
    }

    // 3. Update Autonomous Hair Clones ([2] 身外身法)
    for (let i = hero.clones.length - 1; i >= 0; i--) {
      const c = hero.clones[i];
      c.life -= dt;
      c.atkCooldown -= dt;
      if (c.life <= 0) {
        scene.remove(c.root);
        hero.clones.splice(i, 1);
        continue;
      }
      const alive = enemies.getAliveEnemies();
      if (alive.length > 0) {
        let nearest = alive[0];
        let best = c.root.position.distanceTo(nearest.root.position);
        for (const cand of alive) {
          const dist = c.root.position.distanceTo(cand.root.position);
          if (dist < best) {
            best = dist;
            nearest = cand;
          }
        }
        const dir = nearest.root.position.clone().sub(c.root.position);
        dir.y = 0;
        if (best > 1.9) {
          dir.normalize();
          c.root.position.addScaledVector(dir, 9.2 * dt);
          c.root.rotation.y = Math.atan2(dir.x, dir.z);
        } else if (c.atkCooldown <= 0) {
          c.atkCooldown = 0.75;
          c.staff.rotation.x = Math.sin(now * 0.05) * 1.4;
          enemies.applyDamage(nearest, 24);
          vfx.spawnFloatingText(nearest.root.position, '24', false);
        }
        c.root.position.y = world.getTerrainHeight(c.root.position.x, c.root.position.z);
      }
    }

    // 4. Update World (Peaches & Flaming Mountain Fire Barrier)
    const worldEvents = world.update(dt, hero.root.position);
    if (worldEvents.healed) {
      hero.hp = Math.min(hero.maxHp, hero.hp + 90);
      hero.mana = Math.min(hero.maxMana, hero.mana + 35);
      vfx.spawnFloatingText(hero.root.position, '千年蟠桃 +90气血', true);
      audio.playPerfectDodge();
    }
    if (worldEvents.fireBurn && fireBurnCooldown <= 0) {
      fireBurnCooldown = 0.9;
      hero.hp = Math.max(10, hero.hp - 15);
      showToast('三昧真火阻路！快按 [3] 挥动芭蕉宝扇熄火！');
    }

    // 5. Update Enemies & Boss AI
    const anyAggro = enemies.update(
      dt,
      hero.root.position,
      (x, z) => world.getTerrainHeight(x, z),
      (hitEv) => {
        if (hero.invulnTimer > 0) {
          // Invulnerable mid-dodge -> reward Perfect Dodge!
          hero.focusPoints = Math.min(300, hero.focusPoints + 85);
          vfx.triggerPerfectDodgeSlowMo();
          audio.playPerfectDodge();
          showToast('毫厘闪身 · 万法不侵！');
          return;
        }
        hero.hp = Math.max(0, hero.hp - hitEv.damage);
        resetCombo();
        flashPlayerHit();
        vfx.shakeIntensity = Math.max(vfx.shakeIntensity, hitEv.isBossSlam ? 0.52 : 0.25);
        vfx.spawnFloatingText(hero.root.position, `-${hitEv.damage}`, hitEv.isBossSlam);
        if (hitEv.isBossSlam) {
          vfx.spawnShockwave(hitEv.pos, 7.5, 0xff4422);
        }
        if (hero.hp <= 0) {
          audio.playVoice('death');
          openModal(
            '胜败乃兵家常事',
            '灵台蒙尘 · 重整金甲',
            '大圣有七十二般变化与不坏金身，饮尽仙酿即可再战妖魔！',
            '元神归位 · 再战本回',
            () => startChapter(currentChapter)
          );
        }
      }
    );
    audio.inCombat = anyAggro;

    // 6. Check Chapter Clear Condition
    if (chapterReady && !chapterClearedTriggered && enemies.getAliveEnemies().length === 0) {
      chapterClearedTriggered = true;
      audio.playVictory();
      audio.playVoice('victory');
      setTimeout(() => {
        const isFinal = currentChapter >= WUKONG_CHAPTERS.length - 1;
        const rootLines = [
          '他倒下时，胸口有一根金色的刺——那是你的“怒”。',
          '火里有一根“嗔”。它一直在烧，连你也不放过。',
          '他叫了你一声“贤弟”。你想起自己也曾被压在山下。',
        ];
        openChoice(
          `${WUKONG_CHAPTERS[currentChapter].code} · 六根之一`,
          isFinal ? '最后一根，怎么用？' : '这一根，怎么用？',
          `${rootLines[currentChapter] ?? rootLines[0]}\n超度：回血、降低业障；吞噬：永久增伤、抬高业障。`,
          '超度 · 放下',
          () => resolveRoot('mercy', isFinal),
          '吞噬 · 收下',
          () => resolveRoot('devour', isFinal)
        );
      }, 900);
    }
  }

  updateLockOn();
  if (lockTarget) {
    const lx = lockTarget.root.position.x - hero.root.position.x;
    const lz = lockTarget.root.position.z - hero.root.position.z;
    const targetYaw = Math.atan2(lx, lz);
    camYaw = lerpAngle(camYaw, targetYaw + Math.PI, rawDt * 5.5);
    hero.yaw = targetYaw;
    hero.root.rotation.y = targetYaw;
  }

  // 7. Smooth 3rd-Person Action Follow Camera + Trauma Shake
  const camDist = lockTarget ? (lockTarget.spec.isBoss ? 8.6 : 6.4) : (hero.onNimbus ? 9.2 : 7.1);
  const camHeight = hero.onNimbus ? 4.2 : 3.0 + camPitch * 4.6;
  const desiredCamPos = new THREE.Vector3(
    hero.root.position.x + Math.sin(camYaw) * camDist,
    hero.root.position.y + camHeight,
    hero.root.position.z + Math.cos(camYaw) * camDist
  );
  const camGround = world.getTerrainHeight(desiredCamPos.x, desiredCamPos.z) + 1.15;
  if (desiredCamPos.y < camGround) desiredCamPos.y = camGround;
  camera.position.lerp(desiredCamPos, Math.min(1, rawDt * 10));
  const targetFov = lockTarget ? 46 : hero.isHeavySlam ? 55 : 50;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, rawDt * 4));
  camera.updateProjectionMatrix();

  if (vfx.shakeIntensity > 0.005) {
    camera.position.x += (Math.random() - 0.5) * vfx.shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * vfx.shakeIntensity;
  }
  camera.lookAt(
    hero.root.position.x,
    hero.root.position.y + 1.65,
    hero.root.position.z
  );

  // 8. Sync HUD Bars, Focus Beans & Boss Bar
  hpFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
  hpNum.textContent = `${Math.ceil(hero.hp)}/${hero.maxHp}`;
  mpFill.style.width = `${(hero.mana / hero.maxMana) * 100}%`;
  mpNum.textContent = `${Math.floor(hero.mana)}/${hero.maxMana}`;
  gourdCountEl.textContent = `×${gourdCharges}`;

  const fullBeans = Math.floor(hero.focusPoints / 100);
  beanEls.forEach((b, idx) => b.classList.toggle('charged', idx < fullBeans));
  focusSubFill.style.width = `${hero.focusPoints % 100}%`;

  cd1.style.height = `${(hero.cdDing / 9.0) * 100}%`;
  cd2.style.height = `${(hero.cdClone / 12.0) * 100}%`;
  cd3.style.height = `${(hero.cdFan / 8.0) * 100}%`;

  const boss = enemies.getActiveBoss();
  if (boss && boss.root.position.distanceTo(hero.root.position) < 30) {
    bossHud.classList.remove('hidden');
    bossNameEl.textContent = boss.spec.name;
    bossTitleEl.textContent = boss.spec.title ?? '';
    bossPhaseTag.classList.toggle('hidden', !boss.phase2);
    bossBarFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  } else {
    bossHud.classList.add('hidden');
  }

  world.updateAmbient(dt, now * 0.001);
  const hpRatio = hero.hp / hero.maxHp;
  lowHp.style.opacity = hpRatio < 0.3 ? String(Math.min(1, (0.3 - hpRatio) * 2.6)) : '0';
  if (hpRatio < 0.3 && !lowHpPlayed) {
    lowHpPlayed = true;
    audio.playVoice('low-hp');
    showStory('残血 · 按 R 饮葫芦，或 Shift 闪身找机会', 2600);
  }
  composer.render(rawDt);
}

// Preload Chapter 0 vista behind Title Gate so backdrop looks breathtaking immediately
world.loadChapter(WUKONG_CHAPTERS[0], gltfLoader);
requestAnimationFrame(animate);
