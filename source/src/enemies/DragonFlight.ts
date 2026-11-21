import * as THREE from 'three';

const segments = 56, sides = 20;
const up = new THREE.Vector3(0,1,0);
const sculptScale = 1.8;
const joint = new THREE.Vector3(.43,.39,-.25);
const mouthVertex = 47572, jawVertex = 61380;
const orbitTime = 4.3;
const aimTime = .85;

function part(skin: THREE.SkinnedMesh, triangles: number[]): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  for (const name of ['position','normal','uv']) g.setAttribute(name,skin.geometry.getAttribute(name));
  g.setIndex(triangles);
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.8);
  const mesh = new THREE.Mesh(g, skin.material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Distances along one continuous track run from the resting tail, through the
// neck, around the cloud and back to the attack position. Each ring follows the
// exact route that the head took, delayed by its distance along the body.
export class DragonFlight {
  progress = 0;
  private elapsed = 0;
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
    [-2.5,3.65,-2.65],[-.5,3.85,-3.15],[1,3.55,-2.05],[.45,3.35,-.72],[0,3.4,.15]
  ].map(v=>new THREE.Vector3(...v)));
  private readonly coilLength = this.coil.getLength();
  private readonly lapLength = this.lap.getLength();
  private readonly centers = Array.from({length:segments+1},()=>new THREE.Vector3());
  private readonly positions = new THREE.Float32BufferAttribute(new Float32Array((segments+1)*(sides+1)*3),3);
  private readonly normals = new THREE.Float32BufferAttribute(new Float32Array(this.positions.array.length),3);
  private readonly tangent = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly vertical = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly nose = new THREE.Vector3();
  private readonly jaw = new THREE.Vector3();
  private startYaw = 0;
  private aimYaw = 0;
  private hovering = 0;

  constructor(private readonly root: THREE.Group, private readonly skin: THREE.SkinnedMesh, mask: Uint8Array, scales: THREE.Texture) {
    const index=skin.geometry.index!;
    if(mask.length!==Math.ceil(index.count/12)) throw new Error('Dragon flight mask does not match sculpt');
    const head:number[]=[], cloud:number[]=[];
    for(let t=0;t<index.count/3;t++){
      const kind=mask[t>>2]>>(2*(t%4))&3;
      const bucket=kind===1?head:kind===2?cloud:null;
      if(bucket) bucket.push(index.getX(t*3),index.getX(t*3+1),index.getX(t*3+2));
    }
    this.headMesh=part(skin,head);
    this.headMesh.position.copy(joint).multiplyScalar(-sculptScale);
    this.headMesh.scale.setScalar(sculptScale);
    this.head.add(this.headMesh);
    this.cloud=part(skin,cloud);
    // Reconstruct the surface that the coiled body concealed.
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1,32,12),
      new THREE.MeshStandardMaterial({color:0xc5b8aa,roughness:.97}));
    crown.scale.set(.77,.14,.73); crown.position.y=-.7;
    this.cloud.add(crown);
    this.group.add(this.cloud,this.head);
    const g=new THREE.BufferGeometry(),indices:number[]=[],uv:number[]=[],colors:number[]=[];
    for(let i=0;i<=segments;i++) for(let j=0;j<=sides;j++){
      uv.push(j/sides,i/segments*3.2);
      const belly=Math.max(0,-Math.sin(j/sides*Math.PI*2));
      colors.push(1,.82+.18*belly,.78+.22*belly);
      const k=i*(sides+1)+j;
      if(i<segments&&j<sides)indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);
    }
    g.setIndex(indices);g.setAttribute('position',this.positions.setUsage(THREE.DynamicDrawUsage));g.setAttribute('normal',this.normals.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    scales.wrapS=scales.wrapT=THREE.RepeatWrapping;scales.colorSpace=THREE.SRGBColorSpace;
    const body=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:scales,vertexColors:true,roughness:.68,side:THREE.DoubleSide}));
    body.frustumCulled=false;body.castShadow=body.receiveShadow=true;
    this.group.add(body);root.add(this.group);this.group.visible=false;
  }

  warm(renderer:THREE.WebGLRenderer,camera:THREE.Camera,scene:THREE.Scene,scales:THREE.Texture){
    renderer.initTexture(scales);
    void renderer.compileAsync(this.group,camera,scene).catch(()=>{});
  }

  private draw(distance:number) {
    for(let i=0;i<=segments;i++){
      const d=distance-this.coilLength*i/segments, p=this.centers[i];
      if(d<0)this.coil.getPointAt(Math.max(0,1+d/this.coilLength),p);
      else this.lap.getPointAt(Math.min(1,d/this.lapLength),p);
      if(this.hovering>0){p.y+=.14*Math.sin(this.hovering*2.9-i*.12)*Math.min(1,this.hovering);p.x+=.17*Math.sin(this.hovering*2-i*.13)*i/segments*Math.min(1,this.hovering)}
    }
    for(let i=0;i<=segments;i++){
      const p=this.centers[i],u=i/segments;
      this.tangent.subVectors(this.centers[Math.max(0,i-1)],this.centers[Math.min(segments,i+1)]).normalize();
      this.right.crossVectors(up,this.tangent).normalize();this.vertical.crossVectors(this.tangent,this.right);
      const radius=.38*Math.pow(1-u,.56)+.015;
      for(let j=0;j<=sides;j++){
        const a=j/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a),n=i*(sides+1)+j;
        const ridge=Math.pow(Math.max(s,0),18)*(.05+.13*(i%3===0?1:0))*(1-u);
        this.direction.copy(this.right).multiplyScalar(c).addScaledVector(this.vertical,s);
        this.normals.setXYZ(n,this.direction.x,this.direction.y,this.direction.z);
        this.positions.setXYZ(n,p.x+radius*this.direction.x+ridge*this.vertical.x,p.y+radius*this.direction.y+ridge*this.vertical.y,p.z+radius*this.direction.z+ridge*this.vertical.z);
      }
    }
    this.positions.needsUpdate=this.normals.needsUpdate=true;
    this.head.position.copy(this.centers[0]);
    this.direction.subVectors(this.centers[0],this.centers[1]);
    return Math.atan2(this.direction.x,this.direction.z);
  }

  update(dt:number,phase:boolean,target:THREE.Vector3){
    if(!phase){this.elapsed=this.progress=this.hovering=0;this.group.position.y=0;this.head.rotation.x=0;this.group.visible=false;this.skin.visible=true;return}
    if(!this.group.visible){
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
    const yaw=this.draw(this.lapLength*THREE.MathUtils.smootherstep(lap,0,1));
    if(lap<1)this.aimYaw=yaw;
    else if(this.progress<1||this.elapsed-dt<orbitTime+aimTime){
      const p=this.group.localToWorld(this.nose.copy(this.head.position));
      const desired=Math.atan2(target.x-p.x,target.z-p.z)-this.startYaw;
      const turn=THREE.MathUtils.euclideanModulo(desired-yaw+Math.PI,2*Math.PI)-Math.PI;
      this.aimYaw=yaw+turn*THREE.MathUtils.smoothstep(this.hovering/aimTime,0,1);
    }
    this.head.rotation.y=this.aimYaw+Math.PI/4;
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
    this.head.rotation.y=this.aimYaw+Math.PI/4;
    return this.origin(out);
  }
}
