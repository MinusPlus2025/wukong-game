"""Infer shallow, band-limited surface relief from authored prop albedo atlases."""
from pathlib import Path
from PIL import Image,ImageFilter,ImageChops,ImageOps
import json,struct,io
for name in ('live-opt/cliff-rock','live-opt/moss-rock','live-opt/mountain-gate','live-opt/guardian-statue','live-opt/peach-branch','wukong-animated','yaoguai-guard-rigged'):
 with (Path('public/models')/(name+'.glb')).open('rb') as f:
  f.seek(12);size,_=struct.unpack('<II',f.read(8));doc=json.loads(f.read(size));f.read(8);binary=f.read()
 mat=next((m for m in doc['materials'] if 'baseColorTexture' in m.get('pbrMetallicRoughness',{})),None)
 if not mat:continue
 texture=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]
 src=texture.get('source',next((v['source'] for v in texture.get('extensions',{}).values() if 'source' in v),0))
 view=doc['bufferViews'][doc['images'][src]['bufferView']];a=view.get('byteOffset',0)
 im=ImageOps.grayscale(Image.open(io.BytesIO(binary[a:a+view['byteLength']])));im.thumbnail((768,768),Image.Resampling.LANCZOS)
 im=ImageChops.subtract(im.filter(ImageFilter.GaussianBlur(.65)),im.filter(ImageFilter.GaussianBlur(4)),offset=128)
 x=ImageChops.subtract(ImageChops.offset(im,1,0),ImageChops.offset(im,-1,0),offset=128)
 y=ImageChops.subtract(ImageChops.offset(im,0,-1),ImageChops.offset(im,0,1),offset=128)
 Image.merge('RGB',(x,y,Image.new('L',im.size,254))).save(Path('public/textures/art')/(Path(name).name+'.jpg'),quality=90,subsampling=0)
