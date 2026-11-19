import * as THREE from 'three';

export interface BiomePBRSet {
  groundMap: THREE.CanvasTexture;
  groundBump: THREE.CanvasTexture;
  plazaMap: THREE.CanvasTexture;
  plazaBump: THREE.CanvasTexture;
}

/**
 * Generates high-resolution 1024x1024 PBR Albedo + Bump/Height textures & Custom GLSL Mythic Shaders:
 * - Carved Chinese Courtyard Slate & Moss / Cracked Magma Basalt / Imperial White Jade & Gold Seal
 * - Atmospheric Sky Dome with Sun/Moon Halo & Drifting Clouds
 * - Flowing Waterfall & Ripple Pond Shader (Huaguoshan)
 * - Turbulent Perlin/FBM Three-Samadhi Fire Curtain Shader (Flaming Mountain)
 * - Volumetric-style Rolling Golden Cloud Sea Shader (South Heaven Gate)
 */
export function createBiomePBRTextures(chapterIdx: number): BiomePBRSet {
  // 1. Natural Biome Terrain Texture (Mossy Cliff Stone / Volcanic Obsidian / Celestial Cloud-Slate)
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 1024;
  gCanvas.height = 1024;
  const gCtx = gCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = 1024;
  bCanvas.height = 1024;
  const bCtx = bCanvas.getContext('2d')!;

  if (chapterIdx === 0) {
    // Rich Huaguoshan mossy slate & fallen peach petals
    gCtx.fillStyle = '#243329';
    gCtx.fillRect(0, 0, 1024, 1024);
    bCtx.fillStyle = '#777777';
    bCtx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 420; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const r = 18 + Math.random() * 68;
      const grad = gCtx.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, i % 3 === 0 ? 'rgba(62, 92, 64, 0.45)' : 'rgba(46, 56, 52, 0.5)');
      grad.addColorStop(1, 'rgba(30, 42, 34, 0)');
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.arc(x, y, r, 0, Math.PI * 2);
      gCtx.fill();

      bCtx.fillStyle = i % 2 === 0 ? 'rgba(215,215,215,0.22)' : 'rgba(55,55,55,0.22)';
      bCtx.beginPath();
      bCtx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      bCtx.fill();
    }
    // Subtle fallen pink peach blossom petals scattered on moss
    for (let i = 0; i < 160; i++) {
      gCtx.fillStyle = 'rgba(242, 162, 182, 0.55)';
      gCtx.beginPath();
      gCtx.ellipse(
        Math.random() * 1024,
        Math.random() * 1024,
        3.5,
        2.0,
        Math.random() * Math.PI,
        0,
        Math.PI * 2
      );
      gCtx.fill();
    }
  } else if (chapterIdx === 1) {
    // Flaming Mountain scorched obsidian & glowing magma veins
    gCtx.fillStyle = '#1c1210';
    gCtx.fillRect(0, 0, 1024, 1024);
    bCtx.fillStyle = '#909090';
    bCtx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 320; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const r = 20 + Math.random() * 70;
      gCtx.fillStyle = i % 2 === 0 ? 'rgba(48, 28, 22, 0.5)' : 'rgba(26, 17, 15, 0.6)';
      gCtx.beginPath();
      gCtx.arc(x, y, r, 0, Math.PI * 2);
      gCtx.fill();
    }
    // Glowing molten fissures
    gCtx.strokeStyle = '#ff5a1f';
    gCtx.lineWidth = 3.5;
    gCtx.shadowColor = '#ff3b00';
    gCtx.shadowBlur = 14;
    bCtx.strokeStyle = '#151515';
    bCtx.lineWidth = 6;
    for (let v = 0; v < 26; v++) {
      let cx = Math.random() * 1024;
      let cy = Math.random() * 1024;
      gCtx.beginPath();
      bCtx.beginPath();
      gCtx.moveTo(cx, cy);
      bCtx.moveTo(cx, cy);
      for (let seg = 0; seg < 7; seg++) {
        cx += (Math.random() - 0.5) * 95;
        cy += (Math.random() - 0.5) * 95;
        gCtx.lineTo(cx, cy);
        bCtx.lineTo(cx, cy);
      }
      gCtx.stroke();
      bCtx.stroke();
    }
    gCtx.shadowBlur = 0;
  } else {
    // Celestial South Heaven Gate — polished imperial cloud-marble & gold inlays
    gCtx.fillStyle = '#d9d3c7';
    gCtx.fillRect(0, 0, 1024, 1024);
    bCtx.fillStyle = '#c8c8c8';
    bCtx.fillRect(0, 0, 1024, 1024);

    gCtx.strokeStyle = 'rgba(188, 152, 82, 0.42)';
    gCtx.lineWidth = 2;
    bCtx.strokeStyle = '#686868';
    bCtx.lineWidth = 3;
    const step = 128;
    for (let x = 0; x <= 1024; x += step) {
      gCtx.beginPath();
      gCtx.moveTo(x, 0);
      gCtx.lineTo(x, 1024);
      gCtx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(x, 0);
      bCtx.lineTo(x, 1024);
      bCtx.stroke();
    }
    for (let y = 0; y <= 1024; y += step) {
      gCtx.beginPath();
      gCtx.moveTo(0, y);
      gCtx.lineTo(1024, y);
      gCtx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(0, y);
      bCtx.lineTo(1024, y);
      bCtx.stroke();
    }
  }

  const groundMap = new THREE.CanvasTexture(gCanvas);
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.repeat.set(9, 9);
  groundMap.colorSpace = THREE.SRGBColorSpace;

  const groundBump = new THREE.CanvasTexture(bCanvas);
  groundBump.wrapS = groundBump.wrapT = THREE.RepeatWrapping;
  groundBump.repeat.set(9, 9);

  // 2. Ornate Carved Chinese Bagua / Dragon Stone Plaza Texture (1024x1024)
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 1024;
  pCanvas.height = 1024;
  const pCtx = pCanvas.getContext('2d')!;

  const pbCanvas = document.createElement('canvas');
  pbCanvas.width = 1024;
  pbCanvas.height = 1024;
  const pbCtx = pbCanvas.getContext('2d')!;

  const baseHex = chapterIdx === 2 ? '#e6decb' : chapterIdx === 1 ? '#291a16' : '#3a423e';
  const accentHex = chapterIdx === 2 ? '#c89b3c' : chapterIdx === 1 ? '#e85d26' : '#b89b5e';
  pCtx.fillStyle = baseHex;
  pCtx.fillRect(0, 0, 1024, 1024);
  pbCtx.fillStyle = '#888888';
  pbCtx.fillRect(0, 0, 1024, 1024);

  pCtx.translate(512, 512);
  pbCtx.translate(512, 512);

  // Radial ancient flagstones
  for (const r of [140, 260, 380, 488]) {
    pCtx.strokeStyle = accentHex;
    pCtx.lineWidth = r === 488 ? 10 : 4;
    pCtx.beginPath();
    pCtx.arc(0, 0, r, 0, Math.PI * 2);
    pCtx.stroke();

    pbCtx.strokeStyle = '#ffffff';
    pbCtx.lineWidth = 6;
    pbCtx.beginPath();
    pbCtx.arc(0, 0, r, 0, Math.PI * 2);
    pbCtx.stroke();
  }

  // 8 Bagua trigram spokes + carved inner seal
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pCtx.strokeStyle = 'rgba(0,0,0,0.35)';
    pCtx.lineWidth = 3;
    pCtx.beginPath();
    pCtx.moveTo(Math.cos(a) * 140, Math.sin(a) * 140);
    pCtx.lineTo(Math.cos(a) * 488, Math.sin(a) * 488);
    pCtx.stroke();

    pbCtx.strokeStyle = '#333333';
    pbCtx.lineWidth = 5;
    pbCtx.beginPath();
    pbCtx.moveTo(Math.cos(a) * 140, Math.sin(a) * 140);
    pbCtx.lineTo(Math.cos(a) * 488, Math.sin(a) * 488);
    pbCtx.stroke();
  }

  pCtx.font = 'bold 120px serif';
  pCtx.fillStyle = accentHex;
  pCtx.textAlign = 'center';
  pCtx.textBaseline = 'middle';
  pCtx.fillText(chapterIdx === 2 ? '凌霄' : chapterIdx === 1 ? '焚天' : '灵山', 0, 0);

  const plazaMap = new THREE.CanvasTexture(pCanvas);
  plazaMap.colorSpace = THREE.SRGBColorSpace;
  const plazaBump = new THREE.CanvasTexture(pbCanvas);

  return { groundMap, groundBump, plazaMap, plazaBump };
}

/**
 * Custom GLSL Mythic Sky Dome (Sunset Glow / Volcanic Twilight / Celestial Golden Dawn)
 */
export function createMythicSkyDome(chapterIdx: number): THREE.ShaderMaterial {
  const presets = [
    // Ch.1 Huaguoshan: Misty Emerald-Cyan Zenith -> Warm Golden-Peach Sunset Horizon
    {
      top: new THREE.Color(0x0c2233),
      mid: new THREE.Color(0x285866),
      bot: new THREE.Color(0xd99b66),
      sun: new THREE.Color(0xffe8b3),
      sunDir: new THREE.Vector3(0.25, 0.32, -0.91).normalize(),
    },
    // Ch.2 Flaming Mountain: Deep Obsidian Smoke Zenith -> Blazing Crimson-Amber Horizon
    {
      top: new THREE.Color(0x120708),
      mid: new THREE.Color(0x4a160e),
      bot: new THREE.Color(0xd94e1f),
      sun: new THREE.Color(0xff9442),
      sunDir: new THREE.Vector3(0.0, 0.26, -0.96).normalize(),
    },
    // Ch.3 South Heaven Gate: Royal Indigo Heaven -> Sacred Imperial Gold Cloud Horizon
    {
      top: new THREE.Color(0x0d1633),
      mid: new THREE.Color(0x2e4370),
      bot: new THREE.Color(0xf2ca7e),
      sun: new THREE.Color(0xfff5cc),
      sunDir: new THREE.Vector3(0.0, 0.36, -0.93).normalize(),
    },
  ];
  const p = presets[chapterIdx] ?? presets[0];

  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: p.top },
      uMid: { value: p.mid },
      uBot: { value: p.bot },
      uSunCol: { value: p.sun },
      uSunDir: { value: p.sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBot;
      uniform vec3 uSunCol;
      uniform vec3 uSunDir;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec3 d = normalize(vWorldDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.32, h));
        col = mix(col, uTop, smoothstep(0.28, 0.88, h));

        // Soft drifting high-altitude clouds
        vec2 uv = d.xz / max(0.14, d.y + 0.18) * 1.6 + vec2(uTime * 0.015, uTime * 0.008);
        float c = noise(uv) * 0.6 + noise(uv * 2.3) * 0.4;
        float cloudMask = smoothstep(0.48, 0.82, c) * smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.55, 0.95, h));
        col = mix(col, mix(uBot, uSunCol, 0.55), cloudMask * 0.38);

        // Celestial Sun / Moon disc + atmospheric Mie halo
        float sunAmt = max(dot(d, uSunDir), 0.0);
        col += uSunCol * pow(sunAmt, 12.0) * 0.38;
        col += uSunCol * smoothstep(0.996, 0.9992, sunAmt) * 1.35;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Custom GLSL Flowing Waterfall Curtain Shader (Huaguoshan Water Curtain Cave)
 */
export function createWaterfallShader(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec2 flowUv = vec2(vUv.x * 9.0, vUv.y * 3.5 + uTime * 2.6);
        float streak = noise(flowUv) * 0.65 + noise(flowUv * 2.4 + vec2(0.0, uTime * 1.8)) * 0.35;
        float edgeFade = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float topBotFade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float foam = smoothstep(0.18, 0.0, vUv.y) * 0.55;
        vec3 waterCol = mix(vec3(0.38, 0.72, 0.82), vec3(0.92, 0.98, 1.0), smoothstep(0.35, 0.82, streak + foam));
        float alpha = (0.32 + streak * 0.52 + foam) * edgeFade * topBotFade;
        gl_FragColor = vec4(waterCol, clamp(alpha, 0.0, 0.88));
      }
    `,
  });
}

/**
 * Custom GLSL Turbulent Three-Samadhi Fire Wall Shader (Flaming Mountain)
 */
export function createSamadhiFireShader(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.x * 0.9 + uTime * 5.0) * uv.y * 0.45;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15;
      }
      void main() {
        vec2 q = vec2(vUv.x * 7.5, vUv.y * 2.6 - uTime * 2.9);
        float n = fbm(q);
        float flameMask = smoothstep(vUv.y * 0.95, 0.05, n * 1.15 - vUv.y * 0.42);
        float sideFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 col = mix(vec3(0.95, 0.16, 0.02), vec3(1.0, 0.78, 0.22), smoothstep(0.15, 0.75, n * (1.1 - vUv.y)));
        gl_FragColor = vec4(col, flameMask * sideFade * 0.92);
      }
    `,
  });
}

/**
 * Custom GLSL Rolling Celestial Cloud Sea Shader (South Heaven Gate)
 */
export function createCloudSeaShader(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin(p.x * 0.12 + uTime * 0.7) * cos(p.z * 0.12 + uTime * 0.5) * 0.55;
        vDist = length(p.xz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vDist;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        // Keep central arena clear so cloud sea surrounds the jade terrace majestically
        float ringMask = smoothstep(13.5, 22.0, vDist) * (1.0 - smoothstep(46.0, 68.0, vDist));
        vec2 uv = vUv * 12.0 + vec2(uTime * 0.08, uTime * 0.04);
        float c = noise(uv) * 0.65 + noise(uv * 2.2) * 0.35;
        vec3 col = mix(vec3(0.82, 0.78, 0.86), vec3(1.0, 0.94, 0.78), c);
        float alpha = smoothstep(0.28, 0.78, c) * ringMask * 0.78;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}
