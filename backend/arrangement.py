import math, random
from uuid import uuid4
from .models import NoteEvent, Track, StylePreset

def arrange_track(track: Track, preset: StylePreset, strength: float, bpm: float,
                  seed: int, duration: float, is_lead: bool, chords=None):
    rng=random.Random(seed)
    out=track.model_copy(deep=True)
    source=track.sourceNotes or track.notes
    out.sourceNotes=[n.model_copy(deep=True) for n in source]
    out.notes=[]
    out.mode="notes"
    out.program=preset.programs.get(track.instrument,track.program)
    out.timbre=preset.timbres.get(track.instrument,"")
    out.style=preset.id
    if track.mode=="audio": out.originalAsset=track.asset
    beat=60/bpm
    for i,n in enumerate(sorted(source,key=lambda x:(x.start,x.pitch))):
        note=n.model_copy(deep=True)
        note.id=str(uuid4())
        # Melody anchors remain at their original pitch and onset in every preset.
        if not is_lead and track.instrument!="drums":
            if preset.id=="japanese" and i%3==2 and rng.random()<strength*.55: continue
            if track.instrument in ("piano","guitar"):
                note.start=min(duration-.01,n.start + (i%3)*beat*.1*strength)
                note.duration=max(.04,n.duration*(1-.35*strength))
            if i%2 and preset.swing: note.start=min(duration-.01,note.start+beat*preset.swing*strength)
        accent=[1,.72,.86,.74][int(note.start/beat)%4]
        note.velocity=max(1,min(127,round(n.velocity*(1-strength*.25+accent*strength*.25))))
        note.duration=min(note.duration,max(.01,duration-note.start))
        out.notes.append(note)
        if track.instrument=="drums": continue
        # Add ornamental articulations, never remap the source melody to another scale.
        if strength>0 and n.duration>beat*.45 and rng.random()<preset.ornament*strength:
            if preset.id=="russian":
                gap=beat*.125
                for j in range(1,min(5,int(n.duration/gap))):
                    start=n.start+j*gap
                    if start>=duration: break
                    out.notes.append(NoteEvent(pitch=n.pitch,start=start,duration=min(gap*.7,duration-start),
                        velocity=max(1,int(n.velocity*.65))))
            else:
                interval=rng.choice([2,5,7]) if preset.id=="chinese" else (2 if preset.id=="japanese" else 1)
                start=n.start+min(n.duration*.65,beat*.4)
                if start<duration:
                    out.notes.append(NoteEvent(pitch=min(127,n.pitch+interval),start=start,
                        duration=min(beat*.15,duration-start),velocity=max(1,int(n.velocity*.6))))
    if track.instrument=="drums":
        # Density/re-accent changes are restricted to the selected drum track.
        out.notes=[n for i,n in enumerate(out.notes)
            if n.pitch in (35,36,38,40) or rng.random() < 1-strength*(1-preset.density)]
    # Contextual chord tones live only in an already selected accompaniment track.
    if not is_lead and track.instrument in ("guitar","piano") and strength>.2:
        for chord in (chords or []):
            start=float(chord["start"])
            end=min(float(chord["end"]),duration)
            if start>=end: continue
            root=int(chord["root"])
            third=3 if chord["quality"]=="minor" else 4
            tones=[48+root,48+root+third,48+root+7]
            spacing=beat*(.5 if preset.id in ("chinese","japanese") else .25)
            for j,pitch in enumerate(tones):
                onset=start+j*spacing
                if onset<end:
                    out.notes.append(NoteEvent(pitch=pitch,start=onset,duration=min(beat*.45,end-onset),
                        velocity=int(45+25*strength)))
    if preset.id=="scottish" and is_lead and out.notes and strength>.2:
        lowest=min(n.pitch for n in source)
        out.notes.append(NoteEvent(pitch=max(24,lowest-12),start=0,
            duration=max(.01,duration),velocity=round(25+25*strength)))
    out.notes.sort(key=lambda x:(x.start,x.pitch))
    return out

def estimate_chords(notes, bpm, duration, key="C"):
    if not notes: return []
    width=4*60/bpm
    result=[]
    for start_index in range(math.ceil(duration/width)):
        start=start_index*width
        weights=[0.0]*12
        for n in notes:
            overlap=max(0,min(n.start+n.duration,start+width)-max(n.start,start))
            weights[n.pitch%12]+=overlap*n.velocity
        if not any(weights): continue
        candidates=[(sum(weights[(root+i)%12] for i in intervals),root,quality)
           for root in range(12) for intervals,quality in [([0,4,7],"major"),([0,3,7],"minor")]]
        _,root,quality=max(candidates)
        result.append({"start":start,"end":min(duration,start+width),"root":root,"quality":quality})
    return result
