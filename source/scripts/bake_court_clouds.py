"""Bake the licensed Kloofendal HDR sky into the court dome. Requires Pillow and FFmpeg."""
from pathlib import Path
from math import cos, pi
import subprocess
import sys
from array import array
from PIL import Image

source, destination = map(Path, sys.argv[1:3])
width, height = map(int, subprocess.check_output([
    'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0:s=x', str(source)
]).decode().strip().split('x'))
planes = array('f', subprocess.check_output([
    'ffmpeg', '-v', 'error', '-i', str(source), '-frames:v', '1', '-f', 'rawvideo',
    '-pix_fmt', 'gbrpf32le', '-'
]))
size = width * height
sky = Image.new('RGB', (width, height))
pixels = sky.load()
for y in range(height):
    latitude = 1 - 2 * y / (height - 1)
    # Keep the camera above the cloud deck and exclude the photographed ground.
    row = round(height * (0.46 - 0.46 * latitude if latitude >= 0 else 0.46 - 0.35 * abs(latitude)**0.68))
    mist = 0.78 * max(0, 1 - abs(latitude) / 0.17)**2
    for x in range(width):
        u = x if latitude >= 0 else (width - x + width // 3) % width
        idx = row * width + u
        rgb = []
        for channel, plane in enumerate((2, 0, 1)):
            linear = max(0, planes[plane * size + idx]) * 1.05
            mapped = (linear / (0.85 + linear))**(1 / 2.2)
            value = mapped * (0.94, 0.97, 1.00)[channel]
            rgb.append(round(255 * (value * (1 - mist) + (0.72, 0.78, 0.82)[channel] * mist)))
        pixels[x, y] = tuple(rgb)
sky.save(destination, quality=94, subsampling=0, optimize=True)
