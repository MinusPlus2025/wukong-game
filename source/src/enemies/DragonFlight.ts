import * as THREE from 'three';

import { buildFlightSpine, bodySteps as segments, socket } from './DragonSpine';

const sculptScale = 1.8;

const mouthVertex = 47572, jawVertex = 61380;
const orbitTime = 5.7;
const aimTime = .85;

function part(skin: THREE.SkinnedMesh, triangles: number[]): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  for (const name of ['position','normal','uv']) g.setAttribute(name,skin.geometry.getAttribute(name));
  g.setIndex(triangles);
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.8);
  const mesh = new THREE.Mesh(g, skin.material);
  mesh.frustumCulled=false;mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Distances along one continuous track run from the resting tail, through the
// neck, around the cloud and back to the attack position. Each ring follows the
// exact route that the head took, delayed by its distance along the body.
export class DragonFlight {
  progress = 0;
  private elapsed = 0;
  private active=false;
  private warmFrames=0;
  private pitch=0;
  private readonly pitchAxis=new THREE.Vector3(Math.SQRT1_2,0,Math.SQRT1_2);
  private readonly pitchRotation=new THREE.Quaternion();
  private readonly group = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly headMesh: THREE.Mesh;
  private readonly cloud: THREE.Mesh;
  private readonly cloudWorld = new THREE.Matrix4();
  private readonly coil = new THREE.CatmullRomCurve3([
    [-1.0,.77,.4],[-1.13,.74,-.48],[-.2,.77,-1.05],[.96,.87,-.64],
    [1.05,1.07,.44],[.25,1.34,.88],[-.85,1.52,.44],[-.92,1.64,-.48],
    [-.2,1.8,-.89],[.6,1.96,-.48],[.57,2.26,.05],[.23,2.50,-.85]
  ].map(v=>new THREE.Vector3(...v)));
  private readonly lap = new THREE.CatmullRomCurve3([
    [.23,2.50,-.85],[1.2,3.0,-1.55],[3.1,3.7,-.55],[3.65,4.0,1.25],
    [2.25,4.15,3.05],[-.35,3.85,3.55],[-2.85,3.25,2.10],[-3.7,3.2,-.25],
    [-2.5,3.65,-2.65],[-.65,3.0,-2.1],[.23,2.50,-.85],
    [1.65,3.15,-1.65],[2.95,4.35,-2.25],[3.45,4.85,-1.10],[2.70,4.47,.48],[1.55,3.75,.82],[0,3.4,.15]
  ].map(v=>new THREE.Vector3(...v)));
  private readonly coilLength = this.coil.getLength();
  private readonly lapLength = this.lap.getLength();
  private readonly centers = Array.from({length:segments+1},()=>new THREE.Vector3());
  private readonly body:THREE.SkinnedMesh;
  private readonly basis=new THREE.Matrix4();
  private readonly bendA=new THREE.Vector3();
  private readonly bendB=new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly vertical = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly nose = new THREE.Vector3();
  private readonly jaw = new THREE.Vector3();
  private startYaw = 0;
  private aimYaw = 0;
  private hovering = 0;

  constructor(private readonly root: THREE.Group, private readonly skin: THREE.SkinnedMesh, mask: Uint8Array, neck: ArrayBuffer) {
    const index=skin.geometry.index!;
    if(mask.length!==Math.ceil(index.count/12)) throw new Error('Dragon flight mask does not match sculpt');
    const head:number[]=[], cloud:number[]=[];
    for(let t=0;t<index.count/3;t++){
      const kind=mask[t>>2]>>(2*(t%4))&3;
      const bucket=kind===1?head:kind===2?cloud:null;
      if(bucket) bucket.push(index.getX(t*3),index.getX(t*3+1),index.getX(t*3+2));
    }
    this.headMesh=part(skin,head);
    this.headMesh.position.copy(socket).multiplyScalar(-sculptScale);
    this.headMesh.scale.setScalar(sculptScale);
    const [vertices,indices]=new Uint32Array(neck,0,2);
    const edgeOffset=Math.ceil((8+32*vertices+2*indices)/4)*4;
    const edge=new THREE.InterleavedBuffer(new Float32Array(neck,edgeOffset),8);
    const collar=new THREE.BufferGeometry();
    collar.setAttribute('position',new THREE.InterleavedBufferAttribute(edge,3,0));
    collar.setAttribute('normal',new THREE.InterleavedBufferAttribute(edge,3,3));
    collar.setAttribute('uv',new THREE.InterleavedBufferAttribute(edge,2,6));
    const lip=new THREE.Mesh(collar,skin.material);lip.castShadow=lip.receiveShadow=true;
    this.headMesh.add(lip);
    this.head.add(this.headMesh);
    this.cloud=part(skin,cloud);
    // Fill the previously occluded center with curls cut from the same cloud.
    const curl:number[]=[];
    const xyz=skin.geometry.getAttribute('position');
    for(let i=0;i<cloud.length;i+=3){
      const k=cloud[i];
      if(xyz.getX(k)>.12 && xyz.getZ(k)>-.08)curl.push(cloud[i],cloud[i+1],cloud[i+2]);
    }
    const curlMesh=part(skin,curl);
    for(let i=0;i<5;i++){
      const m=i===0?curlMesh:curlMesh.clone();const a=i*Math.PI*2/5;
      m.rotation.y=a;m.scale.set(.66,.55,.65);
      m.position.set(-.16*Math.cos(a)-.15*Math.sin(a),-.22,.16*Math.sin(a)-.15*Math.cos(a));
      this.cloud.add(m);
    }
    this.group.add(this.cloud,this.head);
    this.body=buildFlightSpine(neck,this.coilLength,skin.material);
    this.group.add(this.body);root.add(this.group);this.group.visible=false;
  }

  warm(renderer:THREE.WebGLRenderer,camera:THREE.Camera,scene:THREE.Scene){
    void renderer.compileAsync(this.group,camera,scene).then(()=>{this.warmFrames=2}).catch(()=>{});
  }

  private draw(distance:number) {
    for(let i=0;i<=segments;i++){
      const d=distance-this.coilLength*i/segments, p=this.centers[i];
      if(d<0)this.coil.getPointAt(Math.max(0,1+d/this.coilLength),p);
      else this.lap.getPointAt(Math.min(1,d/this.lapLength),p);
      if(this.hovering>0){p.y+=.14*Math.sin(this.hovering*2.9-i*.12)*Math.min(1,this.hovering);p.x+=.17*Math.sin(this.hovering*2-i*.13)*i/segments*Math.min(1,this.hovering)}
    }
    // A lateral stroke travels aft as the waist loads, then releases at the tip.
    // Keep the throat stable and preserve each link length to avoid rubbery stretch.
    const amplitude=THREE.MathUtils.smoothstep(this.elapsed,.24,1.2);
    const spacing=this.coilLength/segments;
    for(let i=8;i<=segments;i++){
      const u=i/segments,p=this.centers[i],prev=this.centers[i-1];
      this.direction.subVectors(prev,p).normalize();
      const phase=this.elapsed*4.5-u*8.7;
      const stroke=amplitude*THREE.MathUtils.smoothstep(u,.15,.8)*(.36+.42*u)*Math.sin(phase);
      const flick=amplitude*Math.pow(u,4)*.42*Math.sin(phase*1.55);
      p.x+=this.direction.z*stroke;p.z-=this.direction.x*stroke;p.y+=flick;
      this.direction.subVectors(p,prev).setLength(spacing);
      p.copy(prev).add(this.direction);
    }
    this.head.position.copy(this.centers[0]);
    this.direction.subVectors(this.centers[0],this.centers[1]);
    return Math.atan2(this.direction.x,this.direction.z);
  }

  private poseSpine(){
    // The head cut has a downward opening. Leave the throat vertically, then
    // turn the cervical vertebrae into the approaching back with a cubic bend.
    const join=9, start=this.centers[0], end=this.centers[join];
    this.direction.set(0,1,0).applyQuaternion(this.head.quaternion);
    this.bendA.copy(start).addScaledVector(this.direction,-.58);
    this.bendB.subVectors(end,this.centers[join+1]).normalize().multiplyScalar(.62).add(end);
    for(let i=1;i<join;i++){
      const t=i/join,u=1-t;
      this.centers[i].copy(start).multiplyScalar(u*u*u).addScaledVector(this.bendA,3*u*u*t)
        .addScaledVector(this.bendB,3*u*t*t).addScaledVector(end,t*t*t);
    }
    this.right.set(1,0,0).applyQuaternion(this.head.quaternion);
    for(let i=0;i<=segments;i++){
      if(i===0)this.tangent.copy(this.direction);
      else this.tangent.subVectors(this.centers[i-1],this.centers[Math.min(segments,i+1)]).normalize();
      this.right.addScaledVector(this.tangent,-this.right.dot(this.tangent)).normalize();
      this.vertical.crossVectors(this.right,this.tangent);
      const bone=this.body.skeleton.bones[i];bone.position.copy(this.centers[i]);
      bone.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right,this.tangent,this.vertical));
    }
  }

  update(dt:number,phase:boolean,target:THREE.Vector3){
    if(!phase){this.elapsed=this.progress=this.hovering=0;this.group.position.y=0;this.head.rotation.x=0;this.active=false;this.group.visible=this.warmFrames>0;
      if(this.warmFrames>0){this.group.scale.setScalar(.00001);this.warmFrames--}
      this.skin.visible=true;return}
    if(!this.active){
      this.active=true;this.group.scale.setScalar(1);
      this.startYaw=this.root.rotation.y;
      this.cloud.matrixAutoUpdate=true;this.cloud.position.set(0,1.8,0);this.cloud.scale.setScalar(sculptScale);this.cloud.rotation.y=Math.PI/4;this.cloud.updateMatrix();
      this.root.updateWorldMatrix(true,false);this.cloudWorld.multiplyMatrices(this.root.matrixWorld,this.cloud.matrix);
      this.cloud.matrixWorld.copy(this.cloudWorld);this.cloud.matrixWorldAutoUpdate=false;this.cloud.matrixAutoUpdate=false;this.group.visible=true;this.skin.visible=false;
    }
    this.elapsed+=dt;this.progress=Math.min(1,this.elapsed/(orbitTime+aimTime));
    const lap=Math.min(1,this.elapsed/orbitTime);
    this.group.rotation.y=this.startYaw-this.root.rotation.y;
    this.group.updateWorldMatrix(true,false);
    this.hovering=Math.max(0,this.elapsed-orbitTime);
    this.pitch=.34*Math.sin(Math.PI*lap);
    const yaw=this.draw(this.lapLength*THREE.MathUtils.smootherstep(lap,0,1));
    if(lap<1)this.aimYaw=yaw;
    else if(this.progress<1||this.elapsed-dt<orbitTime+aimTime){
      const p=this.group.localToWorld(this.nose.copy(this.head.position));
      const desired=Math.atan2(target.x-p.x,target.z-p.z)-this.startYaw;
      const turn=THREE.MathUtils.euclideanModulo(desired-yaw+Math.PI,2*Math.PI)-Math.PI;
      this.aimYaw=yaw+turn*THREE.MathUtils.smoothstep(this.hovering/aimTime,0,1);
    }
    this.head.rotation.set(0,this.aimYaw+Math.PI/4,0);
    this.head.quaternion.multiply(this.pitchRotation.setFromAxisAngle(this.pitchAxis,this.pitch));
    this.poseSpine();
  }
  origin(out:THREE.Vector3){return this.headMesh.localToWorld(out.fromBufferAttribute(this.skin.geometry.getAttribute('position'),mouthVertex))}
  fall(dt:number){this.head.rotation.x+=dt*.4;this.group.position.y-=dt*1.7;}
  yawError(yaw:number){
    this.origin(this.nose);
    this.headMesh.localToWorld(this.jaw.fromBufferAttribute(this.skin.geometry.getAttribute('position'),jawVertex));
    return Math.abs(THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(Math.atan2(this.nose.x-this.jaw.x,this.nose.z-this.jaw.z)-yaw+Math.PI,2*Math.PI)-Math.PI));
  }
  align(worldYaw:number,out:THREE.Vector3){
    this.group.rotation.y=this.startYaw-this.root.rotation.y;
    this.origin(out);
    this.headMesh.localToWorld(this.jaw.fromBufferAttribute(this.skin.geometry.getAttribute('position'),jawVertex));
    this.direction.subVectors(out,this.jaw);
    this.aimYaw+=THREE.MathUtils.euclideanModulo(worldYaw-Math.atan2(this.direction.x,this.direction.z)+Math.PI,2*Math.PI)-Math.PI;
    this.head.rotation.set(0,this.aimYaw+Math.PI/4,0);
    this.head.quaternion.multiply(this.pitchRotation.setFromAxisAngle(this.pitchAxis,this.pitch));
    this.poseSpine();
    return this.origin(out);
  }
}
