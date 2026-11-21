import { addAtlasRelief, dressCreature } from '../utils/artSurface';
import { modelBounds } from '../utils/modelBounds';
import { disposeObject } from '../utils/disposeObject';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { EnemySpawnSpec } from '../data/ChaptersData';

export interface ActiveEnemy {
  spec: EnemySpawnSpec;
  root: THREE.Group;
  modelWrap: THREE.Group;
  telegraphRing: THREE.Mesh;
  sealRing: THREE.Mesh;
  hpBarWrap: HTMLDivElement;
  hpBarFill: HTMLDivElement;
  hp: number;
  maxHp: number;
  baseScale: number;
  dragonForm?: { skin: THREE.SkinnedMesh; rise: THREE.AnimationAction; progress: number };
  phase2: boolean;
  frozenTimer: number;
  windUpTimer: number;
  windUpDuration: number;
  recoveryTimer: number;
  attackYaw: number;
  attackCooldown: number;
  hitFlashTimer: number;
  staggerTimer: number;
  posture: number;
  maxPosture: number;
  brokenTimer: number;
  phase3: boolean;
  pattern: number;
  vel: THREE.Vector3;
  undulate: boolean;
  proceduralBoss: boolean;
  dragonUniforms: Array<{ value: number }>;
  dragonAttackUniforms: Array<{ value: number }>;
  dead: boolean;
  deathTimer: number;
  mixer: THREE.AnimationMixer | null;
  actions: THREE.AnimationAction[];
  activeClipIdx: number;
  idleClipIdx: number;
  attackClipIdx: number;
  moveClipIdx: number;
  deathClipIdx: number;
}

export interface EnemyHitPlayerEvent {
  enemy: ActiveEnemy;
  damage: number;
  enemyName: string;
  isBossSlam: boolean;
  pos: THREE.Vector3;
}

/**
 * Journey to the West Yaoguai & Boss AI State Machine:
 * - Loads Aholo Lux3D GLB bosses & minions with graceful procedural fallback
 * - Red ground telegraph circle before heavy attacks -> enables Shift Perfect Dodge Bullet-Time!
 * - [1] 定身术 Golden Immobilize Seal ("定") state
 * - [3] 芭蕉宝扇 Hurricane knockback + stun
 * - Boss 50% HP "法天象地" Phase-2 Enrage (scale surge, crimson aura, faster slam shockwaves)
 */
export class EnemyManager {
  public enemies: ActiveEnemy[] = [];
  private pending = new Set<Promise<void>>();
  private generation = 0;
  private breathFx: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private hpOverlay: HTMLDivElement;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.hpOverlay = document.createElement('div');
    this.hpOverlay.className = 'enemy-hp-layer';
    document.body.appendChild(this.hpOverlay);
  }

  public clearAll(): void {
    this.generation += 1;
    const mats = new Set<THREE.Material>();
    const geos = new Set<THREE.BufferGeometry>();
    const texs = new Set<THREE.Texture>();
    for (const e of this.enemies) {
      this.scene.remove(e.root);
      e.mixer?.stopAllAction();
      if (e.mixer) e.mixer.uncacheRoot(e.mixer.getRoot());
      e.actions = [];
      e.mixer = null;
      disposeObject(e.root, mats, geos, texs);
      e.hpBarWrap.remove();
    }
    for (const fx of this.breathFx) { this.scene.remove(fx.mesh); fx.mesh.geometry.dispose(); (fx.mesh.material as THREE.Material).dispose(); }
    this.breathFx = [];
    this.enemies = [];
    this.pending.clear();
  }

  public async spawnChapterEnemies(
    specs: EnemySpawnSpec[],
    loader: GLTFLoader,
    terrainHeightFn: (x: number, z: number) => number
  ): Promise<void> {
    this.clearAll();

    const gen = this.generation;
    for (const spec of specs) {
      const root = new THREE.Group();
      const y = terrainHeightFn(spec.pos[0], spec.pos[1]);
      root.position.set(spec.pos[0], y, spec.pos[1]);

      const modelWrap = new THREE.Group();
      root.add(modelWrap);

      // Crimson attack telegraph ring on ground (warns player to press Shift!)
      const telegraphRadius = spec.isBoss ? 4.4 : 2.5;
      const telegraphRing = new THREE.Mesh(
        new THREE.RingGeometry(telegraphRadius * 0.62, telegraphRadius, 40),
        new THREE.MeshBasicMaterial({
          color: 0xff3b28,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        })
      );
      telegraphRing.rotation.x = -Math.PI / 2;
      telegraphRing.position.y = 0.08;
      root.add(telegraphRing);

      // Golden Immobilize Seal ring ([1] 定身术)
      const sealRing = new THREE.Mesh(
        new THREE.TorusGeometry(spec.isBoss ? 1.9 : 1.05, 0.055, 12, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffd966,
          transparent: true,
          opacity: 0,
        })
      );
      sealRing.rotation.x = Math.PI / 2;
      sealRing.position.y = spec.scale * 0.6;
      root.add(sealRing);

      // Floating HP bar for non-boss minions (Boss uses top-screen Grand Boss Bar)
      const hpBarWrap = document.createElement('div');
      hpBarWrap.className = `minion-hp ${spec.isBoss ? 'is-boss-hidden' : ''}`;
      hpBarWrap.innerHTML = `<span class="minion-name">${spec.name}</span><div class="minion-track"><div class="minion-fill"></div></div>`;
      const hpBarFill = hpBarWrap.querySelector('.minion-fill') as HTMLDivElement;
      this.hpOverlay.appendChild(hpBarWrap);

      this.scene.add(root);

      const enemy: ActiveEnemy = {
        spec,
        root,
        modelWrap,
        telegraphRing,
        sealRing,
        hpBarWrap,
        hpBarFill,
        hp: spec.hp,
        maxHp: spec.hp,
        baseScale: spec.scale,
        phase2: false,
        frozenTimer: 0,
        windUpTimer: 0,
        windUpDuration: 0,
        recoveryTimer: 0,
        attackYaw: 0,
        attackCooldown: 1.4 + Math.random() * 0.8,
        hitFlashTimer: 0,
        staggerTimer: 0,
        posture: 0,
        maxPosture: spec.isBoss ? 120 : 55,
        brokenTimer: 0,
        phase3: false,
        pattern: 0,
        vel: new THREE.Vector3(),
        undulate: false,
        proceduralBoss: false,
        dragonUniforms: [],
        dragonAttackUniforms: [],
        dead: false,
        deathTimer: 0,
        mixer: null,
        actions: [],
        activeClipIdx: -1,
        idleClipIdx: -1,
        attackClipIdx: -1,
        moveClipIdx: -1,
        deathClipIdx: -1,
      };
      this.enemies.push(enemy);

      // Load Aholo GLB asynchronously so chapter starts instantly
      this.pending.add(this.populateEnemyMesh(enemy, loader, gen));
    }
  }

  public async ready(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  private async populateEnemyMesh(enemy: ActiveEnemy, loader: GLTFLoader, gen: number): Promise<void> {
    // Immediate stylized demon sentinel fallback while GLB loads
    const mat = new THREE.MeshStandardMaterial({
      color: enemy.spec.color,
      roughness: 0.35,
      metalness: 0.55,
      emissive: enemy.spec.isBoss ? enemy.spec.color : 0x000000,
      emissiveIntensity: enemy.spec.isBoss ? 0.25 : 0,
    });
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32 * enemy.spec.scale, 0.55 * enemy.spec.scale, 8, 16),
      mat
    );
    body.position.y = enemy.spec.scale * 0.55;
    body.castShadow = true;
    enemy.modelWrap.add(body);
    const candidates = [...enemy.spec.modelCandidates, 'models/baize-beast.glb'];
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        const gltf = await loader.loadAsync(url);
        if (enemy.dead || gen !== this.generation) { disposeObject(gltf.scene); return; }

        const m = gltf.scene;
        // Armature/empty nodes can inflate setFromObject massively. Measure visible mesh geometry only.
        const box = modelBounds(m, gltf.animations);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);

        const maxDim = Math.max(0.01, sz.y, sz.x * 0.75);
        const s = enemy.spec.scale / maxDim;
        m.scale.setScalar(s);
        m.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s);
        m.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.frustumCulled = false;
            const baseMat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (baseMat) {
              baseMat.side = THREE.DoubleSide;
              baseMat.transparent = false;
              baseMat.opacity = 1;
              baseMat.alphaTest = 0;
              baseMat.depthWrite = true;
            }
            if (!enemy.spec.isBoss) {
              const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
              if (mat && mat.color) {
                const clone = mat;
                clone.color.multiplyScalar(0.88);
                clone.emissive = new THREE.Color(0x1a0d08);
                clone.emissiveIntensity = 0.18;
                clone.transparent = false;
                clone.opacity = 1;
                clone.alphaTest = 0;
                clone.depthWrite = true;
                (obj as THREE.Mesh).material = clone;
              }
            }
          }
        });
        m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { const mats = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[]; for (const raw of mats) { const mat = raw as THREE.MeshStandardMaterial; if (mat?.map) { mat.map.anisotropy = 8; mat.map.needsUpdate = true; } } } });
        addAtlasRelief(m,url);
        if (url !== 'models/zhulong-dragon-rigged.glb') dressCreature(m,enemy.spec.surface);
        enemy.modelWrap.clear();
        enemy.modelWrap.add(m);
        body.removeFromParent();
        disposeObject(body);

        if (gltf.animations && gltf.animations.length > 0) {
          if (url === 'models/zhulong-dragon-rigged.glb') {
            // The authored rig follows the coil from its base to the crown.
            for (const dying of [false,true]) {
              const duration = dying ? 1.15 : 1.5;
              const times = Array.from({length:17},(_,i)=>duration*i/16);
              const tracks: THREE.KeyframeTrack[] = [];
              for (let n=1;n<=6;n++) {
                const values:number[]=[];
                for (const time of times) {
                  const t=time/duration;
                  const weight=n/6;
                  const roll=dying ? weight*.17*THREE.MathUtils.smoothstep(t,0,1) : .055*weight*Math.sin(2*Math.PI*t-n*.55);
                  const pitch=dying ? weight*.25*THREE.MathUtils.smoothstep(t,.08,1) : .065*weight*Math.cos(2*Math.PI*t-n*.55);
                  values.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,0,roll)).toArray());
                }
                tracks.push(new THREE.QuaternionKeyframeTrack('spine_'+n+'.quaternion',times,values));
              }
              gltf.animations.push(new THREE.AnimationClip(dying?'Death':'Cloud_Glide',duration,tracks));
            }
          }
          enemy.mixer = new THREE.AnimationMixer(m);
          enemy.actions = gltf.animations.map((c) => enemy.mixer!.clipAction(c));
          if (url === 'models/zhulong-dragon-rigged.glb') {
            const skin = m.getObjectByName('geometry_0') as THREE.SkinnedMesh;
            // Add offsets in bind-pose units. Root anchors the clouds, successive
            // spine joints lift the coils and extend the neck toward the muzzle.
            const offsets = [[.035,.055,-.035],[.06,.065,-.06],[.04,.067,-.04],
              [-.055,.04,.055],[-.075,.025,.075],[-.04,.032,.04]];
            const tracks = offsets.map((v,i) => new THREE.VectorKeyframeTrack(
              'spine_'+(i+1)+'.position', [0,1], [...v,...v]));
            const rise = enemy.mixer.clipAction(new THREE.AnimationClip(
              'Uncoil',1,tracks,THREE.AdditiveAnimationBlendMode));
            rise.setEffectiveWeight(0).play();
            enemy.dragonForm = { skin, rise, progress: 0 };
            enemy.modelWrap.rotation.y = Math.PI/4;
          }
          const find = (re: RegExp) => gltf.animations.findIndex((c) => re.test(c.name));
          enemy.idleClipIdx = find(/idle/i);
          enemy.attackClipIdx = find(/headbutt|punch|bite|attack|claw|hit/i);
          enemy.moveClipIdx = find(/run|walk|fast_flying|cloud_glide/i);
          if (enemy.moveClipIdx < 0) enemy.moveClipIdx = find(/^(flying|fly)$/i);
          enemy.deathClipIdx = find(/death/i);
          // Retargeted bull clips have generic names. Pose inspection: 1 idle, 2 run,
          // 3 short strike; keep this mapping specific to this asset, never a global fallback.
          if (url === 'models/bullking-animated.glb') {
            enemy.idleClipIdx = find(/^animation_1$/);
            enemy.moveClipIdx = find(/^animation_2$/);
            enemy.attackClipIdx = find(/^animation_3$/);
          }
          this.playEnemyClip(enemy, enemy.idleClipIdx);
        } else if (enemy.spec.isBoss) {
          enemy.proceduralBoss = true;
          if (enemy.spec.modelCandidates.some((u) => u.includes('zhulong'))) enemy.undulate = true;
          m.traverse((o) => {
            if (!(o as THREE.Mesh).isMesh) return;
            const mats = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[];
            for (const raw of mats) {
              const mat = raw as THREE.MeshStandardMaterial;
              if (!mat || !mat.isMeshStandardMaterial) continue;
              const u = { value: 0 };
              const atk = { value: 0 };
              enemy.dragonUniforms.push(u);
              enemy.dragonAttackUniforms.push(atk);
              mat.onBeforeCompile = (shader) => {
                shader.uniforms.uDragonTime = u;
                shader.uniforms.uDragonAttack = atk;
                shader.vertexShader = 'uniform float uDragonTime;\nuniform float uDragonAttack;\n' + shader.vertexShader.replace(
                  '#include <begin_vertex>',
                  `#include <begin_vertex>
                   float wave = sin(position.y * 1.7 - uDragonTime * 2.2) * 0.10;
                   transformed.x += wave;
                   transformed.z += cos(position.y * 1.3 + uDragonTime * 1.6) * 0.08;
                   transformed.z += uDragonAttack * smoothstep(0.0, 0.9, position.y) * 0.45;`
                );
              };
              mat.needsUpdate = true;
            }
          });
        }
        return;
      } catch {
        // try next candidate
      }
    }


  }

  private playEnemyClip(e: ActiveEnemy, idx: number): void {
    if (!e.mixer || e.actions.length === 0) return;
    // Missing clips leave the current pose; never substitute Death/Hit by array order.
    const safe = idx >= 0 ? idx : e.idleClipIdx;
    if (safe < 0 || safe >= e.actions.length || safe === e.deathClipIdx) return;
    if (e.activeClipIdx === safe) return;
    e.actions[safe].reset().fadeIn(0.16).play();
    if (e.activeClipIdx >= 0 && e.actions[e.activeClipIdx]) {
      e.actions[e.activeClipIdx].fadeOut(0.16);
    }
    e.activeClipIdx = safe;
  }

  public getAliveEnemies(): ActiveEnemy[] {
    return this.enemies.filter((e) => !e.dead);
  }

  public getActiveBoss(): ActiveEnemy | null {
    return this.enemies.find((e) => e.spec.isBoss && !e.dead) ?? null;
  }

  private readonly muzzle = new THREE.Vector3();
  private readonly jaw = new THREE.Vector3();

  private alignBreath(e: ActiveEnemy): THREE.Vector3 {
    const form = e.dragonForm;
    if (!form) return this.muzzle.copy(e.root.position).add(new THREE.Vector3(0,1.5,0));
    // Two surface landmarks on the authored head, evaluated after skinning.
    e.root.updateWorldMatrix(true,true);
    form.skin.localToWorld(form.skin.getVertexPosition(47572,this.muzzle));
    form.skin.localToWorld(form.skin.getVertexPosition(61380,this.jaw));
    this.jaw.subVectors(this.muzzle,this.jaw);
    e.modelWrap.rotation.y += THREE.MathUtils.euclideanModulo(
      e.attackYaw - Math.atan2(this.jaw.x,this.jaw.z) + Math.PI, 2*Math.PI) - Math.PI;
    e.root.updateWorldMatrix(true,true);
    form.skin.localToWorld(form.skin.getVertexPosition(47572,this.muzzle));
    e.root.worldToLocal(e.telegraphRing.position.copy(this.muzzle));
    e.telegraphRing.position.y = .08;
    return this.muzzle;
  }

  private spawnDragonBreath(e: ActiveEnemy): THREE.Vector3 {
    performance.mark('wukong-dragon-breath');
    const mouth = this.alignBreath(e);
    const vertices: number[] = [];
    const halfAngle = Math.acos(.42);
    const ground = e.root.position.y + .16 - mouth.y;
    for (let i=0;i<32;i++) {
      const a = halfAngle*(i/16-1), b = a + halfAngle/16;
      vertices.push(0,0,0,10*Math.sin(a),ground,10*Math.cos(a),10*Math.sin(b),ground,10*Math.cos(b));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
    const mat = new THREE.MeshBasicMaterial({color:0xff751d,transparent:true,opacity:.55,
      side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
    const cone = new THREE.Mesh(geo,mat);
    cone.position.copy(mouth);
    cone.rotation.y = e.attackYaw;
    this.scene.add(cone);
    this.breathFx.push({ mesh: cone, life: 0.45 });
    return mouth;
  }

  public isAnyAttackImminentNear(pos: THREE.Vector3, radius = 6.2): boolean {
    for (const e of this.enemies) {
      if (e.dead || e.frozenTimer > 0) continue;
      if (e.windUpTimer > 0 && e.windUpTimer < 0.52) {
        if (e.root.position.distanceTo(pos) <= radius) return true;
      }
    }
    return false;
  }

  public applyDamage(enemy: ActiveEnemy, dmg: number, knockbackDir?: THREE.Vector3): boolean {
    if (enemy.dead) return false;
    enemy.hp = Math.max(0, enemy.hp - dmg);
    enemy.hitFlashTimer = 0.16;
    enemy.staggerTimer = Math.max(
      enemy.staggerTimer,
      enemy.spec.isBoss ? 0.07 : 0.18 + Math.min(0.28, dmg * 0.0018)
    );
    if (!enemy.spec.isBoss) {
      enemy.windUpTimer = 0;
      enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.75);
      (enemy.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    if (knockbackDir && !enemy.spec.isBoss) {
      enemy.root.position.addScaledVector(knockbackDir, 0.85);
    } else if (knockbackDir && enemy.spec.isBoss) {
      enemy.root.position.addScaledVector(knockbackDir, 0.25);
    }

    const entering = enemy.spec.isBoss && !enemy.phase2 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * .5;
    if (entering && enemy.spec.name.includes('龙')) {
      performance.mark('wukong-dragon-rise');
      enemy.windUpTimer = enemy.recoveryTimer = 0;
      enemy.pattern = 0;
      enemy.attackCooldown = 0;
      (enemy.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    // Boss 50% HP Phase-2 "法天象地" Enrage!
    if (enemy.spec.isBoss && !enemy.phase3 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.2) {
      enemy.phase3 = true;
      enemy.phase2 = true;
      enemy.modelWrap.scale.setScalar(1.36);
    }

    let triggeredPhase2 = false;
    if (enemy.spec.isBoss && !enemy.phase2 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
      enemy.phase2 = true;
      triggeredPhase2 = true;
      enemy.modelWrap.scale.setScalar(1.26);
    }

    if (enemy.hp <= 0) {
      enemy.dead = true;
      enemy.deathTimer = 1.2;
      if (enemy.deathClipIdx >= 0 && enemy.actions[enemy.deathClipIdx]) {
        enemy.actions.forEach((a) => a.stop());
        const death = enemy.actions[enemy.deathClipIdx];
        death.setLoop(THREE.LoopOnce, 1);
        death.clampWhenFinished = true;
        death.reset().fadeIn(0.1).play();
        enemy.activeClipIdx = enemy.deathClipIdx;
      }
      (enemy.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
      (enemy.sealRing.material as THREE.MeshBasicMaterial).opacity = 0;
      enemy.hpBarWrap.style.opacity = '0';
    }
    return entering || triggeredPhase2;
  }

  public addPosture(enemy: ActiveEnemy, amount: number): boolean {
    if (enemy.dead || enemy.brokenTimer > 0) return false;
    enemy.posture = Math.min(enemy.maxPosture, enemy.posture + amount);
    if (enemy.posture >= enemy.maxPosture) {
      enemy.posture = 0;
      enemy.brokenTimer = enemy.spec.isBoss ? 1.2 : 1.6;
      enemy.staggerTimer = Math.max(enemy.staggerTimer, enemy.brokenTimer);
      enemy.windUpTimer = 0;
      (enemy.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
      return true;
    }
    return false;
  }

  public castDingShen(origin: THREE.Vector3, range = 14): number {
    let count = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.root.position.distanceTo(origin) <= range) {
        e.frozenTimer = e.spec.isBoss ? 3.8 : 5.2;
        e.windUpTimer = 0;
        (e.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
        (e.sealRing.material as THREE.MeshBasicMaterial).opacity = 0.95;
        count++;
      }
    }
    return count;
  }

  public castPlantainHurricane(origin: THREE.Vector3, forward: THREE.Vector3): number {
    let hitCount = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const toEnemy = e.root.position.clone().sub(origin);
      const dist = toEnemy.length();
      if (dist <= 18) {
        const pushDir = toEnemy.lengthSq() > 0.01 ? toEnemy.normalize() : forward.clone();
        e.root.position.addScaledVector(pushDir, e.spec.isBoss ? 4.2 : 8.5);
        e.windUpTimer = 0;
        e.attackCooldown = 1.6;
        this.applyDamage(e, e.spec.isBoss ? 68 : 95);
        hitCount++;
      }
    }
    return hitCount;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    terrainHeightFn: (x: number, z: number) => number,
    onHitPlayer: (ev: EnemyHitPlayerEvent) => void,
    resolveCollision?: (pos: THREE.Vector3) => void,
    onAttack?: (enemy: ActiveEnemy, stage: 'tell' | 'impact') => void
  ): boolean {
    for (let i = this.breathFx.length - 1; i >= 0; i--) {
      const fx = this.breathFx[i];
      fx.life -= dt;
      if (fx.life <= 0) { fx.mesh.removeFromParent(); disposeObject(fx.mesh); this.breathFx.splice(i, 1); }
      else (fx.mesh.material as THREE.MeshBasicMaterial).opacity = 0.34 * fx.life / 0.45;
    }
    let anyAggro = false;

    for (const e of this.enemies) {
      if (e.dead) {
        if (e.deathTimer > 0) {
          e.deathTimer -= dt;
          if (e.mixer) e.mixer.update(dt * 0.9);
          if (e.deathClipIdx < 0) {
            e.modelWrap.scale.multiplyScalar(0.9);
            e.root.position.y -= dt * 1.4;
          } else if (e.deathTimer < 0.35) {
            e.root.position.y -= dt * 0.8;
          }
          if (e.deathTimer <= 0) {
            this.scene.remove(e.root);
            e.hpBarWrap.remove();
          }
        }
        continue;
      }

      if (e.proceduralBoss && e.actions.length === 0) {
        const pt = performance.now() * 0.001;
        const breathe = 1 + Math.sin(pt * 1.35 + e.spec.scale) * 0.018;
        e.modelWrap.scale.setScalar((e.phase2 ? 1.36 : 1) * breathe);
        e.modelWrap.rotation.z = Math.sin(pt * 0.9) * 0.012;
        if (e.windUpTimer > 0) {
          e.modelWrap.rotation.x = -0.10 - Math.sin((1 - e.windUpTimer) * Math.PI) * 0.14;
        } else {
          e.modelWrap.rotation.x = 0;
        }
      }
      if (e.undulate && e.dragonUniforms.length > 0) {
        const t = performance.now() * 0.001;
        for (const u of e.dragonUniforms) u.value = t;
        for (const a of e.dragonAttackUniforms) a.value = e.windUpTimer > 0 ? Math.min(1, (1.1 - e.windUpTimer) / 0.5) : 0;
        e.modelWrap.position.y = Math.sin(t * 1.2) * 0.15;
      }
      if (!e.dragonForm && e.actions.length > 0 && e.spec.name.includes('龙')) {
        const dtSway = performance.now() * 0.001;
        e.modelWrap.rotation.y = Math.sin(dtSway * 0.9) * (e.windUpTimer > 0 ? 0.035 : 0.15);
        e.modelWrap.rotation.z = Math.sin(dtSway * 1.35) * 0.045;
        e.modelWrap.position.y = 0.1 + Math.sin(dtSway * 1.7) * 0.095;
      }
      const form = e.dragonForm;
      if (form) {
        form.progress = e.phase2 ? Math.min(1, form.progress + dt / 1.25) : 0;
        form.rise.setEffectiveWeight(THREE.MathUtils.smoothstep(form.progress,0,1));
      }
      if (e.mixer && e.frozenTimer <= 0) {
        e.mixer.update(dt * (e.phase3 ? 1.55 : e.phase2 ? 1.35 : 1.0));
      }

      // Hit recoil pulse
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        const targetS = e.phase2 ? 1.34 : 1.08;
        e.modelWrap.scale.setScalar(targetS);
      } else {
        const restS = e.phase2 ? 1.26 : 1.0;
        e.modelWrap.scale.lerp(new THREE.Vector3(restS, restS, restS), dt * 8);
      }

      if (form && e.phase2 && form.progress < 1) {
        e.vel.set(0,0,0);
        continue;
      }
      // Immobilized by [1] 定身术
      if (e.frozenTimer > 0) {
        e.frozenTimer -= dt;
        e.sealRing.rotation.z += dt * 2.8;
        (e.sealRing.material as THREE.MeshBasicMaterial).opacity = Math.min(0.95, e.frozenTimer);
        this.updateFloatingBar(e);
        continue;
      } else {
        (e.sealRing.material as THREE.MeshBasicMaterial).opacity = 0;
      }

      if (e.brokenTimer > 0) {
        e.brokenTimer = Math.max(0, e.brokenTimer - dt);
        e.modelWrap.rotation.z = Math.sin(performance.now() * 0.03) * 0.06;
      } else {
        e.modelWrap.rotation.z = 0;
        e.posture = Math.max(0, e.posture - dt * 3.5);
      }

      if (e.staggerTimer > 0) {
        e.staggerTimer -= dt;
        e.modelWrap.position.x = Math.sin(performance.now() * 0.09) * 0.045;
        this.updateFloatingBar(e);
        continue;
      } else {
        e.modelWrap.position.x = 0;
      }

      if (e.recoveryTimer > 0) {
        e.recoveryTimer = Math.max(0, e.recoveryTimer - dt);
        this.updateFloatingBar(e);
        continue;
      }
      const toPlayer = new THREE.Vector3(
        playerPos.x - e.root.position.x,
        0,
        playerPos.z - e.root.position.z
      );
      const dist = toPlayer.length();
      const aggroRadius = e.spec.isBoss ? 26 : 17;
      const atkRange = e.dragonForm && e.phase2 && e.pattern === 0 ? 8 : e.spec.isBoss ? 4.3 : 2.55;

      if (dist < aggroRadius) {
        anyAggro = true;
        const desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
        if (e.windUpTimer <= 0) e.root.rotation.y = desiredYaw;
        else e.root.rotation.y = e.attackYaw;

        if (e.windUpTimer > 0) {
          e.vel.multiplyScalar(Math.max(0, 1 - dt * 10));
          this.playEnemyClip(e, e.attackClipIdx);
          if (e.dragonForm && e.pattern === 2) this.alignBreath(e);
          e.windUpTimer -= dt;
          const pulse = 0.42 + Math.abs(Math.sin(performance.now() * 0.02)) * 0.45;
          (e.telegraphRing.material as THREE.MeshBasicMaterial).opacity = pulse;
          e.telegraphRing.scale.setScalar(1);
          const progress = 1 - e.windUpTimer / e.windUpDuration;
          // Slime compresses, then jumps; skeleton and wolf keep planted feet.
          if (e.spec.name.includes('史莱姆')) {
            e.modelWrap.scale.y = 1 - Math.sin(progress * Math.PI) * 0.28;
            e.modelWrap.position.y = Math.sin(progress * Math.PI) * 0.5;
          }

          if (e.windUpTimer <= 0) {
            // Execute strike, then leave a punishable recovery instead of instant tracking.
            e.recoveryTimer = e.spec.isBoss ? (e.pattern === 2 ? 0.85 : 0.6) : 0.38;
            onAttack?.(e, 'impact');
            e.modelWrap.position.y = 0;
            (e.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
            e.attackCooldown = e.phase2 ? 1.35 : e.spec.isBoss ? 2.1 : 1.85;

            const isBoss = e.spec.isBoss;
            let hitRadius = isBoss ? (e.phase2 ? 5.2 : 4.5) : 2.75;
            let isSlam = isBoss;
            if (isBoss && e.pattern === 1) {
              // Charge: close the gap before the hit.
              const chargeDir = new THREE.Vector3(Math.sin(e.attackYaw), 0, Math.cos(e.attackYaw));
              e.root.position.addScaledVector(chargeDir, 3.2);
              resolveCollision?.(e.root.position);
              hitRadius = 3.4;
              isSlam = true;
            } else if (isBoss && e.pattern === 2) {
              // Ground shockwave: larger, slower hit.
              hitRadius = 7.4;
              isSlam = true;
            }
            if (isBoss && e.spec.name.includes('龙') && e.pattern === 2) {
              // Dragon breath: forward cone instead of a circular shockwave.
              const mouth = this.spawnDragonBreath(e);
              const fwd = new THREE.Vector3(Math.sin(e.attackYaw), 0, Math.cos(e.attackYaw));
              const to = new THREE.Vector3(playerPos.x - mouth.x, 0, playerPos.z - mouth.z);
              const breathDist = to.length();
              const inCone = breathDist < 10 && (breathDist < 0.1 || to.normalize().dot(fwd) > 0.42);
              if (inCone) {
                onHitPlayer({
                  damage: Math.round(e.spec.atk * (e.phase3 ? 1.8 : 1.45)),
                  enemyName: e.spec.name,
                  isBossSlam: true,
                  enemy: e,
                  pos: e.root.position.clone(),
                });
              }
            } else {
              const currentDist = e.root.position.distanceTo(playerPos);
              const attackDirection = new THREE.Vector3(Math.sin(e.attackYaw), 0, Math.cos(e.attackYaw));
              const facing = toPlayer.lengthSq() < 0.01 || toPlayer.clone().normalize().dot(attackDirection) > 0.1;
              const radial = (isBoss && e.pattern === 2) || e.spec.name.includes('史莱姆');
              if (currentDist <= hitRadius && (radial || facing)) {
                onHitPlayer({
                  damage: e.phase3 ? Math.round(e.spec.atk * 1.65) : e.phase2 ? Math.round(e.spec.atk * 1.35) : e.spec.atk,
                  enemyName: e.spec.name,
                  isBossSlam: isSlam,
                  enemy: e,
                  pos: e.root.position.clone(),
                });
              }
            }
          }
        } else {
          e.attackCooldown = Math.max(0, e.attackCooldown - dt);
          const moveSpd = (e.spec.isBoss ? 4.4 : 4.9) * (e.phase3 ? 1.55 : e.phase2 ? 1.3 : 1.0);
          const wantsMove = dist > atkRange * 0.85;
          const desired = wantsMove ? toPlayer.clone().normalize().multiplyScalar(moveSpd) : new THREE.Vector3();
          const accel = wantsMove ? 6.5 : 10;
          e.vel.x += (desired.x - e.vel.x) * Math.min(1, dt * accel);
          e.vel.z += (desired.z - e.vel.z) * Math.min(1, dt * accel);
          if (!wantsMove) e.vel.multiplyScalar(Math.max(0, 1 - dt * 7));
          e.root.position.addScaledVector(e.vel, dt);
          resolveCollision?.(e.root.position);

          // Keep individual enemies from stacking into one body.
          for (const other of this.enemies) {
            if (other === e || other.dead) continue;
            const ox = e.root.position.x - other.root.position.x;
            const oz = e.root.position.z - other.root.position.z;
            const min = (e.spec.scale + other.spec.scale) * 0.55;
            const d2 = ox * ox + oz * oz;
            if (d2 > 0.0001 && d2 < min * min) {
              const d = Math.sqrt(d2);
              e.root.position.x += (ox / d) * (min - d) * 0.35;
              e.root.position.z += (oz / d) * (min - d) * 0.35;
            }
          }

          if (e.vel.lengthSq() > 0.025) {
            if (e.actions.length > 0) {
              this.playEnemyClip(e, e.moveClipIdx);
              const act = e.actions[e.activeClipIdx];
              if (act) act.timeScale = THREE.MathUtils.clamp(e.vel.length() / moveSpd, 0.6, 1.35);
              e.modelWrap.position.y = 0;
            } else {
              // Static Lux3D minion: no skeleton. Lean and sway instead of fake hopping.
              e.modelWrap.rotation.x = -0.09;
              e.modelWrap.rotation.z = Math.sin(performance.now() * 0.008) * 0.035;
              e.modelWrap.position.y = 0;
            }
          } else if (dist <= atkRange && e.attackCooldown <= 0) {
            // Start telegraphed wind-up so player can dodge or counter!
            if (e.spec.isBoss) {
              // Bull commits to a charge, Hunshi to a ground burst, dragon to breath.
              e.pattern = e.spec.name.includes('龙') && !e.phase2 ? 0 : e.pattern === 0 ? (e.spec.name.includes('牛魔王') ? 1 : 2) : 0;
              e.windUpTimer = [e.phase2 ? 0.68 : 0.9, 0.5, 1.15][e.pattern];
            } else {
              e.windUpTimer = e.spec.name.includes('骸骨') ? 0.85 : e.spec.name.includes('史莱姆') ? 1.05 : 0.55;
            }
            e.attackYaw = desiredYaw;
            e.root.rotation.y = desiredYaw;
            e.windUpDuration = e.windUpTimer;
            const breath = e.spec.name.includes('龙') && e.pattern === 2;
            e.telegraphRing.position.set(0,.08,0);
            if (breath) this.alignBreath(e);
            const radial = (e.spec.isBoss && e.pattern === 2) || e.spec.name.includes('史莱姆');
            const radius = breath ? 10 : e.spec.isBoss ? (e.pattern === 2 ? 7.4 : e.pattern === 1 ? 6.6 : e.phase2 ? 5.2 : 4.5) : 2.75;
            const arc = radial && !breath ? Math.PI * 2 : breath ? 2 * Math.acos(0.42) : Math.PI * 0.94;
            e.telegraphRing.geometry.dispose();
            e.telegraphRing.geometry = new THREE.RingGeometry(0.12, radius, 48, 1, -Math.PI / 2 - arc / 2, arc);
            (e.telegraphRing.material as THREE.MeshBasicMaterial).color.setHex(breath ? 0xffa346 : 0xff4936);
            const action = e.actions[e.attackClipIdx];
            if (action) {
              e.actions.forEach(a => a.fadeOut(0.1));
              action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.08).play();
              action.clampWhenFinished = true;
              action.timeScale = action.getClip().duration / (e.windUpTimer + 0.15) / (e.phase3 ? 1.55 : e.phase2 ? 1.35 : 1);
              e.activeClipIdx = e.attackClipIdx;
            }
            onAttack?.(e, 'tell');
          } else {
            this.playEnemyClip(e, e.idleClipIdx);
            e.modelWrap.rotation.x = 0;
            e.modelWrap.rotation.z = 0;
            e.modelWrap.position.y = 0;
            const act = e.actions[e.activeClipIdx];
            if (act) act.timeScale = 1;
          }
        }
      } else {
        this.playEnemyClip(e, e.idleClipIdx);
      }

      e.root.position.x = THREE.MathUtils.clamp(e.root.position.x, -32, 32);
      e.root.position.z = THREE.MathUtils.clamp(e.root.position.z, -32, 28);
      e.root.position.y = terrainHeightFn(e.root.position.x, e.root.position.z);

      this.updateFloatingBar(e);
    }

    return anyAggro;
  }

  private updateFloatingBar(e: ActiveEnemy): void {
    if (e.spec.isBoss) return;
    const headPos = e.root.position.clone().add(new THREE.Vector3(0, e.spec.scale * 1.15 + 0.5, 0));
    const proj = headPos.project(this.camera);
    if (proj.z > 1) {
      e.hpBarWrap.style.display = 'none';
      return;
    }
    e.hpBarWrap.style.display = 'block';
    const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
    e.hpBarWrap.style.left = `${x}px`;
    e.hpBarWrap.style.top = `${y}px`;
    e.hpBarFill.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
  }
}
