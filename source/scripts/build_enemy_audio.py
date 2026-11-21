"""Build the eleven remaining performances and six original impact surfaces."""
from pathlib import Path
import math, random, struct, subprocess, tempfile, wave
base = Path('public/audio')
out = base / 'battle-voices'
out.mkdir(exist_ok=True)
# source range, pitch (cents), tempo, relative dB and following rest (seconds)
lines = {
 'low-hp':[(.15,.79,-85,.89,-1,.35),(1.03,1.83,-35,.97,-3,.10)],
 'victory':[(.15,.74,70,1.07,-1,.13),(.93,1.67,28,1.13,1,.09)],
 'ending-good':[(.13,1.08,-32,.94,-1,.28),(1.32,2.31,-10,.90,-2,.22)],
 'ending-bad':[(.12,1.67,-112,.88,-2,.20)],
 'death':[(.14,.87,-80,.88,0,.36),(1.01,1.64,-100,.85,-4,.2)],
 'choice':[(.14,.80,-18,.96,-1,.22),(1.01,2.04,30,.96,0,.12)],
 'phase':[(.15,1.10,-40,1.04,0,.08)], 'ding':[(.14,.58,-20,1.06,0,.04)],
 'dodge':[(.14,.60,80,1.15,0,.035)], 'fan':[(.15,.74,45,.96,0,.09)],
 'combo':[(0,.5618,50,1.07,0,.035)]}
def sox(*args):
 subprocess.run(['sox',*map(str,args)],check=True)
for key,segments in lines.items():
 with tempfile.TemporaryDirectory() as tmp:
  parts=[]
  for i,(a,b,pitch,tempo,gain,pause) in enumerate(segments):
   part=Path(tmp)/f'{i}.wav'
   sox(base/'voice-wukong'/f'{key}.wav',part,'trim',a,b-a,'gain',-5,'pitch',pitch,'tempo','-s',tempo,'gain',gain,'fade','t',.003,0,.014,'pad',0,pause)
   parts.append(part)
  sox(*parts,out/f'{key}.wav','gain','-n',-5 if key in ('low-hp','death','ending-bad') else -3)
# Each layer models a different contact after the common staff transient.
for seed,key in enumerate(['hide','bone','gel','bronze','horn','scale']):
 rng=random.Random(seed); samples=[]; low=0
 for i in range(21600):
  t=i/48000; noise=rng.uniform(-1,1); low+=.08*(noise-low)
  def mode(freq,tail):return math.sin(2*math.pi*freq*t)*math.exp(-t/tail)
  def bounce(delay,freq,tail):
   u=t-delay
   return math.sin(2*math.pi*freq*u)*math.exp(-u/tail) if u>=0 else 0
  if key=='hide': y=.65*mode(108,.041)+low*math.exp(-t/.05)
  elif key=='bone': y=.55*mode(1470,.012)+.4*bounce(.022,970,.015)+.24*bounce(.05,1820,.011)
  elif key=='gel': y=.72*math.sin(2*math.pi*(68*t+4.4*(1-math.exp(-t/.032))))*math.exp(-t/.09)+.18*bounce(.068,280,.025)
  elif key=='bronze': y=.58*mode(520,.14)+.31*mode(1383,.082)+.17*mode(2170,.034)
  elif key=='horn': y=.72*mode(86,.11)+.32*mode(370,.044)+low*math.exp(-t/.035)
  else: y=.38*mode(820,.041)+.33*bounce(.016,1190,.04)+.29*bounce(.034,1680,.028)+noise*.14*math.exp(-t/.049)
  samples.append(y*min(1,i/10))
 peak=max(map(abs,samples))
 with wave.open(str(out/f'{key}.wav'),'wb') as f:
  f.setparams((1,2,48000,0,'NONE','not compressed'));f.writeframes(struct.pack('<%dh'%len(samples),*(round(v/peak*21500) for v in samples)))
