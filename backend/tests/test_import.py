from pathlib import Path
import numpy as np
import soundfile as sf
import pytest
from backend.audio import import_audio,ffmpeg
from backend.config import project_root

@pytest.mark.parametrize('ext,codec',[('wav','pcm_s16le'),('mp3','libmp3lame'),('flac','flac'),('m4a','aac')])
def test_real_decoders_and_unicode_path(tmp_path,ext,codec):
    source=Path(__file__).resolve().parents[2]/'output/fixtures/reference-mix.wav'
    if not source.exists():pytest.skip('run scripts/render-fixture.mjs for audio codec validation')
    target=tmp_path/('中文路径曲目.'+ext)
    ffmpeg(['-y','-i',str(source),'-t','1','-ar','22050','-ac','1','-c:a',codec,str(target)])
    project=import_audio(str(target))
    assert .9<project.duration<1.2
    audio,sr=sf.read(project_root(project.id)/project.original,always_2d=True)
    assert sr==44100 and audio.shape[1]==2 and np.max(np.abs(audio))>.001

def test_corrupt_and_oversize_input(tmp_path):
    corrupt=tmp_path/'损坏.wav';corrupt.write_bytes(b'broken audio')
    with pytest.raises(ValueError):import_audio(str(corrupt))
    huge=tmp_path/'超过大小.mp3'
    with huge.open('wb') as f:f.truncate(500*1024**2+1)
    with pytest.raises(ValueError):import_audio(str(huge))

def test_reject_longer_than_ten_minutes(tmp_path):
    long=tmp_path/'时长超限.wav'
    sf.write(long,np.zeros(601*8000,dtype='float32'),8000,subtype='PCM_16')
    with pytest.raises(ValueError):import_audio(str(long))
