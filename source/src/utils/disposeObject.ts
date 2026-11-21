import * as THREE from 'three';

/** Dispose an owned subtree, including Points, textures and GPU skinning data.
 * Shared resources must be passed through the same sets for a complete ownership batch.
 * Sprite geometry belongs to Three.js, not to the individual sprite.
 */
export function disposeObject(root: THREE.Object3D,
  materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(),
  textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>()): void {
  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry && !(object as THREE.Sprite).isSprite && !geometries.has(renderable.geometry)) {
      geometries.add(renderable.geometry); renderable.geometry.dispose();
    }
    const skin = object as THREE.SkinnedMesh;
    if (skin.isSkinnedMesh && !skeletons.has(skin.skeleton)) {
      skeletons.add(skin.skeleton); skin.skeleton.dispose();
    }
    if (!renderable.material) return;
    for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
      if (materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !textures.has(value)) {
          textures.add(value); value.dispose();
        }
      }
      material.dispose();
    }
  });
}
