// Original score and environmental details. Render offline; no synth or key needed in the browser.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wukong-score-'));
const out='public/audio/chapters'; fs.mkdirSync(out,{recursive:true});
const sr=24000, tau=2*Math.PI;
const pitches=[[62,69,74,76,69,67,64,62],[38,38,39,45,38,41,39,36],[59,66,73,78,71,66,61,54]];
let seed=12321;
const noise=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2147483648)-1;
for (const [c,name] of ['forest','fire','heaven'].entries()){
 const beat=[.46,.52,.64][c], bars=8, cycle=beat*4*bars;
 for(const kind of ['score','phase','air','arrival','shift']){
  const length=kind==='arrival'?1.38:kind==='shift'?1.75:cycle;
  const n=Math.round(sr*length), left=new Float32Array(n),right=new Float32Array(n);
  function note(at,midi,dur,amp,pan,voice){
   const f=440*2**((midi-69)/12);
   for(let i=0;i<dur*sr;i++){
    const t=i/sr, j=(Math.round(at*sr)+i)%n, a=tau*f*t;
    const fade=Math.min(1,t/.006,(dur-t)/.025);
    let v;
    if(voice==='pluck')v=(Math.sin(a)+.42*Math.sin(2*a)*Math.exp(-9*t)+.24*Math.sin(3*a))*Math.exp(-4.5*t);
    else if(voice==='drum')v=(Math.sin(a+8*(1-Math.exp(-32*t)))+.18*noise()*Math.exp(-65*t))*Math.exp(-7*t);
    else if(voice==='bell')v=(Math.sin(a)+.46*Math.sin(2.71*a)*Math.exp(-3*t)+.16*Math.sin(4.16*a))*Math.exp(-2.3*t);
    else if(voice==='bird')v=Math.sin(a+30*t*t)*Math.sin(Math.PI*t/dur)**2;
    else v=(Math.sin(a)+.2*Math.sin(2*a))*(.75+.25*Math.sin(19*t))*Math.sin(Math.PI*t/dur)**2;
    left[j]+=v*fade*amp*Math.sqrt((1-pan)/2);right[j]+=v*fade*amp*Math.sqrt((1+pan)/2);
   }
  }
  const voice=['pluck','drum','bell'][c];
  for(let bar=0;bar<bars && ['score','phase','air'].includes(kind);bar++){
   const off=bar*4*beat, m=pitches[c][bar];
   if(kind==='score'){
    const rhythm=[[0,1.5,2.25],[0,.75,2,3.5],[0,2.5]][c];
    rhythm.forEach((b,i)=>note(off+b*beat,m+[0,7,2,0][i],c===2?1.65:.78,i===0?.43:.26,i%2?.35:-.28,voice));
    if(c!==1 && bar%2===0)note(off+beat,m-12,2*beat,.22,.26,'breath');
    if(c===1)note(off+beat*.5,m+12,2.8*beat,.24,-.24,'breath');
   } else if(kind==='phase'){
    [0,1.5,2.75].forEach((b,i)=>note(off+b*beat,m+(c===1?-2:12),.41,i===0?.33:.20,i%2?.34:-.2,c===1?'drum':voice));
   } else {
    if(c===0 && bar%2===0){note(off+.18,91,.11,.17,-.7,'bird');note(off+.36,95,.14,.11,.58,'bird')}
    if(c===1)for(let i=0;i<8;i++)note(off+Math.abs(noise())*beat*4,52+noise()*15,.06,.13+Math.abs(noise())*.15,noise()*.7,'drum');
    if(c===2 && bar%3===0)note(off+.9,84,1.7,.14,.68,'bell');
   }
  }
  if(kind==='arrival'||kind==='shift'){
   const seq=kind==='arrival'?[0,7]:[7,3,0];
   seq.forEach((v,i)=>note(i*(kind==='arrival'?.36:.25),pitches[c][0]+v,.8,.46,i%2?.3:-.3,voice));
  }
  const wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);
  for(let i=0;i<n;i++)for(const [ch,a] of [left,right].entries())wav.writeInt16LE(Math.round(32767*Math.tanh(a[i])),44+i*4+ch*2);
  const file=path.join(tmp,'layer.wav');fs.writeFileSync(file,wav);
  const args=['-y','-loglevel','error','-i',file];
  if(kind==='air')args.push('-stream_loop','-1','-i','public/audio/ambient/'+name+'.mp3','-filter_complex','[1:a]volume='+[0,9,1][c]+'dB[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0,afade=t=in:d=0.18,afade=t=out:st='+(length-.2)+':d=0.2');
  execFileSync('ffmpeg',[...args,'-ar','44100','-b:a','112k',out+'/'+name+'-'+kind+'.mp3']);
 }
}
fs.rmSync(tmp,{recursive:true});
