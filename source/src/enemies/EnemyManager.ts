import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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
  phase2: boolean;
  frozenTimer: number;
  windUpTimer: number;
  attackCooldown: number;
  hitFlashTimer: number;
  dead: boolean;
  deathTimer: number;
  mixer: THREE.AnimationMixer | null;
  actions: THREE.AnimationAction[];
  activeClipIdx: number;
}

export interface EnemyHitPlayerEvent {
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
  private hpOverlay: HTMLDivElement;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.hpOverlay = document.createElement('div');
    this.hpOverlay.className = 'enemy-hp-layer';
    document.body.appendChild(this.hpOverlay);
  }

  public clearAll(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.root);
      e.hpBarWrap.remove();
    }
    this.enemies = [];
  }

  public async spawnChapterEnemies(
    specs: EnemySpawnSpec[],
    loader: GLTFLoader,
    terrainHeightFn: (x: number, z: number) => number
  ): Promise<void> {
    this.clearAll();

    for (const spec of specs) {
      const root = new THREE.Group();
      const y = terrainHeightFn(spec.pos[0], spec.pos[1]);
      root.position.set(spec.pos[0], y, spec.pos[1]);

      const modelWrap = new THREE.Group();
      root.add(modelWrap);

      // Crimson attack telegraph ring on ground (warns player to press Shift!)
      const telegraphRadius = spec.isBoss ? 4.4 : 2.5;
      const telegraphRing = new THREE.Mesh(
        new THREE.RingGeometry(0.35, telegraphRadius, 40),
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
        attackCooldown: 1.4 + Math.random() * 0.8,
        hitFlashTimer: 0,
        dead: false,
        deathTimer: 0,
        mixer: null,
        actions: [],
        activeClipIdx: -1,
      };
      this.enemies.push(enemy);

      // Load Aholo GLB asynchronously so chapter starts instantly
      this.populateEnemyMesh(enemy, loader);
    }
  }

  private async populateEnemyMesh(enemy: ActiveEnemy, loader: GLTFLoader): Promise<void> {
    const candidates = [...enemy.spec.modelCandidates, 'models/baize-beast.glb'];
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        const gltf = await loader.loadAsync(url);
        if (enemy.dead) return;

        const m = SkeletonUtils.clone(gltf.scene);
        const box = new THREE.Box3().setFromObject(m);
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
          }
        });
        enemy.modelWrap.clear();
        enemy.modelWrap.add(m);

        if (gltf.animations && gltf.animations.length > 0) {
          enemy.mixer = new THREE.AnimationMixer(m);
          enemy.actions = gltf.animations.map((c) => enemy.mixer!.clipAction(c));
          this.playEnemyClip(enemy, 0);
        }
        return;
      } catch {
        // try next candidate
      }
    }

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
  }

  private playEnemyClip(e: ActiveEnemy, idx: number): void {
    if (!e.mixer || e.actions.length === 0) return;
    const safe = Math.min(idx, e.actions.length - 1);
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

    if (knockbackDir && !enemy.spec.isBoss) {
      enemy.root.position.addScaledVector(knockbackDir, 0.85);
    } else if (knockbackDir && enemy.spec.isBoss) {
      enemy.root.position.addScaledVector(knockbackDir, 0.25);
    }

    // Boss 50% HP Phase-2 "法天象地" Enrage!
    let triggeredPhase2 = false;
    if (enemy.spec.isBoss && !enemy.phase2 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
      enemy.phase2 = true;
      triggeredPhase2 = true;
      enemy.modelWrap.scale.setScalar(1.26);
    }

    if (enemy.hp <= 0) {
      enemy.dead = true;
      enemy.deathTimer = 0.8;
      (enemy.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
      (enemy.sealRing.material as THREE.MeshBasicMaterial).opacity = 0;
      enemy.hpBarWrap.style.opacity = '0';
    }
    return triggeredPhase2;
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
    onHitPlayer: (ev: EnemyHitPlayerEvent) => void
  ): boolean {
    let anyAggro = false;

    for (const e of this.enemies) {
      if (e.dead) {
        if (e.deathTimer > 0) {
          e.deathTimer -= dt;
          e.modelWrap.scale.multiplyScalar(0.9);
          e.root.position.y -= dt * 1.4;
          if (e.deathTimer <= 0) {
            this.scene.remove(e.root);
            e.hpBarWrap.remove();
          }
        }
        continue;
      }

      if (e.mixer && e.frozenTimer <= 0) {
        e.mixer.update(dt * (e.phase2 ? 1.35 : 1.0));
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

      const toPlayer = new THREE.Vector3(
        playerPos.x - e.root.position.x,
        0,
        playerPos.z - e.root.position.z
      );
      const dist = toPlayer.length();
      const aggroRadius = e.spec.isBoss ? 26 : 17;
      const atkRange = e.spec.isBoss ? 4.3 : 2.55;

      if (dist < aggroRadius) {
        anyAggro = true;
        const desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
        e.root.rotation.y = THREE.MathUtils.lerp(e.root.rotation.y, desiredYaw, dt * 6);

        if (e.windUpTimer > 0) {
          this.playEnemyClip(e, e.phase2 ? 3 : 2);
          e.windUpTimer -= dt;
          const pulse = 0.42 + Math.abs(Math.sin(performance.now() * 0.02)) * 0.45;
          (e.telegraphRing.material as THREE.MeshBasicMaterial).opacity = pulse;
          e.modelWrap.position.y = Math.sin((1 - e.windUpTimer) * Math.PI) * (e.spec.isBoss ? 1.15 : 0.45);

          if (e.windUpTimer <= 0) {
            // Execute strike!
            e.modelWrap.position.y = 0;
            (e.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
            e.attackCooldown = e.phase2 ? 1.35 : e.spec.isBoss ? 2.1 : 1.85;

            const currentDist = e.root.position.distanceTo(playerPos);
            const hitRadius = e.spec.isBoss ? (e.phase2 ? 5.2 : 4.5) : 2.75;
            if (currentDist <= hitRadius) {
              onHitPlayer({
                damage: e.phase2 ? Math.round(e.spec.atk * 1.35) : e.spec.atk,
                enemyName: e.spec.name,
                isBossSlam: e.spec.isBoss,
                pos: e.root.position.clone(),
              });
            }
          }
        } else {
          e.attackCooldown = Math.max(0, e.attackCooldown - dt);
          if (dist > atkRange * 0.85) {
            this.playEnemyClip(e, 1);
            const moveSpd = (e.spec.isBoss ? 4.4 : 4.9) * (e.phase2 ? 1.3 : 1.0);
            toPlayer.normalize();
            e.root.position.addScaledVector(toPlayer, moveSpd * dt);
            e.modelWrap.position.y = Math.abs(Math.sin(performance.now() * 0.011)) * 0.16;
          } else if (e.attackCooldown <= 0) {
            // Start telegraphed wind-up so player can dodge or counter!
            e.windUpTimer = e.spec.isBoss ? (e.phase2 ? 0.68 : 0.85) : 0.65;
          } else {
            this.playEnemyClip(e, 0);
          }
        }
      } else {
        this.playEnemyClip(e, 0);
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
