import { disposeObject } from '../utils/disposeObject';
import * as THREE from 'three';

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface ImpactFlash {
  mesh: THREE.Mesh;
  life: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxScale: number;
}

/**
 * AAA Action Combat VFX Manager:
 * - Hit-stop freeze frames & camera trauma shake
 * - Golden spark bursts & ground slam shockwave rings
 * - Floating 3D-to-2D crit damage numbers & "定!" immobilize seals
 */
export class CombatVFX {
  public hitStopTimer = 0;
  public shakeIntensity = 0;
  public timeScale = 1.0;

  private sparks: SparkParticle[] = [];
  private rings: ShockwaveRing[] = [];
  private flashes: ImpactFlash[] = [];
  private sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  private dmgContainer: HTMLElement;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.dmgContainer = document.createElement('div');
    this.dmgContainer.className = 'vfx-layer';
    document.body.appendChild(this.dmgContainer);
  }

  public triggerHitJuice(pos: THREE.Vector3, damage: number, isHeavy = false, label?: string, dir?: THREE.Vector3): void {
    this.hitStopTimer = isHeavy ? 0.085 : 0.038;
    this.shakeIntensity = Math.max(this.shakeIntensity, isHeavy ? 0.55 : 0.18);

    // Golden spark burst
    const count = isHeavy ? 22 : 10;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: isHeavy ? 0xffaa33 : 0xffe588,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(pos);
      const ang = Math.random() * Math.PI * 2;
      const spd = (isHeavy ? 8 : 4.5) + Math.random() * 6;
      const vel = dir
        ? dir.clone().normalize().multiplyScalar(spd * 0.75).add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.8 + Math.random() * 4.5, (Math.random() - 0.5) * 3))
        : new THREE.Vector3(Math.cos(ang) * spd, 2.5 + Math.random() * 6.5, Math.sin(ang) * spd);
      this.scene.add(mesh);
      this.sparks.push({ mesh, vel, life: 0.45 + Math.random() * 0.25 });
    }

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(isHeavy ? 0.52 : 0.3, 10, 8),
      new THREE.MeshBasicMaterial({ color: isHeavy ? 0xffc04d : 0xfff0b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flash.position.copy(pos);
    this.scene.add(flash);
    this.flashes.push({ mesh: flash, life: isHeavy ? 0.16 : 0.1 });

    if (isHeavy) {
      this.spawnShockwave(new THREE.Vector3(pos.x, pos.y - 0.8, pos.z), 6.5, 0xffb84d);
    }

    this.spawnFloatingText(pos, label ?? `${Math.round(damage)}`, isHeavy);
  }

  public spawnShockwave(pos: THREE.Vector3, maxScale: number, colorHex: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.65, 48),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y += 0.12;
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: 0.55, maxScale });
  }

  public spawnFloatingText(worldPos: THREE.Vector3, text: string, isCrit = false): void {
    const proj = worldPos.clone().add(new THREE.Vector3(0, 1.4, 0)).project(this.camera);
    if (proj.z > 1) return;
    const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = `dmg-num ${isCrit ? 'crit' : ''}`;
    el.textContent = text;
    el.style.left = `${x + (Math.random() - 0.5) * 28}px`;
    el.style.top = `${y}px`;
    this.dmgContainer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  public triggerPerfectDodgeSlowMo(): void {
    this.timeScale = 0.28;
    setTimeout(() => {
      this.timeScale = 1.0;
    }, 650);
  }

  public clear(): void {
    for (const s of this.sparks) { s.mesh.removeFromParent(); (s.mesh.material as THREE.Material).dispose(); }
    for (const f of [...this.rings, ...this.flashes]) { f.mesh.removeFromParent(); disposeObject(f.mesh); }
    this.sparks = []; this.rings = []; this.flashes = [];
    this.hitStopTimer = 0; this.shakeIntensity = 0; this.timeScale = 1;
    this.dmgContainer.replaceChildren();
  }

  public update(rawDt: number): number {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDt;
      return 0.002;
    }

    const dt = rawDt * this.timeScale;
    this.shakeIntensity = Math.max(0, this.shakeIntensity - rawDt * 1.8);

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= rawDt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      s.vel.y -= 16 * rawDt;
      s.mesh.position.addScaledVector(s.vel, rawDt);
      s.mesh.scale.setScalar(Math.max(0.01, s.life * 2));
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= rawDt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        disposeObject(r.mesh);
        this.rings.splice(i, 1);
        continue;
      }
      const prog = 1 - r.life / 0.55;
      r.mesh.scale.setScalar(1 + prog * r.maxScale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.9;
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= rawDt;
      if (f.life <= 0) { this.scene.remove(f.mesh); disposeObject(f.mesh); this.flashes.splice(i, 1); continue; }
      const k = 1 - f.life / 0.16;
      f.mesh.scale.setScalar(1 + k * 2.4);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - k);
    }

    return dt;
  }
}
