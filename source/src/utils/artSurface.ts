import * as THREE from 'three';

// GLTF texture coordinates are top-down. Each texture is owned by the loaded model/template.
export function addAtlasRelief(root: THREE.Object3D, asset: string): void {
  const name = asset.split('/').pop()!.replace('.glb', '');
  if (!['cliff-rock','moss-rock','mountain-gate','guardian-statue','peach-branch','wukong-animated','yaoguai-guard-rigged'].includes(name)) return;
  let relief: THREE.Texture | undefined;
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.attributes.uv) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(m instanceof THREE.MeshStandardMaterial) || !m.map || m.normalMap) continue;
      relief ??= new THREE.TextureLoader().load('textures/art/' + name + '.jpg');
      relief.flipY = false;
      relief.anisotropy = 4;
      m.normalMap = relief;
      m.normalScale.setScalar(name === 'peach-branch' ? .48 : .75);
      m.needsUpdate = true;
    }
  });
}

// Rest-pose coordinates keep detail fixed to animated skin even on assets without UVs.
export function dressCreature(root: THREE.Object3D, surface: string): void {
  if (!['bone','gel','scale'].includes(surface)) return;
  const seen = new Set<THREE.Material>();
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const m = material as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial || seen.has(m) || /eye/i.test(m.name)) continue;
      seen.add(m);
      const kind = /horn/i.test(m.name) ? 'bone' : surface;
      m.roughness = kind === 'gel' ? .29 : kind === 'bone' ? .78 : .53;
      m.metalness = .025;
      if(kind==='bone') m.color.lerp(new THREE.Color(0xb9a485),.34);
      if(kind==='gel') m.color.lerp(new THREE.Color(0x78854c),.45);
      const frequency = 1 / Math.max(size.x,size.y,size.z,.001);
      m.customProgramCacheKey = () => 'creature-relief-' + kind;
      m.onBeforeCompile = shader => {
        shader.uniforms.uDetailFrequency = {value:frequency};
        shader.vertexShader = 'uniform float uDetailFrequency; varying vec3 vArt;\n'+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vArt=position*uDetailFrequency;');
        shader.fragmentShader = 'varying vec3 vArt;\n'+shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'+
          (kind==='scale' ? 'vec2 tile=vArt.xy*vec2(38.,48.)+vArt.z*vec2(17.,13.);tile.x+=.5*mod(floor(tile.y),2.);vec2 cell=fract(tile)-.5;float relief=1.-smoothstep(.34,.51,length(cell*vec2(.92,1.12)));' :
           kind==='bone' ? 'float relief=.5+.5*sin(vArt.y*155.+5.*sin(vArt.x*42.+vArt.z*18.))*sin(vArt.z*76.+vArt.x*85.);' :
           'float relief=.5+.5*sin(vArt.x*37.+3.*sin(vArt.z*24.))*sin(vArt.y*43.+vArt.z*13.);')+
          '\n diffuseColor.rgb*=mix(.77,1.08,relief);')
          .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor+.15*(.5-relief),.1,1.);');
      };
      m.needsUpdate=true;
    }
  });
}
