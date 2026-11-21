from pathlib import Path
import subprocess as sp,struct,random,math,wave,tempfile
root=Path('public/audio');dst=root/'staff-performance';dst.mkdir(exist_ok=True)
def sox(*args):sp.run(['sox',*map(str,args)],check=True)
def voice(name,pieces):
 with tempfile.TemporaryDirectory() as wd:
  parts=[]
  for i,(start,end,pitch,tempo,gain,pause) in enumerate(pieces):
   f=Path(wd)/f'{i}.wav';sox(root/'voice-wukong'/f'{name}.wav',f,'trim',start,end-start,'gain','-5','pitch',pitch,'tempo','-s',tempo,'gain',gain,'fade','t','.004','0','.012','pad','0',pause);parts.append(f)
  sox(*parts,dst/f'{name}.wav','gain','-n','-3')
voice('boss-intro',[(.16,.79,55,.97,-2,.11),(.948,1.69,-45,1.13,0,.08)])
voice('heavy',[(.15,.55,-65,1.06,0,.05)])
voice('start',[(.15,1.21,30,1.045,0,.09)])
for name,base,decay,noise,seed in [('tap',195,.105,.29,1),('thrust',275,.074,.43,2),('crusher',103,.17,.37,3)]:
 rng=random.Random(seed);data=[];prev=0
 for i in range(21600):
  t=i/48000;n=rng.uniform(-1,1);click=(n-prev)*noise*math.exp(-t/.0035);prev=n
  metal=sum(a*math.sin(2*math.pi*base*r*t)*math.exp(-t/(decay/d)) for r,a,d in [(1,.4,1),(2.76,.18,2),(5.38,.13,2.8),(9.12,.055,4)])
  data.append((metal+click)*min(1,i/9))
 peak=max(map(abs,data))
 with wave.open(str(dst/f'{name}.wav'),'wb') as out:
  out.setparams((1,2,48000,0,'NONE','not compressed'));out.writeframes(struct.pack('<%dh'%len(data),*(round(v/peak*22000) for v in data)))
