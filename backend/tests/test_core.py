import io,json,zipfile
from pathlib import Path
import mido
import pytest
from pydantic import ValidationError
from backend.models import Project,Track,NoteEvent,TempoPoint,ControlEvent
from backend.storage import save_project,archive_project,open_archive,load_project
from backend.config import project_root,safe_path
from backend.arrangement import arrange_track,estimate_chords
from backend.presets import PRESETS
from backend.midi import export_midi,seconds_to_ticks
from backend.server import app,TOKEN
from fastapi.testclient import TestClient

def melody():
    return Track(name="钢琴",instrument="piano",notes=[
      NoteEvent(pitch=60,start=0,duration=.8,velocity=90),
      NoteEvent(pitch=64,start=1,duration=.8,velocity=80),
      NoteEvent(pitch=67,start=2,duration=.8,velocity=100)])

def test_arrangements_keep_melody_and_seed():
    t=melody()
    for preset in PRESETS:
      first=arrange_track(t,preset,1,120,42,4,True)
      second=arrange_track(t,preset,1,120,42,4,True)
      assert [(n.pitch,n.start,n.duration,n.velocity) for n in first.notes]==[(n.pitch,n.start,n.duration,n.velocity) for n in second.notes]
      assert all(any(n.pitch==original.pitch and n.start==original.start for n in first.notes) for original in t.notes)
      assert [(n.pitch,n.start) for n in t.notes]==[(60,0),(64,1),(67,2)]
      assert all(n.duration>0 and n.start+n.duration<=4.001 for n in first.notes)

def test_zero_strength_leaves_notes():
    t=melody()
    result=arrange_track(t,PRESETS[0],0,120,42,4,True)
    assert [(n.pitch,n.start,n.duration,n.velocity) for n in result.notes]==[(n.pitch,n.start,n.duration,n.velocity) for n in t.notes]

def test_chord_estimation():
    notes=[NoteEvent(pitch=p,start=0,duration=1,velocity=90) for p in (60,64,67)]
    assert estimate_chords(notes,120,2)[0]["root"]==0
    assert estimate_chords(notes,120,2)[0]["quality"]=="major"

def test_midi_tempo_and_sustain(tmp_path):
    t=melody();t.controls=[ControlEvent(time=.3,controller=64,value=127),ControlEvent(time=2.8,controller=64,value=0)]
    p=Project(tracks=[t],tempoMap=[TempoPoint(time=0,bpm=120),TempoPoint(time=1,bpm=60)])
    path=tmp_path/"test.mid";export_midi(p,str(path))
    mid=mido.MidiFile(path)
    time=0;starts=[];controllers=[]
    for msg in mid:
      time+=msg.time
      if msg.type=="note_on":starts.append(round(time,4))
      if msg.type=="control_change" and msg.control==64:controllers.append(msg.value)
    assert starts==[0,1,2]
    assert controllers[:2]==[127,0]
    assert seconds_to_ticks(2,p.tempoMap)==1440

def test_engineering_container_portable(tmp_path):
    p=Project(tracks=[melody()],original="audio/source.wav")
    root=project_root(p.id);(root/"audio").mkdir(parents=True)
    (root/p.original).write_bytes(b"audio-reference")
    path=tmp_path/"作品.mwork";archive_project(p,str(path))
    opened=open_archive(str(path))
    assert opened.id!=p.id
    assert (project_root(opened.id)/opened.original).read_bytes()==b"audio-reference"
    assert opened.tracks[0].notes==p.tracks[0].notes

def test_reject_zip_traversal(tmp_path):
    p=Project(original="../outside.wav")
    path=tmp_path/"malicious.mwork"
    with zipfile.ZipFile(path,"w") as z:
      z.writestr("project.json",p.model_dump_json());z.writestr("../outside.wav",b"evil")
    with pytest.raises(ValueError):open_archive(str(path))
    with pytest.raises(ValueError):safe_path(tmp_path,"../outside.wav")

def test_invalid_notes_are_rejected():
    with pytest.raises(ValidationError):NoteEvent(pitch=128,start=0,duration=1)
    with pytest.raises(ValidationError):NoteEvent(pitch=60,start=float("nan"),duration=1)
    with pytest.raises(ValidationError):NoteEvent(pitch=60,start=0,duration=-1)

def test_service_auth_and_schema():
    with TestClient(app) as client:
      assert client.get("/health").status_code==401
      auth={"x-workbench-token":TOKEN}
      assert client.get("/health",headers=auth).status_code==200
      response=client.post("/projects/new",headers=auth,json={})
      assert response.status_code==200
      p=response.json();p["duration"]=float("inf")
      # Validation must reject the out-of-range duration.
      p["duration"]=1000
      assert client.put("/projects/"+p["id"],headers=auth,json=p).status_code==422
      assert client.get("/audio/"+p["id"]+"/audio/missing.wav",headers=auth).status_code!=200
