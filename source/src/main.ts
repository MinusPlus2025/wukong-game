import { disposeObject } from './utils/disposeObject';
import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect } from 'postprocessing';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WUKONG_CHAPTERS } from './data/ChaptersData';

// v2: one polished Huaguoshan boss fight. Other chapters stay in data but are not exposed.
const ACTIVE_CHAPTERS = WUKONG_CHAPTERS;
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;

const scene = new THREE.Scene();
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
sunLight.shadow.mapSize.set(2048, 2048);
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

// Shared PBR environment: gives stone/bronze props readable reflections without an HDR download.
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 64 }).texture;
room.dispose();
pmrem.dispose();
scene.environmentIntensity = 0.18;

// EVA-like cinematic grade: desaturated, high-contrast, dark edges.


function applyQuality(low: boolean): void {
  performanceMode = low;
  localStorage.setItem('wukong-performance', low ? '1' : '0');
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 1.25));
  composer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !low;
  sunLight.castShadow = !low;
  bloom.intensity = low ? 0.28 : 0.5;
  const btn = document.getElementById('btn-pause-quality');
  if (btn) btn.textContent = low ? '画质：性能' : '画质：高';
  showToast(low ? '性能模式 · 阴影/像素比已降' : '高画质 · 阴影恢复');
}

// Subsystems
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const audio = new WukongAudio();
const vfx = new CombatVFX(scene, camera);
const world = new ChapterWorld(scene);
const enemies = new EnemyManager(scene, camera);
const hero = new WukongController(scene);
const heroModelPromise = hero.loadHeroModel(gltfLoader);
void hero.loadStaffModel(gltfLoader);

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
let bossCheckpoint = false;
let tutorialParryShown = false;
let chapterReady = false;
let titleWorldAvailable = true;
let chapterGeneration = 0;
let fireBurnCooldown = 0;
let lastComboVoice = 0;
let paused = false;
let cinematicTimer = 0;
let cinematicBoss: ActiveEnemy | null = null;
let phaseTimer = 0;
let phaseBoss: ActiveEnemy | null = null;
let phase3Announced = false;
let lightBuffer = 0;
let unlockedChapter = 0;
let hitStopTimer = 0;
let performanceMode = localStorage.getItem('wukong-performance') === '1';
let lowHpPlayed = false;
let comboCount = 0;
let comboTimer = 0;
let spiritsFound = 0;
let chapterSpirits = 0;
let chapterDamage = 0;
let chapterStartedAt = 0;
let chapterRank = 'B';
let ngPlus = 0;
type FormKind = 'bull' | 'dragon' | 'wolf';
const FORM_INFO: Record<FormKind, { name: string; color: number; hp: number; speed: number }> = {
  bull: { name: '牛魔形', color: 0xff5638, hp: 90, speed: 0.9 },
  dragon: { name: '天龙形', color: 0x58d7ff, hp: 30, speed: 1.08 },
  wolf: { name: '狼妖形', color: 0x9fe8a8, hp: 20, speed: 1.22 },
};
let forms: FormKind[] = [];
let formIndex = -1;
let currentForm: FormKind | null = null;
let formTimer = 0;
let formFamiliar: THREE.Object3D | null = null;
let formAura: THREE.Mesh | null = null;
const learnedForms = new Set<string>();
let bellCooldown = 0;
let bellPrompted = false;
const collectedSpirits = new Set<string>();
let spiritOrbs: Array<{ group: THREE.Group; key: string; lore: string }> = [];

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
const bossPostureFill = document.getElementById('boss-posture-fill')!;
const bossIntro = document.getElementById('boss-intro')!;
const bossIntroName = document.getElementById('bi-name')!;
const bossIntroTitle = document.getElementById('bi-title')!;
const phaseCard = document.getElementById('phase-card')!;
const phaseTitle = document.getElementById('phase-title')!;
const phaseSub = document.getElementById('phase-sub')!;
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
const devMode = new URLSearchParams(location.search).get('dev') === '1';
const chapterNav = document.querySelector('.chapter-nav') as HTMLElement | null;
if (chapterNav && !devMode) chapterNav.style.display = 'none';
const lowHp = document.getElementById('low-hp')!;
const hitFlash = document.getElementById('hit-flash')!;
const comboHud = document.getElementById('combo-hud')!;
const comboCountEl = document.getElementById('combo-count')!;
const spiritCountEl = document.getElementById('spirit-count')!;
const formHud = document.getElementById('form-hud')!;
const formNameEl = document.getElementById('form-name')!;
const formTimerEl = document.getElementById('form-timer')!;
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

function updateChapterLocks(): void {
  document.querySelectorAll<HTMLButtonElement>('.chap-btn').forEach((btn, i) => {
    const locked = i > unlockedChapter;
    btn.classList.toggle('locked', locked);
    btn.setAttribute('aria-disabled', String(locked));
    btn.title = locked ? '先击败本回妖王解锁' : '';
  });
}

async function startChapter(idx: number): Promise<void> {
  if (idx > unlockedChapter) {
    showToast('先击败本回妖王，才能进入下一回');
    return;
  }
  const generation = ++chapterGeneration;
  vfx.clear();
  hero.clearTransientEffects();
  endForm();
  currentChapter = THREE.MathUtils.clamp(idx, 0, ACTIVE_CHAPTERS.length - 1);
  const cfg = ACTIVE_CHAPTERS[currentChapter];
  chapterClearedTriggered = false;
  bossCheckpoint = false;
  tutorialParryShown = false;
  chapterReady = false;
  chapterSpirits = 0;
  phase3Announced = false;
  phaseTimer = 0;
  phaseBoss = null;
  phaseCard.classList.add('hidden');
  chapterDamage = 0;
  chapterStartedAt = performance.now();
  chapterRank = 'B';
  spawnSpiritOrbs(currentChapter);
  lockTarget = null;
  lockSprite.visible = false;
  document.body.classList.remove('eva-alert');
  resetCombo();
  modalOpen = false;
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
  hudObjective.textContent = cfg.objectiveHint + (ngPlus > 0 ? ` · NG+${ngPlus}` : '');
  audio.setAmbient(currentChapter);
  if (currentChapter === 1) {
    scene.fog = new THREE.FogExp2(0x2a0b07, 0.021);
    hemiLight.color.setHex(0xff6a35); hemiLight.groundColor.setHex(0x120605); hemiLight.intensity = 0.62;
    sunLight.color.setHex(0xff6a2c); sunLight.intensity = 1.25;
    rimLight.color.setHex(0x45b6ff); rimLight.intensity = 1.5;
    renderer.toneMappingExposure = 1.15;
  } else if (currentChapter === 2) {
    scene.fog = new THREE.FogExp2(0x101b32, 0.016);
    hemiLight.color.setHex(0x8fb7d7); hemiLight.groundColor.setHex(0x111827); hemiLight.intensity = 0.7;
    sunLight.color.setHex(0xffe0b0); sunLight.intensity = 1.25;
    rimLight.color.setHex(0x8fdfff); rimLight.intensity = 1.1;
    renderer.toneMappingExposure = 1.12;
  } else {
    scene.fog = new THREE.FogExp2(0x0a1718, 0.017);
    hemiLight.color.setHex(0xa7d9c2); hemiLight.groundColor.setHex(0x0b1712); hemiLight.intensity = 0.85;
    sunLight.color.setHex(0xffd29a); sunLight.intensity = 1.8;
    rimLight.color.setHex(0x6fe3d6); rimLight.intensity = 1.2;
    renderer.toneMappingExposure = 1.22;
  }

  chapterBanner.classList.add('hidden');

  if (!(titleWorldAvailable && currentChapter === 0)) void world.loadChapter(cfg, gltfLoader);
  titleWorldAvailable = false;
  void enemies.spawnChapterEnemies(cfg.enemies, gltfLoader, (x, z) => world.getTerrainHeight(x, z));
  void heroModelPromise;
  void enemies.ready();
  void renderer.compileAsync(scene, camera).catch(() => {});
  if (ngPlus > 0) {
    for (const e of enemies.enemies) {
      e.maxHp = Math.round(e.maxHp * (1 + ngPlus * 0.35));
      e.hp = e.maxHp;
    }
  }
  // Give the player one beat to land before clear can trigger.
  chapterReady = true;
  const bossSpec = cfg.enemies.find((e) => e.isBoss);
  const bossName = bossSpec?.name ?? '';
  bossIntro.classList.add('hidden');
  cinematicBoss = null;
  cinematicTimer = 0;

  window.setTimeout(() => { if (generation !== chapterGeneration) return; showStory(`${cfg.code} · ${cfg.title}　|　妖王：${bossName}`, 3800); speak('boss-intro'); }, 1300);
  window.setTimeout(() => { if (generation === chapterGeneration) audio.playBossRoar(); }, 1200);
}

// Combat Actions
function performLightAttack(): void {
  if (!gameStarted || modalOpen) return;
  // Auto soft-face nearest enemy within 7m for snappy action feel
  autoFaceNearestEnemy(7.5);
  if (!hero.startLightAttack()) {
    lightBuffer = 0.2;
    return;
  }
  lightBuffer = 0;
  audio.playLightSwing(hero.comboStep);
  const now = performance.now();
  if (now - lastComboVoice > 2400) {
    lastComboVoice = now;
    speak('combo');
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
    speak('heavy');
  }
}

function performDodge(): void {
  if (!gameStarted || modalOpen) return;
  const imminent = enemies.isAnyAttackImminentNear(hero.root.position, 6.4);
  if (hero.triggerDodge()) {
    audio.playDodge();
    if (imminent) {
      speak('dodge');
      // Perfect Dodge ("幻影身法") -> Bullet-time + +100 Focus Bean!
      hero.focusPoints = Math.min(300, hero.focusPoints + 100);
      vfx.triggerPerfectDodgeSlowMo();
      audio.playPerfectDodge();
      showToast('幻影闪身 · 完美识破 (+1 棍势豆)');
    }
  }
}

function updateFormHud(): void {
  const info = currentForm ? FORM_INFO[currentForm] : null;
  formNameEl.textContent = info ? info.name : forms.length > 0 ? '待借形' : '未收';
  formTimerEl.textContent = info ? `${Math.ceil(formTimer)}s` : forms.length > 0 ? `${forms.length}/3` : '';
  formHud.classList.toggle('active', Boolean(currentForm));
}

function setFormFamiliar(kind: FormKind): void {
  if (formFamiliar) { formFamiliar.removeFromParent(); disposeObject(formFamiliar); formFamiliar = null; }
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.35, `rgba(${(FORM_INFO[kind].color >> 16) & 255},${(FORM_INFO[kind].color >> 8) & 255},${FORM_INFO[kind].color & 255},0.55)`);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: FORM_INFO[kind].color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(0.55, 0.9, 1);
  sprite.position.set(1.25, 1.35, -0.35);
  hero.root.add(sprite);
  formFamiliar = sprite;
}

function learnForm(e: ActiveEnemy): void {
  const isDragon = e.spec.modelCandidates.some((u) => u.includes('zhulong')) || e.spec.name.includes('龙');
  const isWolf = e.spec.name.includes('狼') || e.spec.name.includes('狐');
  const kind: FormKind = isDragon ? 'dragon' : isWolf ? 'wolf' : 'bull';
  if (!forms.includes(kind)) {
    forms.push(kind);
    setFormFamiliar(kind);
    showStory(`收形 · ${FORM_INFO[kind].name}　按 V 借形，E 施展`, 3800);
  }
  updateFormHud();
}

function endForm(): void {
  if (currentForm) {
    hero.bodyWrap.scale.setScalar(1);
    if (formFamiliar) formFamiliar.visible = false;
    if (formAura) formAura.visible = false;
  }
  currentForm = null;
  formTimer = 0;
  formHud.classList.remove('active');
  updateFormHud();
}

function cycleForm(): void {
  if (!gameStarted || modalOpen || paused) return;
  if (forms.length === 0) { showToast('尚未收形 · 击败妖怪后按 V'); return; }
  formIndex = (formIndex + 1) % forms.length;
  currentForm = forms[formIndex];
  formTimer = 10;
  setFormFamiliar(currentForm);
  const info = FORM_INFO[currentForm];
  hero.bodyWrap.scale.setScalar(currentForm === 'bull' ? 1.12 : 1.03);
  if (formFamiliar) formFamiliar.visible = true;
  if (!formAura) {
    formAura = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.025, 8, 40),
      new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    formAura.rotation.x = Math.PI / 2;
    formAura.position.y = 0.12;
    hero.root.add(formAura);
  }
  (formAura.material as THREE.MeshBasicMaterial).color.setHex(info.color);
  formAura.visible = true;
  formHud.classList.add('active');
  audio.playPerfectDodge();
  showToast(`借形 · ${info.name}　E 施展`);
  updateFormHud();
}

function performFormAbility(): void {
  if (!currentForm || formTimer <= 0) { performSpinAttack(); return; }
  const info = FORM_INFO[currentForm];
  const fwd = new THREE.Vector3(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
  const targets = enemies.getAliveEnemies().filter((e) => e.root.position.distanceTo(hero.root.position) <= (currentForm === 'dragon' ? 11 : 5.2));
  if (currentForm === 'bull') {
    hero.root.position.addScaledVector(fwd, 4.2);
    world.resolveCollision(hero.root.position, 0.5);
    for (const e of targets) { enemies.applyDamage(e, 95); enemies.addPosture(e, 30); }
    vfx.spawnShockwave(hero.root.position.clone(), 6.5, info.color);
    vfx.shakeIntensity = Math.max(vfx.shakeIntensity, 0.38);
  } else if (currentForm === 'dragon') {
    for (const e of targets) {
      const to = e.root.position.clone().sub(hero.root.position);
      if (to.length() < 0.1 || to.normalize().dot(fwd) > 0.15) { enemies.applyDamage(e, 72); enemies.addPosture(e, 12); }
    }
    vfx.spawnShockwave(hero.root.position.clone().addScaledVector(fwd, 4), 9, info.color);
  } else {
    hero.root.position.addScaledVector(fwd, 6.2);
    world.resolveCollision(hero.root.position, 0.5);
    for (const e of targets) enemies.applyDamage(e, 62);
    vfx.spawnShockwave(hero.root.position.clone(), 4, info.color);
  }
  hitStopTimer = Math.max(hitStopTimer, 0.1);
  audio.playStaffHit(true);
  audio.playVoice('combo');
  endForm();
}

function performSpinAttack(): void {
  if (!gameStarted || modalOpen || paused) return;
  if (!hero.startSpinAttack()) return;
  audio.playLightSwing(1);
  audio.playVoice('fan');
  showToast('棍势 · 横扫千军');
}

function performParry(): void {
  if (!gameStarted || modalOpen || paused) return;
  const broken = enemies.getAliveEnemies().find((e) => e.brokenTimer > 0 && e.root.position.distanceTo(hero.root.position) < 4.2);
  if (broken) {
    const dmg = broken.spec.isBoss ? 210 : 260;
    enemies.applyDamage(broken, dmg);
    vfx.triggerHitJuice(broken.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), dmg, true, `处决 ${dmg}!`);
    vfx.spawnShockwave(broken.root.position, 6.5, 0xffd166);
    hitStopTimer = Math.max(hitStopTimer, 0.14);
    vfx.shakeIntensity = Math.max(vfx.shakeIntensity, 0.28);
    audio.playStaffHit(true);
    audio.playPerfectDodge();
    showToast(`处决 · ${broken.spec.name}`);
    return;
  }
  if (hero.startParry()) {
    audio.playDodge();
    showToast('棍花 · 弹反窗口');
  }
}

function tryRingBell(): void {
  if (!gameStarted || modalOpen || paused || currentChapter !== 2 || bellCooldown > 0) return;
  const dx = hero.root.position.x + 8;
  const dz = hero.root.position.z - 4;
  if (Math.hypot(dx, dz) > 4.8) return;
  bellCooldown = 20;
  const count = enemies.castDingShen(hero.root.position, 30);
  audio.playDingShenSpell();
  audio.playBossRoar();
  vfx.spawnShockwave(new THREE.Vector3(-8, world.getTerrainHeight(-8, 4) + 1.5, 4), 16, 0xffe28a);
  showStory('天钟一响 · 万妖定形。趁现在处决。', 3600);
  showToast(count > 0 ? `天钟镇妖 · ${count} 名妖邪定身` : '天钟一响 · 余音护体');
}

function castSpell(slot: number): void {
  if (!gameStarted || modalOpen) return;
  if (slot === 1) {
    if (hero.cdDing > 0 || hero.mana < 20) return;
    hero.mana -= 20;
    hero.cdDing = 9.0;
    const count = enemies.castDingShen(hero.root.position, 15);
    audio.playDingShenSpell();
    speak('ding');
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
    speak('fan');
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
  spiritsFound = 0;
  collectedSpirits.clear();
  forms = [];
  learnedForms.clear();
  currentForm = null;
  formIndex = -1;
  formTimer = 0;
  endForm();
  updateFormHud();
  ngPlus = 0;
  unlockedChapter = 0;
  updateChapterLocks();
  bellCooldown = 0;
  bellPrompted = false;
  updateSpiritHud();
  updateRootHud();
  // Start gameplay immediately; audio (reverb + voice preload) initializes in parallel.
  void audio.init().then(() => speak('start'));
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
document.getElementById('btn-pause-quality')!.addEventListener('click', () => { applyQuality(!performanceMode); });
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
  if (k === 'f') performParry();
  if (k === 'e') performFormAbility();
  if (k === 'v') cycleForm();
  if (k === 'g') tryRingBell();
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
const VOICE_TEXT: Record<string, string> = {
  start: '俺老孙来也。',
  combo: '吃俺一棒',
  heavy: '碎！',
  dodge: '闪。',
  ding: '定！',
  fan: '风来！',
  phase: '法天象地！',
  victory: '妖怪，哪里逃！',
  death: '俺老孙……去也……',
  choice: '这一根，你拿得动吗？',
  'ending-good': '金箍落下，你渡了自己。',
  'ending-bad': '你成了新的妖王。',
  'boss-intro': '妖王，受死！',
  'low-hp': '俺老孙，还撑得住……',
};

function speak(name: string): void {
  const duration = audio.playVoice(name);
  const text = VOICE_TEXT[name];
  if (text) showStory(text, Math.max(2200, duration * 1000 + 150));
}

function showStory(text: string, ms = 4200): void {
  storySub.textContent = text;
  storySub.classList.remove('hidden');
  window.clearTimeout(storyTimer);
  storyTimer = window.setTimeout(() => storySub.classList.add('hidden'), ms);
}

const SPIRIT_LORE = [
  ['灵蕴 · 怒', '石缝里有一道旧刻痕，像是有人用指甲写的“别回头”。'],
  ['灵蕴 · 嗔', '焦土下埋着半只铜铃，摇不响，却还有余温。'],
  ['灵蕴 · 痴', '云海尽头有人在敲钟。你数到第九声，钟声停了。'],
  ['灵蕴 · 疑', '桃树根下压着一片金甲，尺寸和你身上的一模一样。'],
  ['灵蕴 · 惧', '这尊石狮的眼睛，刚才是不是转了一下？'],
  ['灵蕴 · 空', '水帘后面没有洞，只有一面照不出你的镜子。'],
  ['灵蕴 · 舍', '南天门的门槛上，刻着“到此一游”，字迹是你的。'],
  ['灵蕴 · 得', '香炉里没有香，只有一根烧了一半的猴毛。'],
  ['灵蕴 · 忘', '你听见有人在很远的地方喊“大圣”，却想不起是谁。'],
];

function updateSpiritHud(): void {
  spiritCountEl.textContent = String(spiritsFound);
}

function spawnSpiritOrbs(chapter: number): void {
  for (const o of spiritOrbs) { scene.remove(o.group); disposeObject(o.group); }
  spiritOrbs = [];
  const positions: Record<number, Array<[number, number]>> = {
    0: [[-17, -2], [17, -6], [4, -27]],
    1: [[-18, 6], [18, 8], [0, -26]],
    2: [[-14, -4], [14, 2], [0, -22]],
  };
  const list = positions[chapter] ?? positions[0];
  list.forEach(([x, z], i) => {
    const key = `${chapter}-${i}`;
    if (collectedSpirits.has(key)) return;
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x9fffe0, emissive: 0x1c8f72, emissiveIntensity: 2.2, roughness: 0.2 })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.018, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x6fe3d6, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(core, ring);
    const y = world.getTerrainHeight(x, z) + 1.3;
    g.position.set(x, y, z);
    g.userData.baseY = y;
    g.userData.spin = Math.random() * Math.PI;
    scene.add(g);
    spiritOrbs.push({ group: g, key, lore: SPIRIT_LORE[(chapter * 3 + i) % SPIRIT_LORE.length][1] });
  });
  updateSpiritHud();
}

function collectSpirit(orb: { group: THREE.Group; key: string; lore: string }): void {
  collectedSpirits.add(orb.key);
  spiritsFound += 1;
  chapterSpirits += 1;
  scene.remove(orb.group);
  disposeObject(orb.group);
  spiritOrbs = spiritOrbs.filter((o) => o !== orb);
  updateSpiritHud();
  audio.playDingShenSpell();
  showStory(orb.lore, 3600);
  vfx.spawnShockwave(orb.group.position, 3.2, 0x6fe3d6);
  if (spiritsFound === 3) {
    hero.maxHp += 20;
    hero.hp = hero.maxHp;
    showToast('灵蕴共鸣 · 气血上限 +20');
  } else if (spiritsFound === 6) {
    hero.maxMana += 15;
    hero.mana = hero.maxMana;
    showToast('灵蕴共鸣 · 法力上限 +15');
  } else if (spiritsFound === 9) {
    gourdCharges += 1;
    showToast('九蕴归一 · 葫芦 +1');
  }
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
  speak('choice');
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
  if (!isFinal) {
    unlockedChapter = Math.max(unlockedChapter, currentChapter + 1);
    updateChapterLocks();
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
    speak('ending-good');
    openModal(
      '齐天大圣 · 金箍落下',
      '你渡了自己',
      `六根归位，你却一根未留。金箍从头上落下，花果山的风第一次没有血腥味。\n（业障 ${karma}）`,
      '再入轮回 · NG+1',
      () => { roots = 0; karma = 0; damageBonus = 0; ngPlus += 1; spiritsFound = 0; collectedSpirits.clear(); unlockedChapter = 0; updateChapterLocks(); updateSpiritHud(); updateRootHud(); startChapter(0); showToast(`再入轮回 · NG+${ngPlus}`); }
    );
  } else {
    speak('ending-bad');
    openModal(
      '齐天大圣 · 新的妖王',
      '你成了自己打的那只妖',
      `六根归位，全部收下。你坐在凌霄殿上，听见山下又有人喊“大圣”。\n（业障 ${karma}）`,
      '再入轮回 · NG+1',
      () => { roots = 0; karma = 0; damageBonus = 0; ngPlus += 1; spiritsFound = 0; collectedSpirits.clear(); unlockedChapter = 0; updateChapterLocks(); updateSpiritHud(); updateRootHud(); startChapter(0); showToast(`再入轮回 · NG+${ngPlus}`); }
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

function respawnAtBoss(): void {
  const boss = enemies.getActiveBoss();
  if (!boss) { startChapter(currentChapter); return; }
  modalOverlay.classList.add('hidden');
  modalOpen = false;
  gameStarted = true;
  hero.hp = hero.maxHp;
  hero.mana = hero.maxMana;
  gourdCharges = 3;
  hero.root.position.set(0, world.getTerrainHeight(0, 6), 6);
  hero.yaw = Math.PI;
  hero.root.rotation.y = Math.PI;
  camYaw = 0;
  for (const e of enemies.enemies) {
    if (!e.spec.isBoss) {
      e.dead = true;
      e.deathTimer = 0;
      e.hpBarWrap.remove();
      scene.remove(e.root);
    }
  }
  boss.hp = boss.maxHp;
  boss.phase2 = false;
  boss.phase3 = false;
  boss.brokenTimer = 0;
  boss.staggerTimer = 0;
  boss.windUpTimer = 0;
  boss.attackCooldown = 1.4;
  boss.modelWrap.scale.setScalar(1.0);
  boss.root.position.set(boss.spec.pos[0], world.getTerrainHeight(boss.spec.pos[0], boss.spec.pos[1]), boss.spec.pos[1]);
  chapterDamage = 0;
  chapterStartedAt = performance.now();
  chapterReady = true;
  chapterClearedTriggered = false;
  lockTarget = boss;
  showToast('归来 · 再战妖王');
}

function startPhaseCard(title: string, sub: string, boss: ActiveEnemy | null): void {
  phaseBoss = boss;
  phaseTimer = 1.2;
  phaseTitle.textContent = title;
  phaseSub.textContent = sub;
  phaseCard.classList.remove('hidden');
  audio.playBossRoar();
  vfx.triggerPerfectDodgeSlowMo();
}

// Debug references are installed once, only behind the explicit developer URL.
if (devMode) {
  (window as unknown as { __W: unknown }).__W = {
    enemies, hero, world, camera, renderer, scene, audio, startChapter,
    state: () => ({ currentChapter, unlockedChapter, gameStarted, chapterReady, performanceMode }),
    unlockAll: () => { unlockedChapter = 2; updateChapterLocks(); },
  };
}

// Main 60fps Game Loop
let lastTime = performance.now();

function animate(now: number): void {

requestAnimationFrame(animate);
  let rawDt = Math.min(0.05, (now - lastTime) * 0.001);
  lastTime = now;
  if (hitStopTimer > 0) {
    hitStopTimer = Math.max(0, hitStopTimer - rawDt);
    rawDt *= 0.12;
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
  if (cinematicTimer > 0) {
    cinematicTimer -= rawDt;
    const b = cinematicBoss;
    if (b) {
      const p = THREE.MathUtils.clamp(1 - cinematicTimer / 2.8, 0, 1);
      const angle = -1.15 + p * 1.9;
      const radius = 8.2 - p * 2.2;
      camera.position.set(b.root.position.x + Math.sin(angle) * radius, b.root.position.y + 2.2 + p * 1.1, b.root.position.z + Math.cos(angle) * radius);
      camera.lookAt(b.root.position.x, b.root.position.y + 1.5, b.root.position.z);
    }
    if (cinematicTimer <= 0) {
      bossIntro.classList.add('hidden');
      lockTarget = cinematicBoss;
      cinematicBoss = null;
    }
    composer.render(rawDt);
    return;
  }
  const dt = vfx.update(rawDt);
  lightBuffer = Math.max(0, lightBuffer - dt);
  if (lightBuffer > 0 && !modalOpen && gameStarted) {
    autoFaceNearestEnemy(7.5);
    if (hero.startLightAttack()) {
      lightBuffer = 0;
      audio.playLightSwing(hero.comboStep);
    }
  }
  bellCooldown = Math.max(0, bellCooldown - dt);
  if (currentChapter === 2 && !bellPrompted && !modalOpen && Math.hypot(hero.root.position.x + 8, hero.root.position.z - 4) < 5.5) {
    bellPrompted = true;
    showStory('天钟 · 按 G 镇住全场妖邪', 2800);
  }
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) resetCombo();
  }
  fireBurnCooldown = Math.max(0, fireBurnCooldown - rawDt);

  if (!modalOpen) {
    // 1. Update Sun Wukong
    const previousAttackTimer = hero.attackTimer;
    hero.update(dt, keys, camYaw, (x, z) => world.getTerrainHeight(x, z));
    world.resolveCollision(hero.root.position, 0.45);

    // 2. Check Wukong Staff Hit Detection during active swing window
    const circular = hero.isFinisher && !hero.isHeavySlam;
    if (previousAttackTimer > 0.08 && hero.attackTimer < (hero.isHeavySlam ? 0.25 : circular ? 0.44 : 0.22)) {
      const fwd = new THREE.Vector3(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
      const firstContact = hero.struckTargets.size === 0;
      let landed = false;
      for (const e of enemies.getAliveEnemies()) {
        if (hero.struckTargets.has(e.root.id)) continue;
        const offset = e.root.position.clone().sub(hero.root.position);
        const along = offset.dot(fwd);
        const side = Math.abs(offset.x * fwd.z - offset.z * fwd.x);
        const radius = e.spec.scale * 0.35;
        const distance = Math.hypot(offset.x, offset.z);
        let hits = false;
        if (hero.isHeavySlam) hits = along >= -radius && along <= 4.6 + radius && side < 1.65 + radius;
        else if (hero.comboStep === 3) hits = along >= 0 && along <= 6 + radius && side < 0.72 + radius;
        else if (circular) {
          const angleAt = (timer: number) => -Math.PI + 2 * Math.PI * THREE.MathUtils.smoothstep(1 - timer / 0.52, 0.16, 0.84);
          const start = angleAt(previousAttackTimer);
          const end = angleAt(hero.attackTimer);
          const bearing = Math.atan2(offset.x, offset.z) - hero.yaw;
          const delta = Math.abs(Math.atan2(Math.sin(bearing - (start + end) / 2), Math.cos(bearing - (start + end) / 2)));
          const allowance = Math.asin(Math.min(1, (radius + 0.28) / Math.max(distance, 0.01)));
          hits = distance <= 4.2 + radius && delta <= (end - start) / 2 + allowance;
        }
        else hits = distance <= 3.65 + radius && along >= -(hero.comboStep === 1 ? 0.45 * distance : radius);
        if (hits && Math.abs(offset.y) < 3 + radius) {
          hero.struckTargets.add(e.root.id);
          landed = true;
          const baseDmg = Math.round(
            (hero.isHeavySlam ? 85 + heavySlamBeans * 58 : 34 + hero.comboStep * 9 + (hero.isFinisher ? 22 : 0)) * (1 + damageBonus) * (1 + Math.min(comboCount, 20) * 0.015) * (e.brokenTimer > 0 ? 2.2 : 1)
          );
          const enteredP2 = enemies.applyDamage(e, baseDmg, fwd);
          const broke = enemies.addPosture(e, hero.isHeavySlam ? 36 : 15);
          if (broke) {
            showToast(`${e.spec.name} · 破防！按 F 处决`);
            vfx.spawnShockwave(e.root.position, 5.5, 0x6fe3d6);
          }
          vfx.triggerHitJuice(
            e.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
            baseDmg,
            hero.isHeavySlam,
            hero.isHeavySlam ? `暴击 ${baseDmg}!` : `${baseDmg}`,
            fwd
          );
          if (!hero.isHeavySlam) {
            hero.focusPoints = Math.min(300, hero.focusPoints + 36);
          }
          if (e.spec.isBoss && e.phase3 && !phase3Announced) {
            phase3Announced = true;
            startPhaseCard('燃命', '妖王 · 濒死三阶段', e);
          }
          if (enteredP2) {
            vfx.spawnShockwave(e.root.position, 12, 0xff3b1f);
            document.body.classList.add('eva-alert');
            startPhaseCard('法天象地', '妖王 · 狂暴二阶段', e);
            audio.setBossPhase(true);
            speak('phase');
            showToast(`${e.spec.name} · 法天象地狂暴二阶段！`);
          }
        }
      }
      if (landed && firstContact) {
        bumpCombo();
        hitStopTimer = Math.max(hitStopTimer, hero.isHeavySlam ? 0.09 : 0.045);
        vfx.shakeIntensity = Math.max(vfx.shakeIntensity, hero.isHeavySlam ? 0.24 : 0.1);
        audio.playStaffHit(hero.isHeavySlam, hero.comboStep);
      }
    }

    // 3. Update Autonomous Hair Clones ([2] 身外身法)
    for (let i = hero.clones.length - 1; i >= 0; i--) {
      const c = hero.clones[i];
      c.life -= dt;
      c.atkCooldown -= dt;
      if (c.life <= 0) {
        scene.remove(c.root);
        disposeObject(c.root);
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

    // Spin sweep: hits every nearby enemy once.
    if (hero.spinTimer > 0.15 && !hero.spinHitDealt) {
      hero.spinHitDealt = true;
      for (const e of enemies.getAliveEnemies()) {
        if (e.root.position.distanceTo(hero.root.position) <= 4.8) {
          const dmg = 72;
          enemies.applyDamage(e, dmg, new THREE.Vector3(Math.sin(hero.yaw), 0, Math.cos(hero.yaw)));
          enemies.addPosture(e, 24);
          vfx.triggerHitJuice(e.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), dmg, true, `${dmg}`);
        }
      }
      vfx.spawnShockwave(hero.root.position, 5.0, 0xffd166);
      audio.playStaffHit(true);
    }

    // 5. Update Enemies & Boss AI
    const anyAggro = enemies.update(
      dt,
      hero.root.position,
      (x, z) => world.getTerrainHeight(x, z),
      (hitEv) => {
        if (hero.parryTimer > 0) {
          hero.parryTimer = 0;
          const broke = enemies.addPosture(hitEv.enemy, 70);
          hero.focusPoints = Math.min(300, hero.focusPoints + 90);
          vfx.triggerPerfectDodgeSlowMo();
          vfx.spawnShockwave(hero.root.position, 4.5, 0x6fe3d6);
          hitStopTimer = Math.max(hitStopTimer, 0.11);
          vfx.shakeIntensity = Math.max(vfx.shakeIntensity, 0.2);
          audio.playPerfectDodge();
          showToast(broke ? '棍花弹反 · 破防！' : '棍花弹反 · 躯干受损！');
          return;
        }
        if (hero.invulnTimer > 0) {
          // Invulnerable mid-dodge -> reward Perfect Dodge!
          hero.focusPoints = Math.min(300, hero.focusPoints + 85);
          vfx.triggerPerfectDodgeSlowMo();
          audio.playPerfectDodge();
          showToast('毫厘闪身 · 万法不侵！');
          return;
        }
        const incoming = Math.round(hitEv.damage * (1 + ngPlus * 0.16));
        hero.hp = Math.max(0, hero.hp - incoming);
        chapterDamage += incoming;
        resetCombo();
        flashPlayerHit();
        vfx.shakeIntensity = Math.max(vfx.shakeIntensity, hitEv.isBossSlam ? 0.52 : 0.25);
        vfx.spawnFloatingText(hero.root.position, `-${hitEv.damage}`, hitEv.isBossSlam);
        if (hitEv.isBossSlam) {
          vfx.spawnShockwave(hitEv.pos, 7.5, 0xff4422);
        }
        if (hero.hp <= 0) {
          speak('death');
          openModal(
            '胜败乃兵家常事',
            '灵台蒙尘 · 重整金甲',
            '大圣有七十二般变化与不坏金身，饮尽仙酿即可再战妖魔！',
            bossCheckpoint ? '再战妖王' : '元神归位 · 再战本回',
            () => bossCheckpoint ? respawnAtBoss() : startChapter(currentChapter)
          );
        }
      },
      (p) => world.resolveCollision(p, 0.5),
      (enemy, stage) => {
        if (stage === 'tell') audio.playAttackCue(enemy.spec.name.includes('龙') ? 'dragon' : enemy.spec.isBoss ? 'boss' : 'minion');
        else {
          audio.playEnemyImpact(enemy.spec.isBoss);
          if (enemy.spec.isBoss) vfx.spawnShockwave(enemy.root.position, enemy.pattern === 2 ? 7.4 : 3.4, 0xff8a43);
        }
      }
    );
    audio.setCombat(anyAggro);
    if (!tutorialParryShown && enemies.enemies.some((e) => !e.dead && e.windUpTimer > 0)) {
      tutorialParryShown = true;
      showStory('红光起 · 按 F 弹反；破防后再按 F 处决', 4200);
    }
    for (const e of enemies.enemies) {
      if (e.dead && !learnedForms.has(e.spec.id)) { learnedForms.add(e.spec.id); learnForm(e); }
    }
    if (currentForm) {
      formTimer -= dt;
      if (formFamiliar) formFamiliar.rotation.y += dt * 1.8;
      if (formAura) formAura.rotation.z += dt * 1.2;
      if (formTimer <= 0) { endForm(); showToast('妖形散去'); }
      updateFormHud();
    }
    const checkpointBoss = enemies.getActiveBoss();
    if (checkpointBoss && !bossCheckpoint && enemies.getAliveEnemies().every((e) => e.spec.isBoss)) {
      bossCheckpoint = true;
      showToast(`检查点 · ${checkpointBoss.spec.name}`);
    }

    // 6. Check Chapter Clear Condition
    if (chapterReady && !chapterClearedTriggered && enemies.getAliveEnemies().length === 0) {
      chapterClearedTriggered = true;
      audio.playVictory();
      speak('victory');
      setTimeout(() => {
        const isFinal = currentChapter >= ACTIVE_CHAPTERS.length - 1;
        const rootLines = [
          '他倒下时，胸口有一根金色的刺——那是你的“怒”。',
          '火里有一根“嗔”。它一直在烧，连你也不放过。',
          '他叫了你一声“贤弟”。你想起自己也曾被压在山下。',
        ];
        const elapsed = (performance.now() - chapterStartedAt) / 1000;
        chapterRank = chapterDamage <= 25 && elapsed < 180 && chapterSpirits >= 2 ? 'S' : chapterDamage <= 70 && elapsed < 300 ? 'A' : 'B';
        openChoice(
          `${ACTIVE_CHAPTERS[currentChapter].code} · 六根之一`,
          isFinal ? '最后一根，怎么用？' : '这一根，怎么用？',
          `${rootLines[currentChapter] ?? rootLines[0]}\n本章评价：${chapterRank} · 灵蕴 ${chapterSpirits}/3\n超度：回血、降低业障；吞噬：永久增伤、抬高业障。`,
          '超度 · 放下',
          () => resolveRoot('mercy', isFinal),
          '吞噬 · 收下',
          () => resolveRoot('devour', isFinal)
        );
      }, 900);
    }
  }

  for (const o of spiritOrbs) {
    o.group.rotation.y += rawDt * 1.6;
    o.group.position.y = (o.group.userData.baseY as number) + Math.sin(now * 0.002 + o.group.userData.spin) * 0.18;
    if (!modalOpen && o.group.position.distanceTo(hero.root.position) < 1.9) collectSpirit(o);
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
  const nearbyBoss = enemies.getActiveBoss();
  const frameBoss = !lockTarget && nearbyBoss && nearbyBoss.root.position.distanceTo(hero.root.position) < 11 ? nearbyBoss : null;
  if (frameBoss) {
    const direction = Math.atan2(frameBoss.root.position.x - hero.root.position.x, frameBoss.root.position.z - hero.root.position.z);
    camYaw = lerpAngle(camYaw, direction + Math.PI, Math.min(1, rawDt * 2.5));
  }
  const fireCam = currentChapter === 1 && !lockTarget;
  const camDist = frameBoss ? 10 : lockTarget ? (lockTarget.spec.isBoss ? 8.6 : 6.4) : (hero.onNimbus ? 9.2 : fireCam ? 6.2 : 6.6);
  const camHeight = hero.onNimbus ? 4.2 : fireCam ? 2.2 + camPitch * 3.2 : 2.6 + camPitch * 3.6;
  const desiredCamPos = new THREE.Vector3(
    hero.root.position.x + Math.sin(camYaw) * camDist,
    hero.root.position.y + camHeight + (frameBoss ? 1 : 0),
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
  if (boss && boss.root.position.distanceTo(hero.root.position) < 22) {
    bossHud.classList.remove('hidden');
    bossNameEl.textContent = boss.spec.name;
    bossTitleEl.textContent = boss.spec.title ?? '';
    bossPhaseTag.classList.toggle('hidden', !boss.phase2);
    bossPhaseTag.textContent = boss.phase3 ? '濒死 · 燃命三阶段' : '法天象地 · 狂暴二阶段';
    bossBarFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    bossPostureFill.style.width = `${(boss.posture / boss.maxPosture) * 100}%`;
  } else {
    bossHud.classList.add('hidden');
  }

  world.updateAmbient(dt, now * 0.001);
  const hpRatio = hero.hp / hero.maxHp;
  lowHp.style.opacity = hpRatio < 0.3 ? String(Math.min(1, (0.3 - hpRatio) * 2.6)) : '0';
  if (hpRatio < 0.3 && !lowHpPlayed) {
    lowHpPlayed = true;
    speak('low-hp');
    showStory('残血 · 按 R 饮葫芦，或 Shift 闪身找机会', 2600);
  }
  composer.render(rawDt);
}

applyQuality(performanceMode);

// Preload Chapter 0 vista behind Title Gate so backdrop looks breathtaking immediately
world.loadChapter(WUKONG_CHAPTERS[0], gltfLoader);
requestAnimationFrame(animate);
