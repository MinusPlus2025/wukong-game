import * as THREE from 'three';

export const breathRange = 10;
export const breathCos = .42;

// Both the perfect-dodge window and the impact use the same horizontal sector.
export function insideBreath(origin:THREE.Vector3, yaw:number, target:THREE.Vector3) {
  const x=target.x-origin.x,z=target.z-origin.z,d=Math.hypot(x,z);
  return d<breathRange && (d<.1 || x*Math.sin(yaw)+z*Math.cos(yaw)>d*breathCos);
}

export function prepareBreathTell(material:THREE.MeshBasicMaterial) {
  const charge={value:-1};
  material.userData.breathCharge=charge;
  material.depthWrite=false;
  material.onBeforeCompile=shader=>{
    shader.uniforms.breathCharge=charge;
    shader.vertexShader='varying vec2 tellPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n tellPoint=position.xy;');
    shader.fragmentShader='varying vec2 tellPoint; uniform float breathCharge;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      if(breathCharge>=0.){
        float r=length(tellPoint);
        float edgeDist=min(10.-r,(-tellPoint.y*.907524-abs(tellPoint.x)*.42));
        float outline=1.-smoothstep(.045,.14,edgeDist);
        float timing=1.-smoothstep(.055,.25,abs(r-10.*breathCharge));
        diffuseColor.a*=.11+.85*max(outline,timing);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.77,.36),timing);
      }
    `);
  };
}

export function makeBreathFlame(){
  const material=new THREE.MeshBasicMaterial({color:0xff751d,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const age={value:0};material.userData.flameAge=age;
  material.onBeforeCompile=shader=>{
    shader.uniforms.flameAge=age;
    shader.vertexShader='varying vec3 flamePoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n flamePoint=position;');
    shader.fragmentShader='varying vec3 flamePoint;uniform float flameAge;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float r=length(flamePoint.xz)*.1;
      float a=atan(flamePoint.x,max(.001,flamePoint.z));
      float flow=r*10.-flameAge*13.;
      float tongue=.5+.5*sin(a*25.+1.4*sin(flow-a*8.)+.6*sin(flow*2.+a*17.));
      float core=pow(tongue,3.)*(1.-.55*r);
      float tip=1.-smoothstep(.74,1.,r+.1*(1.-tongue));
      diffuseColor.rgb=mix(vec3(1.,.075,.008),vec3(1.,.86,.40),clamp(core+.75*(1.-smoothstep(0.,.3,r)),0.,1.));
      diffuseColor.a*=tip*(.13+.87*core)*(1.-smoothstep(.14,.46,flameAge));
    `);
  };
  return material;
}
