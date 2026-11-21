"""Seamless equirectangular sky with layered haze at the playable horizon."""
from PIL import Image
from pathlib import Path
from math import sin,cos,pi
from random import Random
w,h=1536,640
for c,name in enumerate(['forest','fire','heaven']):
 rng=Random(730+c);layers=[]
 for nx,ny in [(9,11),(21,25),(55,60),(127,135)]:
  plane=Image.new('L',(nx,ny));plane.putdata([rng.randrange(256) for _ in range(nx*ny)])
  tiled=Image.new('L',(nx*3,ny));[tiled.paste(plane,(k*nx,0)) for k in range(3)]
  layers.append(tiled.resize((3*w,h),Image.Resampling.BICUBIC).crop((w,0,2*w,h)).load())
 zen,horizon,cloud=[((35,58,68),(157,175,160),(205,202,175)),((49,36,41),(161,90,58),(192,118,78)),((45,64,89),(164,184,193),(221,213,196))][c]
 im=Image.new('RGB',(w,h));pix=im.load()
 for x in range(w):
  angle=2*pi*x/w
  ridges=[.497-.018*k-.024*sin(angle*(3+k)+k)-.016*sin(angle*(7+k)+1.1*k)-.005*cos(angle*21+k) for k in range(3)]
  for y in range(h):
   v=y/(h-1); f=min(1,v/.50)**1.45
   n=sum(layer[x,y]*weight for layer,weight in zip(layers,(.53,.27,.14,.06)))/255
   puff=max(0,min(.66,(n-.39)*2))*min(1,max(0,(.54-v)*10))
   rgb=[(a*(1-f)+b*f)*(1-puff)+d*puff for a,b,d in zip(zen,horizon,cloud)]
   for k in (2,1,0):
    if v>ridges[k]:rgb=[q*(.57+.12*k)+[10,9,12][i] for i,q in enumerate(horizon)]
   pix[x,y]=tuple(int(q) for q in rgb)
 im.save(Path('public/textures/art')/(name+'-sky.jpg'),quality=89)
