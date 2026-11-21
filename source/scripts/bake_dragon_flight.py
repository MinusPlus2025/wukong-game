"""Rebuild the flight face mask and scale atlas from the project's licensed dragon.
Run from the source root after npm install, with Python and Pillow installed.
"""
import io
import json
import math
import random
import struct
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
model = root / 'public/models/zhulong-dragon-rigged.glb'
data = model.read_bytes()
length = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20 + length])
binary = data[28 + length:]
primitive = doc['meshes'][0]['primitives'][0]
attrs = primitive['attributes']
view = doc['bufferViews'][doc['images'][0]['bufferView']]
atlas = Image.open(io.BytesIO(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']])).convert('RGB')

decoder = """
import fs from 'node:fs';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const [file, dir, ...ids]=process.argv.slice(1);
const data=fs.readFileSync(file), length=data.readUInt32LE(12);
const gltf=JSON.parse(data.subarray(20,20+length)), bin=data.subarray(28+length);
for(const id of ids){
  const v=gltf.bufferViews[gltf.accessors[id].bufferView], e=v.extensions.EXT_meshopt_compression;
  const dest=Buffer.alloc(v.byteLength);
  MeshoptDecoder.decodeGltfBuffer(dest,e.count,e.byteStride,bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);
  fs.writeFileSync(dir+'/'+id,dest);
}
"""
with tempfile.TemporaryDirectory() as temp:
    ids = [attrs['POSITION'], attrs['TEXCOORD_0'], primitive['indices']]
    subprocess.run(['node','--input-type=module','-e',decoder,str(model),temp,*map(str,ids)],cwd=root,check=True)
    xyz, uvs, indices = [(Path(temp)/str(i)).read_bytes() for i in ids]
kinds = []
for row, uv in zip(struct.iter_unpack('<hhhxx',xyz),struct.iter_unpack('<HH',uvs)):
    x,y,z = (v/32767 for v in row)
    u,v = (v/65535 for v in uv)
    r,g,b = atlas.getpixel((int(u%1*(atlas.width-1)),int(v%1*(atlas.height-1))))
    head = y>.28 and (x-z<.83 or y>.54)
    cloud = y<-.25 and r-g<41 and g-b<51 and g>58 and r-g<.27*g
    kinds.append(1 if head else 2 if cloud else 0)
bits = bytearray(math.ceil(len(indices)/48))
for i, triangle in enumerate(struct.iter_unpack('<III',indices)):
    membership = sorted(kinds[k] for k in triangle)[1]
    bits[i//4] |= membership << (2*(i%4))
(model.parent/'dragon-flight.mask').write_bytes(bits)
rng=random.Random(83);im=Image.new('RGB',(512,512),(73,27,24));d=ImageDraw.Draw(im)
for row in range(-1,34):
 for j in range(-1,18):
  x=j*32+(row%2)*16;y=row*16;k=rng.randint(-12,12)
  d.ellipse((x-17,y-13,x+17,y+13),fill=(103+k,37+k//2,34+k//3),outline=(60,27,27),width=2)
  d.arc((x-15,y-12,x+15,y+10),15,157,fill=(164+k,90+k,63),width=2)
  d.line((x-2,y+6,x,y-3,x+2,y+5),fill=(123+k,54+k//2,43),width=1)
im.save(root/'public/textures/art/dragon-flight-scales.jpg',quality=91)
