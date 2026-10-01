"""Small code-native waveform icon. No third-party raster assets."""
import math,struct,zlib
from pathlib import Path
def png(size):
    rows=[]
    for y in range(size):
        row=bytearray()
        for x in range(size):
            nx=(x+.5)/size;ny=(y+.5)/size
            radius=.18;dx=max(.08-nx,0,nx-.92);dy=max(.08-ny,0,ny-.92)
            alpha=255 if dx*dx+dy*dy<radius*radius and .04<nx<.96 and .04<ny<.96 else 0
            color=(20,36,44,alpha)
            for center,h in ((.28,.22),(.42,.46),(.56,.65),(.70,.36)):
                if abs(nx-center)<.035 and abs(ny-.50)<h/2:color=(114,215,194,255)
            row.extend(color)
        rows.append(b'\0'+row)
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
root=Path(__file__).resolve().parents[1]
sizes=(16,32,48,64,128,256);images=[png(size) for size in sizes];offset=6+16*len(sizes);directory=[]
for size,data in zip(sizes,images):
    directory.append(struct.pack('<BBBBHHII',size%256,size%256,0,0,1,32,len(data),offset));offset+=len(data)
(root/'desktop/icon.ico').write_bytes(struct.pack('<HHH',0,1,len(sizes))+b''.join(directory)+b''.join(images))
