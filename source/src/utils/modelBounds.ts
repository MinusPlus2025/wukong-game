import * as THREE from 'three';

/** Measure rendered vertices, never armature nodes. Evaluate the neutral clip first:
 * some exported meshes are normalized while their skin bind matrices are not.
 */
export function modelBounds(root: THREE.Object3D, clips: THREE.AnimationClip[]): THREE.Box3 {
  const idle = clips.find(c => /idle/i.test(c.name)) ?? clips.find(c => c.name === 'animation_1');
  const mixer = idle ? new THREE.AnimationMixer(root) : null;
  if (mixer && idle) { mixer.clipAction(idle).play(); mixer.update(0); }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  root.traverseVisible(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const skin = object as THREE.SkinnedMesh;
    if (skin.isSkinnedMesh) {
      skin.computeBoundingBox();
      if (skin.boundingBox) box.union(part.copy(skin.boundingBox).applyMatrix4(skin.matrixWorld));
    } else {
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
    }
  });
  mixer?.stopAllAction();
  mixer?.uncacheRoot(root);
  if (box.isEmpty()) throw new Error('Model has no visible mesh vertices');
  return box;
}
