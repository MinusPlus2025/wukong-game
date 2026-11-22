import * as THREE from 'three';

export const bodySteps = 48;
export const socket = new THREE.Vector3(.455,.31,-.14);

// The surface is a clipped strip of the sculpt itself. Reversing alternate strips
// joins identical edge loops, including their UV seams, around the entire girth.
export function buildFlightSpine(patch:ArrayBuffer, length:number, material:THREE.Material|THREE.Material[]) {
  const counts=new Uint32Array(patch,0,2),nv=counts[0],ni=counts[1];
  const src=new Float32Array(patch,8,nv*8),faces=new Uint16Array(patch,8+nv*32,ni);
  const copies=Math.ceil(length/.48), vertexCount=copies*nv;
  const pos=new Float32Array(vertexCount*3), norm=new Float32Array(pos.length),uv=new Float32Array(vertexCount*2);
  const joints=new Uint16Array(vertexCount*4),weights=new Float32Array(vertexCount*4);
  const index=new Uint32Array(copies*ni);
  for(let i=0;i<copies;i++){
    const mirror=i%2===1;
    for(let v=0;v<nv;v++){
      const k=i*nv+v,a=v*8,h=THREE.MathUtils.clamp((src[a+1]-.115)/(.31-.115),0,1);
      const t=(i+(mirror?h:1-h))/copies;
      const girth=1.8*(1+.24*Math.sin(t*Math.PI))*Math.max(.008,1-Math.pow(t,2.6));
      pos[k*3]=(src[a]-THREE.MathUtils.lerp(.409,socket.x,h))*girth;
      pos[k*3+1]=-length*t;
      pos[k*3+2]=(src[a+2]-THREE.MathUtils.lerp(-.057,socket.z,h))*girth;
      norm[k*3]=src[a+3];norm[k*3+1]=src[a+4]*(mirror?-1:1);norm[k*3+2]=src[a+5];
      uv[k*2]=src[a+6];uv[k*2+1]=src[a+7];
      const f=t*bodySteps, j=Math.min(bodySteps-1,Math.floor(f));
      joints[k*4]=j;joints[k*4+1]=j+1;weights[k*4]=1-(f-j);weights[k*4+1]=f-j;
    }
    for(let j=0;j<ni;j+=3){
      index[i*ni+j]=i*nv+faces[j];index[i*ni+j+1]=i*nv+faces[j+(mirror?2:1)];index[i*ni+j+2]=i*nv+faces[j+(mirror?1:2)];
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(norm,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setAttribute('skinIndex',new THREE.BufferAttribute(joints,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));g.setIndex(new THREE.BufferAttribute(index,1));
  const mesh=new THREE.SkinnedMesh(g,material),bones:THREE.Bone[]=[];
  for(let i=0;i<=bodySteps;i++){const b=new THREE.Bone();b.position.y=-length*i/bodySteps;mesh.add(b);bones.push(b)}
  mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;
  return mesh;
}
