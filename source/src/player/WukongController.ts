import { modelBounds } from '../utils/modelBounds';
import { disposeObject } from '../utils/disposeObject';
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
  public staffModel: THREE.Object3D | null = null;
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
  private chainRemaining = 0;

  public resetAttackChain(): void {
    this.chainRemaining = 0;
    this.comboStep = 0;
    this.attackTimer = 0;
    this.isFinisher = false;
    this.isHeavySlam = false;
    this.struckTargets.clear();
  }
  public isFinisher = false;
  public spinTimer = 0;
  public spinCooldown = 0;
  public spinHitDealt = false;
  public attackTimer = 0;
  public isHeavySlam = false;
  public readonly struckTargets = new Set<number>();

  public dodgeTimer = 0;
  public invulnTimer = 0;
  public parryTimer = 0;
  public moveVel = new THREE.Vector3();
  public parryCooldown = 0;

  // Spell Cooldowns
  public cdDing = 0;
  public cdClone = 0;
  public cdFan = 0;

  public clones: CloneMinion[] = [];
  private afterimages: Array<{ mesh: THREE.Object3D; life: number }> = [];
  private staffTrail!: THREE.Mesh;
  private staffTrailGeo = new THREE.BufferGeometry();
  private staffTrailPoints: THREE.Vector3[] = [];
  private readonly staffTrailMax = 18;
  private mixer: THREE.AnimationMixer | null = null;
  private handAttached = false;
  private bones = new Map<string, THREE.Object3D>();
  private poseRest = new Map<THREE.Object3D, THREE.Quaternion>();

  private rotateJoint(name: string, pitch: number, twist: number) {
    const bone = this.bones.get(name);
    if (!bone) return;
    this.poseRest.set(bone, bone.quaternion.clone());
    bone.rotateX(pitch);
    bone.rotateY(twist);
  }

  private gripStaff(weight: number) {
    const palm = this.bones.get('lefthand');
    if (!palm) return;
    const grip = this.staffPivot.localToWorld(new THREE.Vector3(0, 0.38, 0));
    for (let pass = 0; pass < 4; pass++) {
      for (const name of ['leftforearm', 'leftarm']) {
        const joint = this.bones.get(name);
        if (!joint) continue;
        if (!this.poseRest.has(joint)) this.poseRest.set(joint, joint.quaternion.clone());
        const current = joint.worldToLocal(palm.getWorldPosition(new THREE.Vector3())).normalize();
        const target = joint.worldToLocal(grip.clone()).normalize();
        const correction = new THREE.Quaternion().setFromUnitVectors(current, target);
        joint.quaternion.multiply(new THREE.Quaternion().slerp(correction, weight));
      }
    }
  }

  private handBone: THREE.Object3D | null = null;
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
      new THREE.CylinderGeometry(0.045, 0.045, 2.35, 16),
      new THREE.MeshStandardMaterial({ color: 0x9e1f18, roughness: 0.35, metalness: 0.4 })
    );
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffd269,
      emissive: 0xd98a1e,
      emissiveIntensity: 0.65,
      metalness: 0.85,
      roughness: 0.18,
    });
    const tipTop = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.5, 16), tipMat);
    tipTop.position.y = 1.0;
    const tipBot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.5, 16), tipMat);
    tipBot.position.y = -1.0;
    shaft.add(tipTop, tipBot);

    // Forged gold bands along the shaft, a leather grip and a red tassel.
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xe0b35c, metalness: 0.9, roughness: 0.22 });
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 8, 24), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = i * 0.28;
      shaft.add(band);
    }
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.52, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a1710, roughness: 0.92 })
    );
    grip.position.y = -0.62;
    shaft.add(grip);
    const tassel = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.36, 8),
      new THREE.MeshStandardMaterial({ color: 0xb01f18, roughness: 0.8 })
    );
    tassel.position.y = -1.28;
    tassel.rotation.z = Math.PI;
    shaft.add(tassel);

    this.staffMesh = shaft;
    staffGroup.add(shaft);
    staffGroup.rotation.z = 0;
    staffGroup.position.y = 0.62;
    this.staffPivot.position.set(0.46, 1.02, -0.36);
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

    const tmpPos = new Float32Array(this.staffTrailMax * 2 * 3);
    const tmpIdx: number[] = [];
    for (let i = 0; i < this.staffTrailMax - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      tmpIdx.push(a, b, c, b, d, c);
    }
    this.staffTrailGeo.setAttribute('position', new THREE.BufferAttribute(tmpPos, 3));
    this.staffTrailGeo.setIndex(tmpIdx);
    this.staffTrail = new THREE.Mesh(this.staffTrailGeo, new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.staffTrail.renderOrder = 12;
    this.scene.add(this.staffTrail);


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
    const preview = new THREE.Group();
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
      preview.add(feather);
    }
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.25, 12), capeMat);
    cape.position.set(0, 0.95, -0.2);
    torso.castShadow = true;
    preview.add(torso, head, cape);
    this.bodyWrap.add(preview);
    const candidates = ['models/wukong-animated.glb', 'models/wukong-rigged.glb', 'models/wukong-tpose.glb'];
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        const gltf = await loader.loadAsync(url);
        const m = gltf.scene;
        const box = modelBounds(m, gltf.animations);
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
            o.frustumCulled = false;
            const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat) { mat.side = THREE.DoubleSide; mat.transparent = false; mat.opacity = 1; mat.alphaTest = 0; }
          }
        });
        m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { const mats = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[]; for (const raw of mats) { const mat = raw as THREE.MeshStandardMaterial; if (mat?.map) { mat.map.anisotropy = 8; mat.map.needsUpdate = true; } } } });
        this.bodyWrap.add(m);
        preview.removeFromParent();
        disposeObject(preview);
        m.traverse(b => { if ((b as THREE.Bone).isBone) this.bones.set(b.name.replace(/^mixamorig:?/i, "").toLowerCase(), b); });

        // Reparent the procedural Jingu Bang from the back to the right hand bone.
        let handBone: THREE.Object3D | null = null;
        m.traverse((o) => {
          if (!handBone && /mixamorig:?righthand$/i.test(o.name)) handBone = o;
        });
        const hb = handBone as THREE.Object3D | null;
        if (hb) {
          this.handBone = hb;
          this.root.add(this.staffPivot);
          this.staffPivot.position.set(0, 0, 0);
          this.staffPivot.rotation.set(0.08, 0, -0.24);
          this.staffPivot.scale.setScalar(0.9);
          const sg = this.staffPivot.children[0] as THREE.Group;
          if (sg) sg.rotation.set(0, 0, 0);
          this.handAttached = true;
        } else {
          this.staffPivot.position.set(0.46, 1.02, -0.36);
        }

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


  }

  public async loadStaffModel(loader: GLTFLoader): Promise<void> {
    try {
      const head = await fetch('models/live-opt/ruyi-staff.glb', { method: 'HEAD' });
      if (!head.ok) return;
      const gltf = await loader.loadAsync('models/live-opt/ruyi-staff.glb');
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m);
      const size = new THREE.Vector3(); const ctr = new THREE.Vector3();
      box.getSize(size); box.getCenter(ctr);
      const s = 2.75 / Math.max(0.01, size.y);
      // Generated staff has a broken bounding box (0.03m) -> scale 86x. Reject it.
      if (!Number.isFinite(s) || s > 6 || s < 0.05) return;
      m.scale.setScalar(s);
      m.position.set(-ctr.x * s, 0.58 - ctr.y * s, -ctr.z * s);
      m.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      this.staffMesh.visible = false;
      this.staffModel = m;
      this.staffPivot.add(m);
    } catch {
      // keep the procedural staff if the generated one is unavailable
    }
  }

  private updateStaffTrail(): void {
    this.root.updateMatrixWorld(true);
    const tip = new THREE.Vector3(0, 1.75, 0).applyMatrix4(this.staffPivot.matrixWorld);
    if (this.attackTimer > 0 || this.spinTimer > 0 || this.parryTimer > 0) {
      this.staffTrailPoints.unshift(tip.clone());
      if (this.staffTrailPoints.length > this.staffTrailMax) this.staffTrailPoints.pop();
    } else if (this.staffTrailPoints.length > 0) {
      this.staffTrailPoints.pop();
    }
    const pts = this.staffTrailPoints;
    const pos = this.staffTrailGeo.getAttribute('position') as THREE.BufferAttribute;
    if (pts.length < 2) {
      (this.staffTrail.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    for (let i = 0; i < this.staffTrailMax; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      const prev = pts[Math.min(pts.length - 1, Math.max(0, i - 1))];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const dir = next.clone().sub(prev);
      if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(dir.normalize(), new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
      side.normalize().multiplyScalar(0.075 * (1 - i / this.staffTrailMax));
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
    }
    pos.needsUpdate = true;
    this.staffTrail.geometry.computeBoundingSphere();
    (this.staffTrail.material as THREE.MeshBasicMaterial).opacity = 0.55;
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

  public startParry(): boolean {
    if (this.parryCooldown > 0 || this.dodgeTimer > 0 || this.attackTimer > 0.2) return false;
    this.parryTimer = 0.34;
    this.parryCooldown = 0.7;
    (this.slashArc.material as THREE.MeshBasicMaterial).color.setHex(0x6fe3d6);
    (this.slashArc.material as THREE.MeshBasicMaterial).opacity = 0.55;
    this.slashArc.rotation.z = -Math.PI * 0.2;
    return true;
  }

  public startLightAttack(): boolean {
    if (this.attackTimer > (this.isFinisher ? 0.08 : 0.14) || this.dodgeTimer > 0) return false;
    this.comboStep = this.chainRemaining > 0 ? (this.comboStep % 4) + 1 : 1;
    this.isFinisher = this.comboStep === 4;
    this.attackTimer = this.isFinisher ? 0.52 : 0.36;
    this.chainRemaining = this.attackTimer + 0.6;
    this.isHeavySlam = false;
    this.struckTargets.clear();
    (this.slashArc.material as THREE.MeshBasicMaterial).color.setHex(0xffdf7a);
    (this.slashArc.material as THREE.MeshBasicMaterial).opacity = 0.85;
    this.slashArc.rotation.z = this.comboStep * 1.4;
    return true;
  }

  public startSpinAttack(): boolean {
    if (this.spinCooldown > 0 || this.spinTimer > 0 || this.attackTimer > 0.2 || this.dodgeTimer > 0) return false;
    this.spinTimer = 0.64;
    this.spinCooldown = 4.0;
    this.spinHitDealt = false;
    return true;
  }

  public startHeavyPillarSlam(): number {
    if (this.attackTimer > 0 || this.dodgeTimer > 0) return 0;
    const beans = Math.max(1, Math.floor(this.focusPoints / 100));
    this.focusPoints = Math.max(0, this.focusPoints - beans * 100);
    this.chainRemaining = 0;
    this.attackTimer = 0.62;
    this.isHeavySlam = true;
    this.isFinisher = false;
    this.struckTargets.clear();
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

  public clearTransientEffects(): void {
    for (const c of this.clones) { c.root.removeFromParent(); disposeObject(c.root); }
    for (const img of this.afterimages) { img.mesh.removeFromParent(); disposeObject(img.mesh); }
    this.clones = []; this.afterimages = [];
    this.staffTrailPoints = [];
    (this.staffTrail.material as THREE.MeshBasicMaterial).opacity = 0;
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

    this.chainRemaining = Math.max(0, this.chainRemaining - dt);
    for (const [bone, rest] of this.poseRest) bone.quaternion.copy(rest);
    this.poseRest.clear();
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
      this.moveVel.copy(fwd).multiplyScalar(speed);
      this.root.position.addScaledVector(this.moveVel, dt);
    } else {
      const canMove = isMoving && this.attackTimer <= 0.22;
      const desiredVel = canMove ? moveDir.clone().multiplyScalar(speed) : new THREE.Vector3();
      this.moveVel.lerp(desiredVel, Math.min(1, dt * 9));
      this.root.position.addScaledVector(this.moveVel, dt);
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

    if (this.handBone) {
      const hp = new THREE.Vector3();
      this.handBone.getWorldPosition(hp);
      this.root.worldToLocal(hp);
      this.staffPivot.position.copy(hp);
    }


    // Combat swing animation & giant Ruyi Jingu Bang scaling + Aholo Retargeted Skeletal Clips
    if (this.dodgeTimer > 0) {
      this.playClipIndex(2); // Roll
    } else if (this.attackTimer > 0) {
      this.playClipIndex(this.isHeavySlam ? 5 : this.isFinisher ? 5 : 3 + (this.comboStep % 2));
    } else if (isMoving && !this.onNimbus) {
      this.playClipIndex(1); // Sprint_Loop
      const act = this.actions[this.activeActionIdx];
      if (act) act.timeScale = THREE.MathUtils.clamp(this.moveVel.length() / 8.6, 0.7, 1.25);
    } else {
      this.playClipIndex(0); // Sword_Idle
    }

    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.spinCooldown = Math.max(0, this.spinCooldown - dt);
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.bodyWrap.rotation.y += dt * 13;
      this.playClipIndex(4);
      if (this.spinTimer <= 0) this.bodyWrap.rotation.y = 0;
    }
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const duration = this.isHeavySlam ? 0.62 : this.isFinisher ? 0.52 : 0.36;
      const phase = THREE.MathUtils.clamp(1 - this.attackTimer / duration, 0, 1);
      const sweep = THREE.MathUtils.smoothstep(phase, 0.16, 0.84);
      const arc = Math.sin(Math.PI * sweep);
      this.staffMesh.scale.setScalar(1);
      this.staffPivot.rotation.order = 'YXZ';
      if (this.isHeavySlam) {
        this.staffMesh.scale.set(2.2, 2.3, 2.2);
        this.staffPivot.rotation.set(-0.85 + 3.15 * sweep, 0, -0.12);
      } else if (this.comboStep === 1) {
        this.staffPivot.rotation.set(1.42, -1.35 + 2.55 * sweep, 0.1);
      } else if (this.comboStep === 2) {
        this.staffPivot.rotation.set(2.28 - 1.7 * sweep, 1.15 - 2.05 * sweep, -0.2);
      } else if (this.comboStep === 3) {
        this.staffPivot.rotation.set(0.38 + 1.2 * arc, 0, -0.12);
        this.staffMesh.scale.y = 1 + 0.55 * arc;
      } else {
        this.staffPivot.rotation.set(1.55, -Math.PI + 2 * Math.PI * sweep, 0.18);
      }
      if (this.comboStep === 3 && !this.isHeavySlam && this.isGrounded) {
        const lastPhase = Math.max(0, phase - dt / duration);
        const step = 0.65 * (THREE.MathUtils.smoothstep(phase, 0.2, 0.55) - THREE.MathUtils.smoothstep(lastPhase, 0.2, 0.55));
        this.root.position.x += Math.sin(this.yaw) * step;
        this.root.position.z += Math.cos(this.yaw) * step;
      }
      const engage = THREE.MathUtils.smoothstep(phase, 0, 0.14) * (1 - THREE.MathUtils.smoothstep(phase, 0.76, 1));
      const twist = this.isHeavySlam ? 0.12 : this.comboStep === 3 ? 0.24 : this.comboStep === 2 ? -0.68 : 0.8;
      const drive = engage * (2 * sweep - 1);
      this.rotateJoint('spine', this.isHeavySlam ? drive * 0.36 : -arc * 0.10, twist * drive);
      this.rotateJoint('leftupleg', -arc * (this.comboStep === 3 ? 0.52 : 0.24), 0);
      this.rotateJoint('rightupleg', arc * 0.18, -twist * drive * 0.2);
      this.rotateJoint('leftleg', arc * 0.22, 0);
      if (this.handBone) {
        this.staffPivot.position.copy(this.root.worldToLocal(this.handBone.getWorldPosition(new THREE.Vector3())));
        this.gripStaff(engage);
      }
      this.staffPivot.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, -0.24)), THREE.MathUtils.smoothstep(phase, 0.76, 1));
      (this.slashArc.material as THREE.MeshBasicMaterial).opacity *= 0.88;
    } else {
      this.staffMesh.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10);
      this.staffPivot.rotation.set(this.handAttached ? 0.08 : 0, 0, this.handAttached ? -0.24 : 0);
      (this.slashArc.material as THREE.MeshBasicMaterial).opacity = 0;
      if (isMoving && !this.onNimbus) {
        this.bodyWrap.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.045;
      } else {
        this.bodyWrap.position.y = 0;
      }
    }

    this.staffPivot.updateWorldMatrix(true, false);
    this.updateStaffTrail();

    // Fade dodge afterimages
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const img = this.afterimages[i];
      img.life -= dt;
      if (img.life <= 0) {
        this.scene.remove(img.mesh);
        disposeObject(img.mesh);
        this.afterimages.splice(i, 1);
      } else {
        ((img.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = img.life;
      }
    }
  }
}
