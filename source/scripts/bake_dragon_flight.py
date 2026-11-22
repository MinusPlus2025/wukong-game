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
    head = y>.31 or (y>.165 and x-z<.23)
    cloud = y<-.25 and r-g<41 and g-b<51 and g>58 and r-g<.27*g
    kinds.append(1 if head else 2 if cloud else 0)
bits = bytearray(math.ceil(len(indices)/48))
for i, triangle in enumerate(struct.iter_unpack('<III',indices)):
    membership = sorted(kinds[k] for k in triangle)[1]
    bits[i//4] |= membership << (2*(i%4))
(model.parent/'dragon-flight-seam.mask').write_bytes(bits)
# Clip an actual neck segment; preserve original UVs, normal field and PBR maps.
# Adjacent mirrored instances meet on the identical boundary contour.
read_normals = attrs['NORMAL']
with tempfile.TemporaryDirectory() as temp:
    subprocess.run(['node','--input-type=module','-e',decoder,str(model),temp,str(read_normals)],cwd=root,check=True)
    normals=list(struct.iter_unpack('<bbbx',(Path(temp)/str(read_normals)).read_bytes()))
points=[tuple(v/32767 for v in row) for row in struct.iter_unpack('<hhhxx',xyz)]
coords=[tuple(v/65535 for v in row) for row in struct.iter_unpack('<HH',uvs)]
low,high=.115,.31
fringe=[]
head_edge=set()
body_edge=set()
cache, vertices, faces={},[],[]
def clip(poly,height,sign):
    out=[]
    for i,b in enumerate(poly):
        a=poly[i-1];va=(a[1]-height)*sign;vb=(b[1]-height)*sign
        if (va<0)!=(vb<0):
            t=va/(va-vb);out.append(tuple(x+(y-x)*t for x,y in zip(a,b)))
        if vb>=0:out.append(b)
    return out
for it,tri in enumerate(struct.iter_unpack('<III',indices)):
    pp=[points[k] for k in tri]
    if max(v[1] for v in pp)<low or min(v[1] for v in pp)>high or max(v[0] for v in pp)<.16:continue
    # Isolated neck island throughout this vertical band.
    if sum(v[0]-v[2] for v in pp)/3<.17:continue
    poly=[(*points[k],*(v/127 for v in normals[k]),*coords[k]) for k in tri]
    if min(v[1] for v in pp)<high<max(v[1] for v in pp):
        # Both sides are clipped from one triangle with the same interpolation.
        bits[it//4] &= ~(3 << (2*(it%4)))
        tip=clip(poly,high,1)
        for v in tip:
            if abs(v[1]-high)<1e-7:head_edge.add(struct.pack('<8f',*v))
        for k in range(2,len(tip)):fringe.extend([tip[0],tip[k-1],tip[k]])
    poly=clip(poly,low,1)
    if poly:poly=clip(poly,high,-1)
    ids=[]
    for v in poly:
        key=struct.pack('<8f',*v)
        if abs(v[1]-high)<1e-7:body_edge.add(key)
        if key not in cache:cache[key]=len(vertices);vertices.append(key)
        ids.append(cache[key])
    for k in range(2,len(ids)):faces.extend([ids[0],ids[k-1],ids[k]])
assert len(vertices)<65536
(model.parent/'dragon-flight-seam.bin').write_bytes(struct.pack('<II',len(vertices),len(faces))+b''.join(vertices)+struct.pack('<'+'H'*len(faces),*faces))
print('Neck patch:',len(vertices),'vertices,',len(faces)//3,'triangles')

assert head_edge and head_edge==body_edge, 'Mismatched positions, UVs or normals along neck seam'
print('Matched boundary samples:',len(head_edge))
(model.parent/'dragon-flight-seam.mask').write_bytes(bits)
with (model.parent/'dragon-flight-seam.bin').open('ab') as out:
    out.write(bytes((-out.tell())%4))
    for v in fringe:out.write(struct.pack('<8f',*v))
