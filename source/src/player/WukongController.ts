import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface CloneMinion {
  root: THREE.Group;
  staff: THREE.Mesh;
  life: number;
  atkCooldown: number;
}

/**
 * 3rd-Person Action Hero Controller — Sun Wukong (齐天大圣).
 * Supports Aholo Lux3D rigged/retargeted GLB animations + responsive procedural martial combat:
 * - 3-hit Light Staff Combo (LMB / J)
 * - Charged Heavy Pillar Slam consuming Focus Beans 棍势豆 (RMB / K)
 * - Perfect Dodge Roll with Golden Afterimage 幻影身法 (Shift)
 * - [1] 定身术, [2] 身外身法 (3 Hair Clones), [3] 芭蕉扇飓风, [4] 筋斗云飞行
 */
export class WukongController {
  public root = new THREE.Group();
  public bodyWrap = new THREE.Group();
  public staffPivot = new THREE.Group();
  public staffMesh!: THREE.Mesh;
  public slashArc!: THREE.Mesh;
  public nimbusCloud = new THREE.Group();

  public hp = 300;
  public maxHp = 300;
  public mana = 100;
  public maxMana = 100;
  public focusPoints = 0; // 0 .. 300 (each 100 = 1 Focus Bean 棍势豆)

  public yaw = 0;
  public velY = 0;
  public isGrounded = true;
  public onNimbus = false;

  public comboStep = 0;
  public attackTimer = 0;
  public isHeavySlam = false;
  public hitDealtThisSwing = false;

  public dodgeTimer = 0;
  public invulnTimer = 0;

  // Spell Cooldowns
  public cdDing = 0;
  public cdClone = 0;
  public cdFan = 0;

  public clones: CloneMinion[] = [];
  private afterimages: Array<{ mesh: THREE.Object3D; life: number }> = [];
  private mixer: THREE.AnimationMixer | null = null;
  private actions: THREE.AnimationAction[] = [];
  private activeActionIdx = -1;

  constructor(private scene: THREE.Scene) {
    this.root.position.set(0, 0, 14);
    this.root.add(this.bodyWrap);
    this.buildStaffAndNimbus();
    this.scene.add(this.root);
  }

  private buildStaffAndNimbus(): void {
    // Glowing Ruyi Jingu Bang (如意金箍棒)
    const staffGroup = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 2.7, 16),
      new THREE.MeshStandardMaterial({ color: 0x9e1f18, roughness: 0.35, metalness: 0.4 })
    );
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffd269,
      emissive: 0xd98a1e,
      emissiveIntensity: 0.65,
      metalness: 0.85,
      roughness: 0.18,
    });
    const tipTop = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.55, 16), tipMat);
    tipTop.position.y = 1.15;
    const tipBot = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.55, 16), tipMat);
    tipBot.position.y = -1.15;
    shaft.add(tipTop, tipBot);

    this.staffMesh = shaft;
    staffGroup.add(shaft);
    staffGroup.rotation.z = Math.PI * 0.36;
    this.staffPivot.position.set(0.35, 1.15, 0);
    this.staffPivot.add(staffGroup);
    this.bodyWrap.add(this.staffPivot);

    // Golden weapon slash arc ribbon
    this.slashArc = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 2.5, 32, 1, -Math.PI * 0.4, Math.PI * 0.85),
      new THREE.MeshBasicMaterial({
        color: 0xffdf7a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      })
    );
    this.slashArc.rotation.x = -Math.PI / 2;
    this.slashArc.position.y = 1.1;
    this.root.add(this.slashArc);

    // Golden Nimbus Cloud (筋斗云)
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffe49c,
      emissive: 0xd4922a,
      emissiveIntensity: 0.5,
      roughness: 0.6,
    });
    const puffs = [
      [0, 0, 0, 0.85],
      [-0.65, -0.08, 0.2, 0.62],
      [0.65, -0.08, 0.15, 0.62],
      [0, -0.1, 0.65, 0.55],
      [0, -0.1, -0.6, 0.58],
    ];
    for (const [x, y, z, r] of puffs) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), cloudMat);
      sp.scale.y = 0.48;
      sp.position.set(x, y, z);
      this.nimbusCloud.add(sp);
    }
    this.nimbusCloud.visible = false;
    this.root.add(this.nimbusCloud);
  }

  public async loadHeroModel(loader: GLTFLoader): Promise<void> {
    const candidates = ['models/wukong-animated.glb', 'models/wukong-rigged.glb', 'models/wukong-tpose.glb'];
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        const gltf = await loader.loadAsync(url);
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);
        const s = 2.05 / Math.max(0.01, sz.y);
        m.scale.setScalar(s);
        m.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s);
        m.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.bodyWrap.add(m);

        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(m);
          this.actions = gltf.animations.map((clip) => this.mixer!.clipAction(clip));
          this.playClipIndex(0);
        }
        return;
      } catch {
        // fallback below
      }
    }

    // Articulated Golden-Armor Monkey King fallback until Aholo GLB finishes downloading
    const armorMat = new THREE.MeshStandardMaterial({ color: 0xd9a648, metalness: 0.7, roughness: 0.28 });
    const capeMat = new THREE.MeshStandardMaterial({ color: 0xa62419, roughness: 0.65 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 8, 16), armorMat);
    torso.position.y = 1.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 16), armorMat);
    head.position.y = 1.82;
    // Two long phoenix crown feathers (雉鸡翎)
    for (const side of [-1, 1]) {
      const feather = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.03, 1.35, 8),
        new THREE.MeshBasicMaterial({ color: 0xff6a33 })
      );
      feather.position.set(side * 0.16, 2.35, -0.35);
      feather.rotation.x = -0.65;
      feather.rotation.z = side * -0.18;
      this.bodyWrap.add(feather);
    }
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.25, 12), capeMat);
    cape.position.set(0, 0.95, -0.2);
    torso.castShadow = true;
    this.bodyWrap.add(torso, head, cape);
  }

  private playClipIndex(idx: number): void {
    if (!this.mixer || this.actions.length === 0) return;
    const safeIdx = Math.min(idx, this.actions.length - 1);
    if (this.activeActionIdx === safeIdx) return;
    const next = this.actions[safeIdx];
    next.reset().fadeIn(0.14).play();
    if (this.activeActionIdx >= 0 && this.actions[this.activeActionIdx]) {
      this.actions[this.activeActionIdx].fadeOut(0.14);
    }
    this.activeActionIdx = safeIdx;
  }

  public startLightAttack(): boolean {
    if (this.attackTimer > 0.14 || this.dodgeTimer > 0) return false;
    this.comboStep = (this.comboStep % 3) + 1;
    this.attackTimer = 0.36;
    this.isHeavySlam = false;
    this.hitDealtThisSwing = false;
    (this.slashArc.material as THREE.MeshBasicMaterial).color.setHex(0xffdf7a);
    (this.slashArc.material as THREE.MeshBasicMaterial).opacity = 0.85;
    this.slashArc.rotation.z = this.comboStep * 1.4;
    return true;
  }

  public startHeavyPillarSlam(): number {
    if (this.attackTimer > 0 || this.dodgeTimer > 0) return 0;
    const beans = Math.max(1, Math.floor(this.focusPoints / 100));
    this.focusPoints = Math.max(0, this.focusPoints - beans * 100);
    this.attackTimer = 0.62;
    this.isHeavySlam = true;
    this.hitDealtThisSwing = false;
    this.velY = 7.5; // Leap into the air with giant expanding Jingu Bang!
    this.isGrounded = false;
    (this.slashArc.material as THREE.MeshBasicMaterial).color.setHex(0xff7722);
    (this.slashArc.material as THREE.MeshBasicMaterial).opacity = 0.95;
    return beans;
  }

  public triggerDodge(): boolean {
    if (this.dodgeTimer > 0) return false;
    this.dodgeTimer = 0.34;
    this.invulnTimer = 0.42;

    // Spawn Golden Phantom Afterimage (幻影身法)
    const ghost = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 0.95, 8, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffd56b,
        transparent: true,
        opacity: 0.58,
        wireframe: true,
      })
    );
    ghost.position.copy(this.root.position).add(new THREE.Vector3(0, 1.0, 0));
    this.scene.add(ghost);
    this.afterimages.push({ mesh: ghost, life: 0.55 });
    return true;
  }

  public summonHairClones(): boolean {
    if (this.cdClone > 0 || this.mana < 25) return false;
    this.mana -= 25;
    this.cdClone = 12;

    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const g = new THREE.Group();
      g.position.set(
        this.root.position.x + Math.cos(ang) * 2.2,
        this.root.position.y,
        this.root.position.z + Math.sin(ang) * 2.2
      );
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.26, 0.65, 8, 12),
        new THREE.MeshStandardMaterial({
          color: 0xffe082,
          emissive: 0xc98a24,
          emissiveIntensity: 0.6,
        })
      );
      body.position.y = 0.95;
      const st = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      st.position.set(0.3, 1.0, 0.2);
      st.rotation.x = Math.PI * 0.35;
      g.add(body, st);
      this.scene.add(g);
      this.clones.push({ root: g, staff: st, life: 10.0, atkCooldown: 0.2 * i });
    }
    return true;
  }

  public toggleNimbus(): boolean {
    this.onNimbus = !this.onNimbus;
    this.nimbusCloud.visible = this.onNimbus;
    if (this.onNimbus) {
      this.root.position.y = Math.max(this.root.position.y + 1.8, 2.5);
      this.velY = 0;
    }
    return this.onNimbus;
  }

  public update(
    dt: number,
    keys: Set<string>,
    camYaw: number,
    terrainHeightFn: (x: number, z: number) => number
  ): void {
    this.cdDing = Math.max(0, this.cdDing - dt);
    this.cdClone = Math.max(0, this.cdClone - dt);
    this.cdFan = Math.max(0, this.cdFan - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.mana = Math.min(this.maxMana, this.mana + dt * 3.5);

    if (this.mixer) this.mixer.update(dt);

    // Movement vector relative to camera yaw
    let mx = 0;
    let mz = 0;
    if (keys.has('w') || keys.has('arrowup')) mz -= 1;
    if (keys.has('s') || keys.has('arrowdown')) mz += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;

    const moveDir = new THREE.Vector3(mx, 0, mz);
    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
      this.yaw = Math.atan2(moveDir.x, moveDir.z);
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, this.yaw, dt * 12);
    }

    let speed = this.onNimbus ? 15.5 : 8.6;
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      speed = 18.0;
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.root.position.addScaledVector(fwd, speed * dt);
    } else if (isMoving && this.attackTimer <= 0.22) {
      this.root.position.addScaledVector(moveDir, speed * dt);
    }

    this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -34, 34);
    this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -34, 30);

    const groundY = terrainHeightFn(this.root.position.x, this.root.position.z);

    if (this.onNimbus) {
      if (keys.has(' ')) this.root.position.y += dt * 8.5;
      if (keys.has('c') || keys.has('control')) this.root.position.y -= dt * 8.5;
      this.root.position.y = THREE.MathUtils.clamp(this.root.position.y, groundY + 1.6, 18);
      this.nimbusCloud.rotation.y += dt * 1.4;
    } else {
      if (keys.has(' ') && this.isGrounded) {
        this.velY = 9.8;
        this.isGrounded = false;
      }
      this.velY -= 24 * dt;
      this.root.position.y += this.velY * dt;
      if (this.root.position.y <= groundY) {
        this.root.position.y = groundY;
        this.velY = 0;
        this.isGrounded = true;
      }
    }

    // Combat swing animation & giant Ruyi Jingu Bang scaling + Aholo Retargeted Skeletal Clips
    if (this.dodgeTimer > 0) {
      this.playClipIndex(2); // Roll
    } else if (this.attackTimer > 0) {
      this.playClipIndex(this.isHeavySlam ? 5 : 3 + (this.comboStep % 2));
    } else if (isMoving && !this.onNimbus) {
      this.playClipIndex(1); // Sprint_Loop
    } else {
      this.playClipIndex(0); // Sword_Idle
    }

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const swingProg = 1 - Math.max(0, this.attackTimer) / (this.isHeavySlam ? 0.62 : 0.36);
      if (this.isHeavySlam) {
        // Giant 2.4x Golden Pillar Slam!
        this.staffMesh.scale.set(2.2, 2.3, 2.2);
        this.staffPivot.rotation.x = -1.6 + swingProg * 3.1;
      } else {
        this.staffMesh.scale.set(1, 1, 1);
        this.staffPivot.rotation.y = -1.8 + swingProg * 3.6 * (this.comboStep % 2 === 0 ? -1 : 1);
      }
      (this.slashArc.material as THREE.MeshBasicMaterial).opacity *= 0.88;
    } else {
      this.staffMesh.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10);
      this.staffPivot.rotation.set(0, 0, 0);
      (this.slashArc.material as THREE.MeshBasicMaterial).opacity = 0;
      if (isMoving && !this.onNimbus) {
        this.bodyWrap.position.y = Math.abs(Math.sin(performance.now() * 0.015)) * 0.14;
      } else {
        this.bodyWrap.position.y = 0;
      }
    }

    // Fade dodge afterimages
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const img = this.afterimages[i];
      img.life -= dt;
      if (img.life <= 0) {
        this.scene.remove(img.mesh);
        this.afterimages.splice(i, 1);
      } else {
        ((img.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = img.life;
      }
    }
  }
}
