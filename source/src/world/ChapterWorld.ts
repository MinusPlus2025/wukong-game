import { disposeObject } from '../utils/disposeObject';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
  public colliders: Array<{ x: number; z: number; r: number; h: number }> = [];
  private landmarkMixer: THREE.AnimationMixer | null = null;
  private dragonUniforms: Array<{ value: number }> = [];
  private dragonAttackUniforms: Array<{ value: number }> = [];
  private dragonModel: THREE.Object3D | null = null;
  private dragonBaseY = 0;
  public fireWallActive = false;
  public fireWallZ = -6.5;

  private currentChapterIdx = 0;
  private fireWallGroup = new THREE.Group();
  private fireWallParticles: THREE.Points | null = null;
  private fireWallGlow: THREE.Mesh | null = null;
  private fireWallPlane: THREE.Mesh | null = null;
  private fireWallFlames: THREE.Sprite[] = [];
  private ambientMotes: THREE.Points | null = null;
  private petals: THREE.Points | null = null;
  private waterfallMesh: THREE.Mesh | null = null;
  private skyDome: THREE.Mesh | null = null;
  private fireTime = { value: 0 };
  private particleTexture: THREE.CanvasTexture | null = null;
  private generation = 0;
  private propTemplates = new Map<string, Promise<GLTF>>();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.worldGroup);
  }

  public getTerrainHeight(x: number, z: number): number {
    const r = Math.hypot(x, z + 6);
    // Flat boss & combat arena core with gentle natural mountain rim outside radius 18
    const rim = Math.max(0, r - 18) * 0.16;
    const undulation =
      Math.sin(x * 0.14) * Math.cos(z * 0.14) * (this.currentChapterIdx === 2 ? 0.12 : 0.32);
    return undulation * THREE.MathUtils.smoothstep(r, 18, 28) + rim;
  }

  public async loadChapter(config: ChapterConfig, loader: GLTFLoader): Promise<void> {
    this.currentChapterIdx = config.index;
    this.generation += 1;
    this.clearWorld();

    // Update sky & atmospheric fog
    this.scene.background = new THREE.Color(config.skyColor);
    this.scene.fog = new THREE.FogExp2(config.fogColor, config.index === 1 ? 0.032 : config.index === 2 ? 0.024 : 0.028);

    // 1. Sculpted vertex-colored 3D terrain mesh + ancient stone boss plaza
    this.buildSculptedTerrain(config);

    this.buildSkyDome(config);

    // 2. Load Aholo SpatialGen .spz 3DGS world vista in background

    // 3. Load monumental Aholo Lux3D landmark GLB (Jingu Bang Pillar / Zhulong / Nantian Gate)
    this.loadLandmark(config, loader);

    // 4. Chapter-specific interactive biome setpieces
    if (config.index === 0) {
      this.buildHuaguoshanBiome();
      void this.loadHuaguoshanProps(loader, true);
      void this.loadHuaguoshanProps(loader, false);
    } else if (config.index === 1) {
      this.buildFlamingMountainBiome(Boolean(config.hasFireBarrier), loader);
      void this.loadExtraProps(config, loader, true);
      void this.loadExtraProps(config, loader, false);
    } else {
      this.buildCelestialGateBiome();
      void this.loadExtraProps(config, loader, true);
      void this.loadExtraProps(config, loader, false);
    }

    // Remove orphan cloud-puff spheres left by earlier scene passes.
    for (const ch of [...this.worldGroup.children]) {
      const mesh = ch as THREE.Mesh;
      if (mesh.isMesh && (mesh.geometry as THREE.BufferGeometry)?.type === 'SphereGeometry') {
        const wp = mesh.getWorldPosition(new THREE.Vector3());
        if (Math.hypot(wp.x, wp.z) > 18) { this.worldGroup.remove(ch); disposeObject(ch); }
      }
    }

    // 5. Collectible Immortal Peaches (千年蟠桃 — heals +90 HP & +35 Mana)
    this.spawnPeaches(config);

    // 6. Floating spirit / ember / celestial golden motes
    this.buildAmbientParticles(config.index);
  }

  private disposeSceneObject(root: THREE.Object3D, mats: Set<THREE.Material>, geos: Set<THREE.BufferGeometry>, texs: Set<THREE.Texture>): void {
    disposeObject(root, mats, geos, texs);
  }

  private clearWorld(): void {
    this.propTemplates.clear();
    const mats = new Set<THREE.Material>();
    const geos = new Set<THREE.BufferGeometry>();
    const texs = new Set<THREE.Texture>();
    while (this.worldGroup.children.length > 0) {
      const ch = this.worldGroup.children[0];
      this.worldGroup.remove(ch);
      this.disposeSceneObject(ch, mats, geos, texs);
    }
    this.particleTexture = null;
    this.peaches = [];
    this.colliders = [];
    this.landmarkMixer?.stopAllAction();
    if (this.landmarkMixer) this.landmarkMixer.uncacheRoot(this.landmarkMixer.getRoot());
    this.landmarkMixer = null;
    this.dragonUniforms = [];
    this.dragonAttackUniforms = [];
    this.dragonModel = null;
    this.fireWallGroup = new THREE.Group();
    this.fireWallParticles = null;
    this.fireWallGlow = null;
    this.fireWallPlane = null;
    this.fireWallFlames = [];
    this.fireWallActive = false;
    this.waterfallMesh = null;
    this.skyDome = null;
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

  private buildStonePaving(palace: boolean): void {
    const pos:number[]=[], uv:number[]=[], indices:number[]=[], colors:number[]=[];
    const cols=palace?14:4, rows=palace?22:16;
    const width=palace?2.25:1.55, depth=palace?1.82:1.46;
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++){
      const z=17-row*depth;
      const x=(col-(cols-1)/2+(row%2)*0.28)*width;
      const noise=Math.sin(row*127.1+col*311.7)*43758.5453;
      const vary=noise-Math.floor(noise), w=width/2-.014, d=depth/2-.016;
      const chip=.035+vary*(palace?.045:.15);
      const corners=[[-w+chip,-d],[w-chip,-d],[w,-d+chip],[w,d-chip],[w-chip,d],[-w+chip,d],[-w,d-chip],[-w,-d+chip]];
      const base=pos.length/3, tone=(palace?.83:.63)+vary*.15;
      for(let ring=0;ring<3;ring++) for(const [cx,cz] of corners){
        const px=x+cx*(ring===2?.978:1), pz=z+cz*(ring===2?.978:1);
        pos.push(px,this.getTerrainHeight(px,pz)+[-.035,.048,.074][ring]+vary*.008,pz);
        uv.push(px*.34+vary*2,pz*.34+vary); colors.push(tone,tone*(palace?.99:.97),tone*(palace?.96:.91));
      }
      for(let r=0;r<2;r++)for(let i=0;i<8;i++){
        const a=base+r*8+i,b=base+r*8+(i+1)%8;indices.push(a,a+8,b,b,a+8,b+8);
      }
      for(let i=1;i<7;i++)indices.push(base+16,base+17+i,base+16+i);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const loader=new THREE.TextureLoader(), folder=palace?'marble':'volcanic';
    const texture=(slot:string)=>{const t=loader.load('textures/'+folder+'/'+slot+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;};
    const map=texture('diff');map.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map,normalMap:texture('nor'),roughnessMap:texture('rough'),vertexColors:true,roughness:palace?.68:.88}));
    mesh.receiveShadow=true;this.worldGroup.add(mesh);
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

    const terrainMat = new THREE.MeshStandardMaterial({
      bumpScale: 0.2,
      vertexColors: true,
      roughness: config.index === 2 ? 0.45 : 0.9,
      metalness: config.index === 2 ? 0.2 : 0.02,
    });
    if (config.index <= 2) {
      const texLoader = new THREE.TextureLoader();
      const folder = config.index === 1 ? 'volcanic' : config.index === 0 ? 'forest' : 'marble';
      const repeat = config.index === 1 ? 7 : config.index === 0 ? 11 : 6;
      const loadTex = (name: string, srgb = false) => {
        const t = texLoader.load(`textures/${folder}/${name}.jpg`, () => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(repeat, repeat);
          t.anisotropy = 8;
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          terrainMat.needsUpdate = true;
        });
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        return t;
      };
      terrainMat.map = loadTex('diff', true);
      terrainMat.normalMap = loadTex('nor');
      terrainMat.roughnessMap = loadTex('rough');
      terrainMat.bumpMap = loadTex('disp');
      terrainMat.bumpScale = config.index === 2 ? 0.07 : 0.1;
      terrainMat.vertexColors = false;
      terrainMat.color.setHex(config.index === 0 ? 0x8fa392 : config.index === 2 ? 0x8fa6b8 : 0xffffff);
      terrainMat.roughness = config.index === 2 ? 0.5 : 0.84;
      terrainMat.metalness = config.index === 2 ? 0.12 : 0.02;
    }
    const terrain = new THREE.Mesh(geo, terrainMat);
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

    if (config.index !== 1) this.buildStonePaving(config.index === 2);

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

    if (config.index === 0) {
      // Taper and bend the leaves in three dimensions; the stone walk stays clear.
      const vertices: number[] = [], leafColors: number[] = [];
      for (let blade = 0; blade < 9; blade++) {
        const angle = blade * 2.4, x = Math.cos(angle), z = Math.sin(angle);
        const h = 0.17 + (blade % 4) * 0.055;
        const base = new THREE.Vector3(x * 0.07, 0, z * 0.07);
        const mid = new THREE.Vector3(x * 0.13, h * 0.7, z * 0.13);
        const tip = new THREE.Vector3(x * 0.24, h, z * 0.24);
        const w = new THREE.Vector3(-z * 0.019, 0, x * 0.019);
        for (const [pt, offset, light] of [[base,-1,0.3],[base,1,0.3],[mid,0.6,0.8],[base,-1,0.3],[mid,0.6,0.8],[mid,-0.6,0.8],[mid,-0.6,0.8],[mid,0.6,0.8],[tip,0,1]] as const) {
          vertices.push(pt.x+w.x*offset,pt.y,pt.z+w.z*offset);
          leafColors.push(0.105*light,0.205*light,0.058*light);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(leafColors,3));
      geo.computeVertexNormals();
      const grass = new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.86}),760);
      const dummy = new THREE.Object3D();
      for(let i=0;i<grass.count;i++){
        const a=i*2.39996, r=8+17*Math.sqrt(((i*137)%761)/761);
        let x=Math.cos(a)*r; const z=Math.sin(a)*r;
        if(Math.abs(x)<3.65) x+=(x<0?-1:1)*3.75;
        dummy.position.set(x,this.getTerrainHeight(x,z)-0.015,z);
        dummy.rotation.y=a;dummy.scale.setScalar(0.85+0.5*((i*23)%41)/41);dummy.updateMatrix();
        grass.setMatrixAt(i,dummy.matrix);
      }
      this.worldGroup.add(grass);
    }
  }

  private buildSkyDome(config: ChapterConfig): void {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const x = c.getContext('2d')!;
    const top = config.index === 1 ? '#080203' : config.index === 2 ? '#070b18' : '#030607';
    const horizon = config.index === 1 ? '#b73712' : config.index === 2 ? '#477da0' : '#1d5145';
    const bottom = config.index === 1 ? '#1b0604' : config.index === 2 ? '#101626' : '#06100d';
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, top); g.addColorStop(0.52, top); g.addColorStop(0.64, horizon); g.addColorStop(0.72, bottom); g.addColorStop(1, bottom);
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 110; i++) {
      const yy = 90 + Math.random() * 230;
      x.fillStyle = config.index === 1 ? `rgba(255,140,45,${0.06 + Math.random() * 0.1})` : `rgba(160,220,210,${0.04 + Math.random() * 0.1})`;
      x.beginPath(); x.ellipse(Math.random() * 1024, yy, 60 + Math.random() * 160, 3 + Math.random() * 12, 0, 0, Math.PI * 2); x.fill();
    }
    if (config.index === 1) {
      for (let i = 0; i < 80; i++) {
        x.fillStyle = `rgba(255,110,30,${0.12 + Math.random() * 0.25})`;
        x.fillRect(Math.random() * 1024, 300 + Math.random() * 130, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
    } else {
      for (let i = 0; i < 90; i++) {
        x.fillStyle = `rgba(220,245,240,${0.25 + Math.random() * 0.5})`;
        x.fillRect(Math.random() * 1024, Math.random() * 260, 1, 1 + Math.random() * 2);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.position.set(0, 0, -8);
    this.skyDome = dome;
    this.worldGroup.add(dome);
  }

  private applyDragonShader(model: THREE.Object3D): void {
    model.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mats = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (!mat || !mat.isMeshStandardMaterial) continue;
        const u = { value: 0 };
        const atk = { value: 0 };
        this.dragonUniforms.push(u);
        this.dragonAttackUniforms.push(atk);
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

  private applyTextureQuality(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mats = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (!mat) continue;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
          const tex = (mat as unknown as Record<string, THREE.Texture | null>)[key];
          if (tex) { tex.anisotropy = 8; tex.needsUpdate = true; }
        }
        mat.needsUpdate = true;
      }
    });
  }

  private async loadProp(url: string, loader: GLTFLoader): Promise<THREE.Group> {
    // Chapter-scoped template: repeated stones/lanterns share one decode and GPU resources.
    let pending = this.propTemplates.get(url);
    if (!pending) { pending = loader.loadAsync(url); this.propTemplates.set(url, pending); }
    const gltf = await pending;
    return gltf.scene.clone(true);
  }

  private async loadHuaguoshanProps(loader: GLTFLoader, priorityOnly: boolean): Promise<void> {
    const gen = this.generation;
    const defs: Array<{ file: string; x: number; z: number; h: number }> = [
      { file: 'cliff-rock', x: -10, z: -28, h: 6.0 },
      { file: 'cliff-rock', x: 11, z: -28, h: 6.0 },
      { file: 'cliff-rock', x: -19, z: -22, h: 5.2 },
      { file: 'moss-rock', x: -14, z: -3, h: 2.8 },
      { file: 'moss-rock', x: 14, z: -5, h: 2.2 },
      { file: 'stone-lantern', x: -6, z: 2, h: 1.65 },
      { file: 'stone-lantern', x: 6, z: -2, h: 1.65 },
      { file: 'guardian-statue', x: -8.5, z: -10.5, h: 3.4 },
      { file: 'guardian-statue', x: 8.5, z: -10.5, h: 3.4 },
      { file: 'peach-branch', x: 12, z: 4, h: 4.0 },
      { file: 'peach-branch', x: -12, z: 5, h: 3.6 },
      { file: 'mountain-gate', x: 0, z: -30, h: 9.5 },
      { file: 'war-drum', x: 9, z: 6, h: 2.2 },
      { file: 'shrub-01', x: -10, z: -2, h: 1.5 },
      { file: 'shrub-01', x: 10, z: -4, h: 1.4 },
      { file: 'shrub-01', x: -4, z: 7, h: 1.3 },
      { file: 'tree-stump-01', x: -13, z: 4, h: 1.2 },
      { file: 'tree-stump-01', x: 13, z: 3, h: 1.2 },
      { file: 'red-banner', x: -7, z: -6, h: 4.0 },
      { file: 'red-banner', x: 7, z: -6, h: 4.0 },
      { file: 'incense-burner', x: -6.5, z: 6, h: 1.2 },
      { file: 'hanging-lantern', x: 6.5, z: 6, h: 0.9 },
      { file: 'cliff-rock', x: -23, z: -12, h: 6.0 },
      { file: 'peach-tree-single', x: -18, z: 10, h: 7.2 },
    ];
    const priority = new Set(['stone-lantern', 'peach-branch']);
    const chosen = defs.filter((d) => priorityOnly ? priority.has(d.file) : !priority.has(d.file));
    for (const d of chosen) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (gen !== this.generation) return;
      try {
        const gltf = { scene: await this.loadProp(`models/live-opt/${d.file}.glb`, loader) };
        if (this.generation !== gen || this.currentChapterIdx !== 0) { disposeObject(gltf.scene); return; }
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const size = new THREE.Vector3(); const ctr = new THREE.Vector3();
        box.getSize(size); box.getCenter(ctr);
        const s = d.h / Math.max(0.01, size.y);
        if (!Number.isFinite(s) || s > 1000) { disposeObject(m); return; }
        m.scale.setScalar(s);
        const y = this.getTerrainHeight(d.x, d.z);
        m.position.set(d.x - ctr.x * s, y - box.min.y * s - (d.file === 'moss-rock' ? d.h * 0.16 : 0), d.z - ctr.z * s);
        m.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
        });
        this.applyTextureQuality(m);
        this.worldGroup.add(m);
        const radius = Math.max(size.x, size.z) * s * 0.42;
        this.colliders.push({ x: d.x, z: d.z, r: Math.max(0.55, radius), h: d.h });
      } catch {
        // optional prop
      }
    }
  }

  public resolveCollision(pos: THREE.Vector3, radius = 0.45): void {
    for (const c of this.colliders) {
      if (pos.y > c.h - 0.05) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const minDist = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist * minDist) {
        const d = Math.sqrt(d2) || 0.001;
        pos.x = c.x + (dx / d) * minDist;
        pos.z = c.z + (dz / d) * minDist;
      }
    }
  }

  private async loadExtraProps(config: ChapterConfig, loader: GLTFLoader, priorityOnly = true): Promise<void> {
    const gen = this.generation;
    const defsByChapter = config.index === 1
      ? [
          { file: 'cliff-rock', x: -17, z: 7, h: 5.2 },
          { file: 'war-drum', x: 9, z: 5, h: 2.2 },
          { file: 'red-banner', x: -7, z: -5, h: 4.0 },
          { file: 'red-banner', x: 7, z: -5, h: 4.0 },
          { file: 'stone-pagoda', x: 18, z: -8, h: 4.0 },
          { file: 'fire-brazier', x: 8, z: 6, h: 2.6 },
          { file: 'fire-brazier', x: -8, z: 6, h: 2.6 },
          { file: 'obsidian-arch', x: -18, z: -14, h: 6.5 },
          { file: 'tree-stump-01', x: -11, z: -8, h: 2.2 },
          { file: 'tree-stump-01', x: 11, z: -8, h: 2.2 },
          { file: 'stone-fire-pit', x: -6, z: 8, h: 1.7 },
          { file: 'stone-fire-pit', x: 6, z: 8, h: 1.7 },
          { file: 'cliff-rock', x: -15, z: -2, h: 5.5 },
          { file: 'cliff-rock', x: 15, z: -2, h: 5.2 },
        ]
      : [
          { file: 'stone-lantern', x: -6, z: 3, h: 3.0 },
          { file: 'stone-lantern', x: 6, z: 3, h: 3.0 },
          { file: 'guardian-statue', x: -9, z: -10, h: 3.4 },
          { file: 'guardian-statue', x: 9, z: -10, h: 3.4 },
              { file: 'moon-gate', x: 20, z: -12, h: 5.5 },
          { file: 'hanging-lantern', x: 6.5, z: 6, h: 0.9 },
          { file: 'bronze-ding', x: -7, z: 6, h: 2.4 },
          { file: 'stone-memorial-arch', x: 19, z: -16, h: 6.5 },
          { file: 'cloud-platform', x: 18, z: 10, h: 2.0 },
          { file: 'celestial-railing', x: 12, z: 6, h: 2.2 },
          { file: 'celestial-railing', x: -12, z: 6, h: 2.2 },
          { file: 'celestial-bell', x: -8, z: 4, h: 3.4 },
        ];
    const priority = new Set(config.index === 1 ? ['war-drum', 'fire-brazier'] : ['stone-lantern', 'celestial-bell']);
    const chosen = defsByChapter.filter((d) => priorityOnly ? priority.has(d.file) : !priority.has(d.file));
    for (const d of chosen) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (gen !== this.generation) return;
      try {
        const gltf = { scene: await this.loadProp(`models/live-opt/${d.file}.glb`, loader) };
        if (this.generation !== gen || this.currentChapterIdx !== config.index) { disposeObject(gltf.scene); return; }
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const size = new THREE.Vector3(); const ctr = new THREE.Vector3();
        box.getSize(size); box.getCenter(ctr);
        const s = d.h / Math.max(0.01, size.y);
        if (!Number.isFinite(s) || s > 1000) { disposeObject(m); return; }
        m.scale.setScalar(s);
        const y = this.getTerrainHeight(d.x, d.z);
        m.position.set(d.x - ctr.x * s, y - box.min.y * s - (d.file === 'moss-rock' ? d.h * 0.16 : 0), d.z - ctr.z * s);
        m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.worldGroup.add(m);
        const radius = Math.max(size.x, size.z) * s * 0.42;
        this.colliders.push({ x: d.x, z: d.z, r: Math.max(0.55, radius), h: d.h });
      } catch {
        // optional prop
      }
    }
  }

  private async loadLandmark(config: ChapterConfig, loader: GLTFLoader): Promise<void> {
    const gen = this.generation;
    const fallbacks = [config.landmarkModel, 'models/fusang-tree.glb', 'models/nantian-gate.glb'];
    for (const url of fallbacks) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok || (head.headers.get('content-type') || '').includes('text/html')) continue;
        const gltf = await loader.loadAsync(url);
        if (this.generation !== gen || this.currentChapterIdx !== config.index) { disposeObject(gltf.scene); return; }

        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const sz = new THREE.Vector3();
        const ctr = new THREE.Vector3();
        box.getSize(sz);
        box.getCenter(ctr);

        const targetHeight = config.index === 2 ? 15.5 : 12.5;
        const s = targetHeight / Math.max(0.01, sz.y);
        if (!Number.isFinite(s) || s > 1000) { disposeObject(m); return; }
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
        this.applyTextureQuality(m);
        this.worldGroup.add(m);
        if (gltf.animations && gltf.animations.length > 0) {
          this.landmarkMixer = new THREE.AnimationMixer(m);
          this.landmarkMixer.clipAction(gltf.animations[0]).play();
        } else if (config.index === 2) {
          this.applyDragonShader(m);
          this.dragonModel = m;
          this.dragonBaseY = m.position.y;
        }
        return;
      } catch {
        // try next fallback
      }
    }
  }

  private buildHuaguoshanBiome(): void {
    // Cascading Water Curtain Cave Waterfall (水帘洞飞瀑) behind the landmark
    // A volumetric curtain of narrow water strands leaves the gateway readable.
    // Shared instanced geometry avoids the previous opaque 11m billboard.
    const water = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.018, 0.045, 1, 5),
      new THREE.MeshBasicMaterial({ color: 0x9bd8dc, transparent: true, opacity: 0.24, depthWrite: false }),
      48
    );
    const strand = new THREE.Object3D();
    for (let i = 0; i < 48; i++) {
      const x = (i / 47 - 0.5) * 7.5;
      const height = 7 + Math.sin(i * 2.3) * 1.5;
      strand.position.set(x, height / 2 + 0.4, -29 + Math.sin(i * 1.7) * 0.45);
      strand.scale.set(1, height, 1); strand.updateMatrix();
      water.setMatrixAt(i, strand.matrix);
    }
    water.instanceMatrix.needsUpdate = true;
    this.waterfallMesh = water;
    this.worldGroup.add(water);

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

    // Pale moon behind the waterfall / pillar.
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.72 })
    );
    moon.position.set(0, 15, -42);
    this.worldGroup.add(moon);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(8.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending })
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

    addInstanced(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xb06a52, transparent: true, opacity: 0.62, side: THREE.DoubleSide }), 260, () => {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 16;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, this.getTerrainHeight(x, z) + 0.04, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
      dummy.scale.setScalar(0.7 + Math.random() * 1.4);
    });
  }

  private async buildFlamingMountainBiome(hasBarrier: boolean, loader: GLTFLoader): Promise<void> {
    const gen = this.generation;
    // Load Aholo Plantain Fan relic pedestal near spawn as visual lore cue
    try {
      const head = await fetch('models/plantain-fan.glb', { method: 'HEAD' });
      if (head.ok && !(head.headers.get('content-type') || '').includes('text/html')) {
        const gltf = await loader.loadAsync('models/plantain-fan.glb');
        if (gen !== this.generation) { disposeObject(gltf.scene); return; }
        const fan = gltf.scene;
        fan.scale.setScalar(2.2);
        fan.position.set(-4.5, this.getTerrainHeight(-4.5, 11) + 1.4, 11);
        this.worldGroup.add(fan);
      }
    } catch {
      // optional prop
    }

    if (gen !== this.generation) return;
    // Lava fissures and ash haze: break up the flat brown plane.
    // Cracked basalt with a narrow incandescent core, fitted to the terrain.
    const vertices:number[]=[], colors:number[]=[], faces:number[]=[];
    for(let seam=0;seam<14;seam++){
      let x=(seam%2===0?-1:1)*(3+seam%6*2), z=13-(seam%5)*4;
      for(let j=0;j<15;j++){
        x+=Math.sin(seam*8.3+j*5.1)*.67;z-=.84;
        const w=(.04+.095*Math.abs(Math.sin(j*.79+seam)))*Math.sin(Math.PI*(j+.15)/15);
        const id=vertices.length/3;
        for(const [dx,dy,r,g,b] of [[-2*w,.016,.055,.032,.025],[-w,.06,.17,.09,.046],[-.28*w,.029,1,.22,.018],[.22*w,.028,1,.39,.036],[w,.052,.18,.08,.036],[2*w,.015,.055,.032,.025]]){
          vertices.push(x+dx,this.getTerrainHeight(x+dx,z)+dy,z);colors.push(r,g,b);
        }
        if(j>0)for(let k=0;k<5;k++)faces.push(id-6+k,id-5+k,id+k,id-5+k,id+1+k,id+k);
      }
    }
    const fissures=new THREE.BufferGeometry();fissures.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    fissures.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));fissures.setIndex(faces);
    this.worldGroup.add(new THREE.Mesh(fissures,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));

    const ac = document.createElement('canvas');
    ac.width = ac.height = 256;
    const ax = ac.getContext('2d')!;
    ax.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256;
      const rg = ax.createRadialGradient(gx, gy, 2, gx, gy, 18 + Math.random() * 32);
      rg.addColorStop(0, 'rgba(8,5,4,0.42)');
      rg.addColorStop(1, 'rgba(8,5,4,0)');
      ax.fillStyle = rg; ax.beginPath(); ax.arc(gx, gy, 40, 0, Math.PI * 2); ax.fill();
    }
    const ashTex = new THREE.CanvasTexture(ac);
    const ash = new THREE.Mesh(new THREE.PlaneGeometry(38, 40), new THREE.MeshBasicMaterial({ map: ashTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(0, 0.07, -7);
    this.worldGroup.add(ash);

    if (hasBarrier) {
      this.fireWallActive = true;
      this.fireWallGroup.position.set(0, this.getTerrainHeight(0, this.fireWallZ), this.fireWallZ);
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const cx = c.getContext('2d')!;
      const grad = cx.createLinearGradient(0, 128, 0, 0);
      grad.addColorStop(0, 'rgba(255,60,8,0.9)');
      grad.addColorStop(0.42, 'rgba(255,125,20,0.55)');
      grad.addColorStop(0.78, 'rgba(255,210,90,0.18)');
      grad.addColorStop(1, 'rgba(255,240,190,0)');
      cx.fillStyle = grad; cx.fillRect(0, 0, 256, 128);
      const flameTex = new THREE.CanvasTexture(c);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(27, 6),
        new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.06, 0);
      this.fireWallGroup.add(glow);
      this.fireWallGlow = glow;

      const positions = new Float32Array(180 * 3);
      const colors = new Float32Array(180 * 3);
      for (let i = 0; i < 180; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 26;
        positions[i * 3 + 1] = Math.random() * 5.2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
        const hot = Math.random();
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.38 + hot * 0.55; colors[i * 3 + 2] = 0.05;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: this.getParticleTexture(), depthWrite: false, size: 0.16, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
      this.fireWallParticles = pts;
      this.fireWallGroup.add(pts);
      // Three-dimensional flame volumes, not a wall-sized billboard.
      const flameGeo = new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.32, 0.08),
        new THREE.Vector2(0.5, 0.45), new THREE.Vector2(0.32, 1.0),
        new THREE.Vector2(0.16, 1.7), new THREE.Vector2(0, 2.4),
      ], 10);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff721c, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false });
      flameMat.onBeforeCompile = shader => {
        shader.uniforms.uFlameTime = this.fireTime;
        shader.vertexShader = 'uniform float uFlameTime; varying float vFlameY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFlameY = position.y; transformed.x += sin(uFlameTime * 4.0 + modelMatrix[3].x * 2.3 + position.y * 2.0) * position.y * 0.12;');
        shader.fragmentShader = 'varying float vFlameY;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(1.0, 0.8, 0.24), diffuseColor.rgb, smoothstep(0.0, 1.3, vFlameY)); diffuseColor.a *= 1.0 - smoothstep(0.25, 2.4, vFlameY);');
      };
      for (let i = 0; i < 48; i++) {
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set((i % 24 - 11.5) * 1.12, 0.05, i < 24 ? -0.35 : 0.45);
        flame.scale.set(1.1, 1.1 + (Math.sin(i * 3.7) + 1) * 0.35, 1);
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

    // Low cloud sea and floating lanterns: fill the celestial horizon without blocking the arena.
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const cx = cc.getContext('2d')!;
    const cg = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
    cg.addColorStop(0, 'rgba(205,235,245,0.55)');
    cg.addColorStop(0.55, 'rgba(150,190,220,0.18)');
    cg.addColorStop(1, 'rgba(80,120,160,0)');
    cx.fillStyle = cg; cx.fillRect(0, 0, 128, 128);
    const cloudTex = new THREE.CanvasTexture(cc);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 24 + (i % 3) * 3.5;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.18, depthWrite: false }));
      sp.position.set(Math.cos(a) * r, 1.4 + (i % 4) * 0.5, Math.sin(a) * r - 8);
      sp.scale.set(7 + (i % 4) * 2.2, 2.2 + (i % 3) * 0.7, 1);
      this.worldGroup.add(sp);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const r = 13 + (i % 4) * 3.5;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffd27a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(Math.cos(a) * r, 2.2 + (i % 5) * 1.1, Math.sin(a) * r - 8);
      glow.scale.set(0.75, 0.95, 1);
      this.worldGroup.add(glow);
    }

  }

  private spawnPeaches(config: ChapterConfig): void {
    for (const [px, pz] of config.peaches) {
      const g = new THREE.Group();
      const py = this.getTerrainHeight(px, pz) + 1.05;
      g.position.set(px, py, pz);

      const peach = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xffd08a,
          emissive: 0x7a3a10,
          emissiveIntensity: 0.25,
          roughness: 0.42,
        })
      );
      peach.scale.y = 0.92;
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.28, 5),
        new THREE.MeshStandardMaterial({ color: 0x2f6b3c, roughness: 0.8 })
      );
      leaf.position.set(0.13, 0.22, 0);
      leaf.rotation.z = -0.5;
      g.add(peach, leaf);
      this.worldGroup.add(g);
      this.peaches.push({ mesh: g, collected: false });
    }
  }

  public updateAmbient(dt: number, time: number): void {
    this.fireTime.value = time;
    if (this.landmarkMixer) this.landmarkMixer.update(dt);
    for (const u of this.dragonUniforms) u.value = time;
    if (this.fireWallGlow) (this.fireWallGlow.material as THREE.MeshBasicMaterial).opacity = 0.72 + Math.sin(time * 7) * 0.12;
    if (this.fireWallPlane) {
      const fm = this.fireWallPlane.material as THREE.MeshBasicMaterial;
      fm.opacity = 0.6 + Math.abs(Math.sin(time * 5.2)) * 0.22;
      if (fm.map) { fm.map.offset.x = time * 0.035; fm.map.offset.y = time * 0.06; }
    }
    if (this.fireWallParticles) {
      this.fireWallParticles.rotation.y = Math.sin(time * 0.7) * 0.15;
      (this.fireWallParticles.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(time * 5) * 0.18;
    }
    if (this.dragonModel) {
      this.dragonModel.position.y = this.dragonBaseY + Math.sin(time * 0.9) * 0.18;
      this.dragonModel.rotation.y += dt * 0.06;
    }
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

  private getParticleTexture(): THREE.CanvasTexture {
    if (this.particleTexture) return this.particleTexture;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16,16,1,16,16,15);
    gradient.addColorStop(0,'rgba(255,255,255,1)');
    gradient.addColorStop(0.35,'rgba(255,255,255,0.65)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
    this.particleTexture = new THREE.CanvasTexture(canvas);
    return this.particleTexture;
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
    const mat = new THREE.PointsMaterial({ map: this.getParticleTexture(), depthWrite: false,
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
      this.petals = new THREE.Points(pg, new THREE.PointsMaterial({ map: this.getParticleTexture(), depthWrite: false, color: 0xff9fbd, size: 0.16, transparent: true, opacity: 0.78 }));
      this.worldGroup.add(this.petals);
    }
  }

  public extinguishFireWall(): boolean {
    if (!this.fireWallActive) return false;
    this.fireWallActive = false;
    this.fireWallGroup.visible = false;
    return true;
  }

  public update(dt: number, playerPos: THREE.Vector3): { healed: boolean; fireBurn: boolean } {
    let healed = false;
    let fireBurn = false;
    const t = performance.now() * 0.001;

    // Animate waterfall shimmer
    if (this.waterfallMesh) {
      (this.waterfallMesh.material as THREE.MeshBasicMaterial).opacity =
        0.24 + Math.sin(t * 6) * 0.06;
    }

    // Animate Three-Samadhi Fire Wall & block player until extinguished by [3] Plantain Fan!
    if (this.fireWallActive) {
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
        p.mesh.visible = false;
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
