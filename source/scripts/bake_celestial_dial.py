"""Bake the gate's stone-and-bronze astronomical dial from the existing marble."""
from pathlib import Path
from math import sin,cos,pi
from PIL import Image,ImageDraw,ImageOps,ImageFilter
root=Path(__file__).resolve().parents[1]/'public/textures'
size=1024
stone=ImageOps.grayscale(Image.open(root/'marble/diff.jpg')).resize((size,size))
base=ImageOps.colorize(ImageOps.autocontrast(stone),(49,62,62),(133,145,134))
metal=Image.new('L',(size,size));d=ImageDraw.Draw(metal);cx=cy=size/2
def xy(radius,theta):
    return (cx+radius*cos(theta),cy+radius*sin(theta))
def ring(r,width):
    d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=239,width=width)
for r,w in [(486,5),(477,2),(454,3),(430,3),(396,2),(319,3),(312,2),(221,2),(119,3),(113,1),(36,4)]:
    ring(r,w)
for i in range(96):
    a=i*pi/48;d.line((xy(455,a),xy(472 if i%4 else 478,a)),fill=245,width=3 if i%4==0 else 2)
for i in range(8):
    a=i*pi/4
    for row in range(3):
        r=344+row*14;split=(i>>row)&1
        for lo,hi in ([(-.13,-.022),(.022,.13)] if split else [(-.13,.13)]):
            d.line([xy(r,a+lo+(hi-lo)*j/12) for j in range(13)],fill=242,width=6)
    for side in (-1,1):
        line=[]
        for n in range(60):
            t=n/59;line.append(xy(140+146*t+12*sin(t*2*pi),a+side*(.08+.18*sin(t*pi))))
        d.line(line,fill=214,width=3)
    for r,off in [(157,.06),(198,.18),(246,.10),(283,.02)]:
        x,y=xy(r,a+off);d.ellipse((x-4,y-4,x+4,y+4),fill=250)
for i in range(16):
    a=(i+.5)*pi/8;d.line((xy(401,a),xy(429,a)),fill=164,width=2)
bronze=ImageOps.colorize(ImageOps.autocontrast(stone),(104,77,48),(199,172,111))
shadow=metal.filter(ImageFilter.GaussianBlur(2))
base=Image.composite(Image.new('RGB',base.size,(45,47,40)),base,shadow)
Image.composite(bronze,base,metal).save(root/'art/celestial-dial.jpg',quality=92)
metal.save(root/'art/celestial-dial-height.png',optimize=True)
