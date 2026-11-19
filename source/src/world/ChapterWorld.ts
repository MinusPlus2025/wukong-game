import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SplatMesh } from '@sparkjsdev/spark';
import type { ChapterConfig } from '../data/ChaptersData';

export interface PeachPickup {
  mesh: THREE.Group;
  collected: boolean;
}

/**
 * Multi-Biome Journey to the West 3D World Builder:
 * Combines Aholo SpatialGen 3D Gaussian Splatting (.spz) panoramic vistas with
 * sculpted playable 3D terrain, biome setpieces, Immortal Peaches (蟠桃),
 * Ch.1 Waterfall & Ruyi Pillar, Ch.2 Three-Samadhi Fire Wall (extinguished by [3] 芭蕉扇),
 * and Ch.3 Celestial Cloud Sea & South Heaven Gate (南天门).
 */
export class ChapterWorld {
  public worldGroup = new THREE.Group();
  public peaches: PeachPickup[] = [];
  public fireWallActive = false;
  public fireWallZ = -6.5;

  private currentChapterIdx = 0;
  private splatBackdrop: SplatMesh | null = null;
  private fireWallGroup = new THREE.Group();
  private ambientMotes: THREE.Points | null = null;
  private petals: THREE.Points | null = null;
  private waterfallMesh: THREE.Mesh | null = null;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.worldGroup);
  }

  public getTerrainHeight(x: number, z: number): number {
    const r = Math.hypot(x, z + 6);
    // Flat boss & combat arena core with gentle natural mountain rim outside radius 18
    const rim = Math.max(0, r - 18) * 0.16;
    const undulation =
      Math.sin(x * 0.14) * Math.cos(z * 0.14) * (this.currentChapterIdx === 2 ? 0.12 : 0.32);
    return undulation + rim;
  }

  public async loadChapter(config: ChapterConfig, loader: GLTFLoader): Promise<void> {
    this.currentChapterIdx = config.index;
    this.clearWorld();

    // Update sky & atmospheric fog
    this.scene.background = new THREE.Color(config.skyColor);
    this.scene.fog = new THREE.FogExp2(config.fogColor, 0.0135);

    // 1. Sculpted vertex-colored 3D terrain mesh + ancient stone boss plaza
    this.buildSculptedTerrain(config);

    // 2. Load Aholo SpatialGen .spz 3DGS world vista in background
    this.loadSplatVista(config.splatWorldUrl);

    // 3. Load monumental Aholo Lux3D landmark GLB (Jingu Bang Pillar / Zhulong / Nantian Gate)
    this.loadLandmark(config, loader);

    // 4. Chapter-specific interactive biome setpieces
    if (config.index === 0) {
      this.buildHuaguoshanBiome();
    } else if (config.index === 1) {
      this.buildFlamingMountainBiome(Boolean(config.hasFireBarrier), loader);
    } else {
      this.buildCelestialGateBiome();
    }

    // 5. Collectible Immortal Peaches (千年蟠桃 — heals +90 HP & +35 Mana)
    this.spawnPeaches(config);

    // 6. Floating spirit / ember / celestial golden motes
    this.buildAmbientParticles(config.index);
  }

  private clearWorld(): void {
    if (this.splatBackdrop) {
      this.worldGroup.remove(this.splatBackdrop);
      this.splatBackdrop.dispose();
      this.splatBackdrop = null;
    }
    while (this.worldGroup.children.length > 0) {
      const ch = this.worldGroup.children[0];
      this.worldGroup.remove(ch);
    }
    this.peaches = [];
    this.fireWallGroup = new THREE.Group();
    this.fireWallActive = false;
    this.waterfallMesh = null;
    this.ambientMotes = null;
    this.petals = null;
  }

  private makeGroundTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = '#41523f';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const g = 40 + Math.random() * 55;
      x.fillStyle = `rgba(${g - 12},${g},${g - 22},${0.25 + Math.random() * 0.35})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 140; i++) {
      x.strokeStyle = `rgba(22,38,24,${0.35 + Math.random() * 0.4})`;
      x.lineWidth = 1;
      const bx = Math.random() * 512, by = Math.random() * 512;
      x.beginPath(); x.moveTo(bx, by);
      x.quadraticCurveTo(bx + 3, by - 10 - Math.random() * 12, bx + (Math.random() - 0.5) * 12, by - 18);
      x.stroke();
    }
    for (let i = 0; i < 160; i++) {
      x.fillStyle = `rgba(92,92,80,${0.25 + Math.random() * 0.4})`;
      x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(14, 14);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private makeArenaTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = '#353a34'; x.fillRect(0, 0, 512, 512);
    const n = 8, cell = 512 / n;
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
      const v = 48 + Math.floor(Math.random() * 22);
      x.fillStyle = `rgb(${v},${v + 3},${v - 2})`;
      x.fillRect(tx * cell + 2, ty * cell + 2, cell - 4, cell - 4);
      x.strokeStyle = 'rgba(12,16,13,.55)'; x.lineWidth = 2; x.strokeRect(tx * cell + 2, ty * cell + 2, cell - 4, cell - 4);
    }
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(16,20,16,${.2 + Math.random() * .35})`; x.lineWidth = 1 + Math.random() * 2;
      x.beginPath(); let px = Math.random() * 512, py = Math.random() * 512; x.moveTo(px, py);
      for (let j = 0; j < 4; j++) { px += (Math.random() - .5) * 55; py += (Math.random() - .5) * 55; x.lineTo(px, py); }
      x.stroke();
    }
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(44,72,40,${.12 + Math.random() * .25})`;
      x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 12, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  private buildSculptedTerrain(config: ChapterConfig): void {
    const geo = new THREE.PlaneGeometry(96, 96, 72, 72);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const colA = new THREE.Color(config.groundColorA);
    const colB = new THREE.Color(config.groundColorB);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.getTerrainHeight(x, z);
      pos.setY(i, y);

      const mix = THREE.MathUtils.clamp((y + 0.5) / 3.2 + Math.sin(x * 0.25) * 0.15, 0, 1);
      tmp.copy(colA).lerp(colB, mix);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const groundTex = this.makeGroundTexture();
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        bumpMap: groundTex,
        bumpScale: 0.2,
        vertexColors: true,
        roughness: config.index === 2 ? 0.45 : 0.9,
        metalness: config.index === 2 ? 0.2 : 0.02,
      })
    );
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);

    // Engraved Dragon/Bagua Boss Arena Disc at z = -15
    const arenaTex = this.makeArenaTexture();
    const arenaDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(11.5, 12.2, 0.28, 48),
      new THREE.MeshStandardMaterial({
        map: arenaTex, bumpMap: arenaTex, bumpScale: 0.1,
        color: config.index === 2 ? 0xd4b46a : config.index === 1 ? 0xa8593a : 0x9aa69a,
        roughness: 0.62, metalness: 0.12,
      })
    );
    arenaDisc.position.set(0, this.getTerrainHeight(0, -15) + 0.02, -15);
    arenaDisc.receiveShadow = true;
    this.worldGroup.add(arenaDisc);

    // Stone processional path from spawn to the boss altar.
    if (config.index === 0) {
      const pathTex = arenaTex.clone();
      pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
      pathTex.repeat.set(2, 8);
      pathTex.needsUpdate = true;
      const pathGeo = new THREE.PlaneGeometry(7, 32, 4, 24);
      pathGeo.rotateX(-Math.PI / 2);
      const pp = pathGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) {
        const px = pp.getX(i), pz = pp.getZ(i) + 1;
        pp.setY(i, this.getTerrainHeight(px, pz) + 0.065);
      }
      pp.needsUpdate = true;
      pathGeo.computeVertexNormals();
      const path = new THREE.Mesh(
        pathGeo,
        new THREE.MeshStandardMaterial({
          map: pathTex, bumpMap: pathTex, bumpScale: 0.08,
          color: 0xc2c9b8, roughness: 0.64, metalness: 0.07,
        })
      );
      path.position.set(0, 0, 1);
      path.receiveShadow = true;
      this.worldGroup.add(path);
    }

    const runeRing = new THREE.Mesh(
      new THREE.RingGeometry(10.6, 11.1, 64),
      new THREE.MeshBasicMaterial({
        color: config.index === 1 ? 0xff6229 : 0xffcf66,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      })
    );
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.set(0, arenaDisc.position.y + 0.16, -15);
    this.worldGroup.add(runeRing);

    // Instanced grass tufts outside the arena: cheap, one draw call.
    if (config.index === 0) {
      const bladeGeo = new THREE.ConeGeometry(0.035, 0.5, 4);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2f5a36, roughness: 0.95, metalness: 0 });
      const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, 1800);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 1800; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 11.5 + Math.random() * 13;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        dummy.position.set(x, this.getTerrainHeight(x, z) + 0.25, z);
        dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25);
        dummy.scale.set(1, 0.7 + Math.random() * 1.3, 1);
        dummy.updateMatrix();
        grass.setMatrixAt(i, dummy.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(grass);
    }
  }

  private loadSplatVista(url: string): void {
    try {
      const splat = new SplatMesh({ url });
      // Aholo SpatialGen .spz uses Z-up -> rotate -90 deg around X
      splat.rotation.x = -Math.PI / 2;
      splat.scale.setScalar(8.5);
      splat.position.set(0, 8.5, -18);
      this.splatBackdrop = splat;
      this.worldGroup.add(splat);
    } catch {
      // Splat vista optional if still streaming
    }
  }

  private async loadLandmark(config: ChapterConfig, loader: GLTFLoader): Promise<void> {
    const fallbacks = [config.landmarkModel, 'models/fusang-tree.glb', 'models/nantian-gate.glb'];
    for (const url of fallbacks) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        const gltf = await loader.loadAsync(url);
        if (this.currentChapterIdx !== config.index) return;

        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);

        const targetHeight = config.index === 2 ? 15.5 : 12.5;
        const s = targetHeight / Math.max(0.01, sz.y);
        m.scale.setScalar(s);
        const [lx, lz] = config.landmarkPos;
        const ly = this.getTerrainHeight(lx, lz);
        m.position.set(lx - ctr.x * s, ly - box.min.y * s, lz - ctr.z * s);
        m.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.worldGroup.add(m);
        return;
      } catch {
        // try next fallback
      }
    }
  }

  private buildHuaguoshanBiome(): void {
    // Cascading Water Curtain Cave Waterfall (水帘洞飞瀑) behind the landmark
    const wfMat = new THREE.MeshBasicMaterial({
      color: 0x9ceeff,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
    });
    this.waterfallMesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 18, 8, 16), wfMat);
    this.waterfallMesh.position.set(0, 8.2, -29);
    this.worldGroup.add(this.waterfallMesh);

    // Immortal Peach Blossom Trees & mossy cliffs flanking the path
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d3427, roughness: 0.85 });
    const blossomMat = new THREE.MeshStandardMaterial({
      color: 0xff9ebb,
      emissive: 0x802b47,
      emissiveIntensity: 0.32,
      roughness: 0.6,
    });
    const treeCoords: Array<[number, number]> = [];
    for (const [tx, tz] of treeCoords) {
      const ty = this.getTerrainHeight(tx, tz);
      const g = new THREE.Group();
      g.position.set(tx, ty, tz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, 4.2, 8), trunkMat);
      trunk.position.y = 2.1;
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.35, 1), blossomMat);
      crown.position.y = 4.5;
      crown.scale.y = 0.72;
      trunk.castShadow = true;
      g.add(trunk, crown);
      this.worldGroup.add(g);
    }

    // Dark mossy basalt ring closing the arena (keeps the fight readable).
    const basalt = new THREE.MeshStandardMaterial({ color: 0x14201d, roughness: 0.92, metalness: 0.08 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      if (Math.sin(a) < -0.35) continue; // keep the boss approach clear
      const r = 20 + (i % 3) * 1.6;
      const h = 1.8 + (i % 5) * 0.7;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(1.5 + (i % 4) * 0.3, h, 6), basalt);
      rock.position.set(Math.cos(a) * r, this.getTerrainHeight(Math.cos(a) * r, Math.sin(a) * r) + h * 0.42, Math.sin(a) * r);
      rock.rotation.y = a;
      rock.castShadow = true;
      this.worldGroup.add(rock);
    }

    // Six stone lanterns: gold embers around the boss plaza.
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1d, roughness: 0.8, metalness: 0.2 });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      if (Math.sin(a) > 0.3) continue; // keep the spawn-side camera clear
      const r = 16.2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.getTerrainHeight(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.8, 8), lanternMat);
      post.position.set(x, y + 0.9, z);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.32, 6), lanternMat);
      cap.position.set(x, y + 1.95, z);
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), emberMat);
      ember.position.set(x, y + 1.7, z);
      const pl = new THREE.PointLight(0xff9b4a, 2.2, 5, 1.8);
      pl.position.set(x, y + 1.75, z);
      this.worldGroup.add(post, cap, ember, pl);
    }

    // Red war banners framing the approach.
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x7a1c18, roughness: 0.8, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const x = side * (11 + i * 3.2);
        const z = 2 - i * 9;
        const y = this.getTerrainHeight(x, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6), lanternMat);
        pole.position.set(x, y + 2.6, z);
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 3.1), bannerMat);
        cloth.position.set(x + side * 0.62, y + 3.5, z);
        cloth.rotation.y = side * Math.PI / 2;
        this.worldGroup.add(pole, cloth);
      }
    }

    // Pale moon behind the waterfall / pillar.
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.72 })
    );
    moon.position.set(0, 15, -42);
    this.worldGroup.add(moon);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(8.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.position.set(0, 15, -42.1);
    this.worldGroup.add(halo);
    this.buildHuaguoshanDetails();
  }

  private buildHuaguoshanDetails(): void {
    const dummy = new THREE.Object3D();
    const addInstanced = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      count: number,
      place: (i: number) => void
    ) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      for (let i = 0; i < count; i++) { place(i); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }
      mesh.instanceMatrix.needsUpdate = true;
      this.worldGroup.add(mesh);
    };

    addInstanced(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x1d3a28, roughness: 0.95 }), 30, () => {
      const a = Math.random() * Math.PI * 2, r = 19 + Math.random() * 9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, this.getTerrainHeight(x, z) + 0.35, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(0.35 + Math.random() * 0.35, 0.3 + Math.random() * 0.35, 0.35 + Math.random() * 0.35);
    });

    addInstanced(new THREE.DodecahedronGeometry(0.65, 0), new THREE.MeshStandardMaterial({ color: 0x394039, roughness: 0.82, metalness: 0.08 }), 18, () => {
      const a = Math.random() * Math.PI * 2, r = 19 + Math.random() * 9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, this.getTerrainHeight(x, z) + 0.25, z);
      dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
      dummy.scale.set(0.3 + Math.random() * 0.35, 0.25 + Math.random() * 0.35, 0.3 + Math.random() * 0.35);
    });

    addInstanced(new THREE.SphereGeometry(0.055, 6, 6), new THREE.MeshStandardMaterial({ color: 0xe58aa8, emissive: 0x5a1a2c, emissiveIntensity: 0.35, roughness: 0.6 }), 340, () => {
      const a = Math.random() * Math.PI * 2, r = 11.6 + Math.random() * 13;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, this.getTerrainHeight(x, z) + 0.18, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.setScalar(0.7 + Math.random() * 0.8);
    });

    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x4e6b35, roughness: 0.8 });
    const bambooLeafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a31, roughness: 0.9 });
    const bambooPositions: Array<[number, number, number]> = [];
    for (let i = 0; i < 48; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 9;
      bambooPositions.push([Math.cos(a) * r, Math.sin(a) * r, 3.2 + Math.random() * 2.2]);
    }
    addInstanced(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 5), bambooMat, 48, (i) => {
      const [x, z, h] = bambooPositions[i];
      dummy.position.set(x, this.getTerrainHeight(x, z) + h * 0.5, z);
      dummy.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * Math.PI, (Math.random() - 0.5) * 0.12);
      dummy.scale.set(1, h / 4.2, 1);
    });
    addInstanced(new THREE.ConeGeometry(0.55, 1.4, 5), bambooLeafMat, 48, (i) => {
      const [x, z, h] = bambooPositions[i];
      dummy.position.set(x, this.getTerrainHeight(x, z) + h + 0.4, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(0.55, 0.5 + Math.random() * 0.35, 0.55);
    });

    addInstanced(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xff9fbd, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 260, () => {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 16;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, this.getTerrainHeight(x, z) + 0.04, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
      dummy.scale.setScalar(0.7 + Math.random() * 1.4);
    });
  }

  private async buildFlamingMountainBiome(hasBarrier: boolean, loader: GLTFLoader): Promise<void> {
    // Jagged basalt magma pillars along the canyon
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x291410,
      emissive: 0x6e1f0d,
      emissiveIntensity: 0.35,
      roughness: 0.75,
    });
    const crags: Array<[number, number, number]> = [
      [-15, 8, 6.5],
      [15, 8, 7.0],
      [-17, -8, 8.5],
      [17, -8, 8.2],
      [-14, -22, 9.5],
      [14, -22, 9.5],
    ];
    for (const [rx, rz, h] of crags) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(2.4, h, 6), rockMat);
      mesh.position.set(rx, this.getTerrainHeight(rx, rz) + h * 0.45, rz);
      mesh.castShadow = true;
      this.worldGroup.add(mesh);
    }

    // Load Aholo Plantain Fan relic pedestal near spawn as visual lore cue
    try {
      const head = await fetch('models/plantain-fan.glb', { method: 'HEAD' });
      if (head.ok && !(head.headers.get('content-type') || '').includes('text/html')) {
        const gltf = await loader.loadAsync('models/plantain-fan.glb');
        const fan = gltf.scene;
        fan.scale.setScalar(2.2);
        fan.position.set(-4.5, this.getTerrainHeight(-4.5, 11) + 1.4, 11);
        this.worldGroup.add(fan);
      }
    } catch {
      // optional prop
    }

    if (hasBarrier) {
      this.fireWallActive = true;
      this.fireWallGroup.position.set(0, this.getTerrainHeight(0, this.fireWallZ), this.fireWallZ);
      for (let i = -6; i <= 6; i++) {
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(1.15, 5.2 + (Math.abs(i) % 2) * 1.1, 10),
          new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? 0xff551a : 0xffaa22,
            transparent: true,
            opacity: 0.84,
          })
        );
        flame.position.set(i * 2.1, 2.4, 0);
        this.fireWallGroup.add(flame);
      }
      const fireLight = new THREE.PointLight(0xff5522, 5, 22);
      fireLight.position.set(0, 3, 0);
      this.fireWallGroup.add(fireLight);
      this.worldGroup.add(this.fireWallGroup);
    }
  }

  private buildCelestialGateBiome(): void {
    // Golden Jade Dragon Pillars & Celestial Cloud Sea flanking South Heaven Gate
    const jadeMat = new THREE.MeshStandardMaterial({
      color: 0xeee4cc,
      metalness: 0.45,
      roughness: 0.25,
    });
    const goldCapMat = new THREE.MeshStandardMaterial({
      color: 0xffcf66,
      emissive: 0x996b18,
      emissiveIntensity: 0.4,
      metalness: 0.85,
      roughness: 0.2,
    });

    for (const z of [8, -4, -16]) {
      for (const side of [-1, 1]) {
        const x = side * 14.5;
        const y = this.getTerrainHeight(x, z);
        const col = new THREE.Group();
        col.position.set(x, y, z);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 8.8, 16), jadeMat);
        shaft.position.y = 4.4;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.78, 0.7, 16), goldCapMat);
        cap.position.y = 9.0;
        shaft.castShadow = true;
        col.add(shaft, cap);
        this.worldGroup.add(col);
      }
    }

    // Drifting golden cloud banks around the perimeter
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xfff0cc,
      emissive: 0x5c4722,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.72,
    });
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3.8, 14, 14), cloudMat);
      puff.scale.set(1.6, 0.42, 1.2);
      puff.position.set(Math.cos(ang) * 26, 0.6, -6 + Math.sin(ang) * 26);
      this.worldGroup.add(puff);
    }
  }

  private spawnPeaches(config: ChapterConfig): void {
    for (const [px, pz] of config.peaches) {
      const g = new THREE.Group();
      const py = this.getTerrainHeight(px, pz) + 1.05;
      g.position.set(px, py, pz);

      const peach = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0xff6b8b,
          emissive: 0xd9385a,
          emissiveIntensity: 0.55,
          roughness: 0.3,
        })
      );
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.72, 24),
        new THREE.MeshBasicMaterial({ color: 0xffe082, side: THREE.DoubleSide })
      );
      halo.rotation.x = Math.PI / 2;
      g.add(peach, halo);
      this.worldGroup.add(g);
      this.peaches.push({ mesh: g, collected: false });
    }
  }

  public updateAmbient(dt: number, time: number): void {
    if (this.ambientMotes) {
      const a = this.ambientMotes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) + dt * (0.08 + (i % 5) * 0.02);
        if (y > 15) y = 0.5;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    }
    if (this.petals) {
      const a = this.petals.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * (0.32 + (i % 4) * 0.08);
        let x = a.getX(i) + Math.sin(time * 0.8 + i) * dt * 0.35;
        if (y < 0.2) { y = 13; x = (Math.random() - 0.5) * 34; }
        a.setX(i, x); a.setY(i, y);
      }
      a.needsUpdate = true;
    }
  }

  private buildAmbientParticles(chapterIdx: number): void {
    const count = 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 64;
      positions[i * 3 + 1] = 0.6 + Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 64;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = chapterIdx === 1 ? 0xff6d2e : chapterIdx === 2 ? 0xffe28a : 0xa8ffdf;
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.22,
      transparent: true,
      opacity: 0.78,
    });
    this.ambientMotes = new THREE.Points(geo, mat);
    this.worldGroup.add(this.ambientMotes);

    if (chapterIdx === 0) {
      const pn = 180;
      const pp = new Float32Array(pn * 3);
      for (let i = 0; i < pn; i++) {
        pp[i * 3] = (Math.random() - 0.5) * 34;
        pp[i * 3 + 1] = 1 + Math.random() * 13;
        pp[i * 3 + 2] = (Math.random() - 0.5) * 34;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
      this.petals = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff9fbd, size: 0.16, transparent: true, opacity: 0.78, depthWrite: false }));
      this.worldGroup.add(this.petals);
    }
  }

  public extinguishFireWall(): boolean {
    if (!this.fireWallActive) return false;
    this.fireWallActive = false;
    this.worldGroup.remove(this.fireWallGroup);
    return true;
  }

  public update(dt: number, playerPos: THREE.Vector3): { healed: boolean; fireBurn: boolean } {
    let healed = false;
    let fireBurn = false;
    const t = performance.now() * 0.001;

    // Animate waterfall shimmer
    if (this.waterfallMesh) {
      (this.waterfallMesh.material as THREE.MeshBasicMaterial).opacity =
        0.38 + Math.sin(t * 6) * 0.1;
    }

    // Animate Three-Samadhi Fire Wall & block player until extinguished by [3] Plantain Fan!
    if (this.fireWallActive) {
      this.fireWallGroup.children.forEach((ch, idx) => {
        if ((ch as THREE.Mesh).isMesh) {
          ch.scale.y = 0.85 + Math.abs(Math.sin(t * 7 + idx)) * 0.42;
        }
      });
      if (Math.abs(playerPos.z - this.fireWallZ) < 1.8 && Math.abs(playerPos.x) < 15) {
        playerPos.z = this.fireWallZ + 2.1;
        fireBurn = true;
      }
    }

    // Peach pickup check
    for (const p of this.peaches) {
      if (p.collected) continue;
      p.mesh.rotation.y += dt * 1.8;
      p.mesh.position.y += Math.sin(t * 3.2) * 0.004;
      if (p.mesh.position.distanceTo(playerPos) < 1.85) {
        p.collected = true;
        this.worldGroup.remove(p.mesh);
        healed = true;
      }
    }

    // Drift ambient particles upward
    if (this.ambientMotes) {
      const attr = this.ambientMotes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let y = attr.getY(i) + dt * (this.currentChapterIdx === 1 ? 1.8 : 0.65);
        if (y > 15) y = 0.5;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    }

    return { healed, fireBurn };
  }
}
