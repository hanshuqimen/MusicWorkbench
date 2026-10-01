import math, random
from uuid import uuid4
from .models import NoteEvent, Track, StylePreset

def arrangement_role(instrument):
    if instrument in ("bass","cello"): return "bass"
    if instrument in ("guitar","harp","koto","shamisen"): return "guitar"
    return "drums" if instrument=="drums" else "piano"

EXTENDED_STYLES={"jazz","blues","rock","bossa","waltz","ambient"}

def arrange_track(track: Track, preset: StylePreset, strength: float, bpm: float,
                  seed: int, duration: float, is_lead: bool, chords=None):
    rng=random.Random(seed)
    out=track.model_copy(deep=True)
    source=track.sourceNotes or track.notes
    out.sourceNotes=[n.model_copy(deep=True) for n in source]
    out.notes=[]
    out.mode="notes"
    role=arrangement_role(track.instrument)
    out.program=preset.programs.get(track.instrument,preset.programs.get(role,track.program))
    out.timbre=preset.timbres.get(track.instrument,preset.timbres.get(role,""))
    out.style=preset.id
    if track.mode=="audio": out.originalAsset=track.asset
    if not source: return out
    beat=60/bpm
    for i,n in enumerate(sorted(source,key=lambda x:(x.start,x.pitch))):
        note=n.model_copy(deep=True)
        note.id=str(uuid4())
        # Melody anchors remain at their original pitch and onset in every preset.
        if not is_lead and role!="drums":
            if preset.id=="japanese" and i%3==2 and rng.random()<strength*.55: continue
            if role in ("piano","guitar"):
                note.start=min(duration-.01,n.start + (i%3)*beat*.1*strength)
                note.duration=max(.04,n.duration*(1-.35*strength))
            if i%2 and preset.swing: note.start=min(duration-.01,note.start+beat*preset.swing*strength)
            if preset.id=="ambient": note.duration=min(max(note.duration,beat*2*strength),duration-note.start)
        accents={"jazz":[.82,1,.78,1],"blues":[1,.8,.9,.8],"rock":[.82,1,.82,1],"bossa":[1,.7,.82,.76],"waltz":[1,.67,.73],"ambient":[.55,.6,.55,.6]}
        pattern=accents.get(preset.id,[1,.72,.86,.74])
        accent=pattern[int(note.start/beat)%len(pattern)]
        note.velocity=max(1,min(127,round(n.velocity*(1-strength*.25+accent*strength*.25))))
        note.duration=min(note.duration,max(.01,duration-note.start))
        out.notes.append(note)
        if role=="drums": continue
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
                interval=rng.choice([2,5,7]) if preset.id=="chinese" else (2 if preset.id=="japanese" else rng.choice([3,6]) if preset.id=="blues" else 12 if preset.id=="rock" else 7 if preset.id=="ambient" else 1)
                start=n.start+min(n.duration*.65,beat*.4)
                if start<duration:
                    out.notes.append(NoteEvent(pitch=min(127,n.pitch+interval),start=start,
                        duration=min(beat*.15,duration-start),velocity=max(1,int(n.velocity*.6))))
    if role=="drums":
        # Density/re-accent changes are restricted to the selected drum track.
        out.notes=[n for i,n in enumerate(out.notes)
            if n.pitch in (35,36,38,40) or rng.random() < 1-strength*(1-preset.density)]
    # Contextual chord tones live only in an already selected accompaniment track.
    if not is_lead and role in ("guitar","piano") and strength>.2:
        for chord in (chords or []):
            start=float(chord["start"])
            end=min(float(chord["end"]),duration)
            if start>=end: continue
            root=int(chord["root"])
            third=3 if chord["quality"]=="minor" else 4
            if preset.id in EXTENDED_STYLES:
                add_harmony(out,preset,root,third,start,end,beat,strength)
                continue
            tones=[48+root,48+root+third,48+root+7]
            spacing=beat*(.5 if preset.id in ("chinese","japanese") else .25)
            for j,pitch in enumerate(tones):
                onset=start+j*spacing
                if onset<end:
                    out.notes.append(NoteEvent(pitch=pitch,start=onset,duration=min(beat*.45,end-onset),
                        velocity=int(45+25*strength)))
    if not is_lead and role=="bass" and preset.id in EXTENDED_STYLES and strength>.2:
        for chord in (chords or []):
            start=float(chord["start"]);end=min(float(chord["end"]),duration)
            if start>=end: continue
            root=36+int(chord["root"])
            offsets={"jazz":[0,3 if chord["quality"]=="minor" else 4,7,10],"blues":[0,7,9,7],"rock":[0,0,7,0],"bossa":[0,7],"waltz":[0,7,7],"ambient":[0]}[preset.id]
            spacing=beat*(.5 if preset.id=="rock" else 2 if preset.id in ("bossa","ambient") else 1)
            for j in range(math.ceil((end-start)/spacing)):
                onset=start+j*spacing
                out.notes.append(NoteEvent(pitch=root+offsets[j%len(offsets)],start=onset,duration=min(spacing*.75,end-onset),velocity=round(40+38*strength)))
    if role=="drums" and preset.id in EXTENDED_STYLES and strength>.2:
        add_drum_groove(out,preset,beat,duration,strength,rng)
    if preset.id=="scottish" and is_lead and out.notes and strength>.2:
        lowest=min(n.pitch for n in source)
        out.notes.append(NoteEvent(pitch=max(24,lowest-12),start=0,
            duration=max(.01,duration),velocity=round(25+25*strength)))
    out.notes.sort(key=lambda x:(x.start,x.pitch))
    return out

def add_harmony(track,preset,root,third,start,end,beat,strength):
    tones=[48+root,48+root+third,48+root+7]
    if preset.id=="jazz": tones.append(48+root+10)
    if preset.id=="bossa": tones.append(48+root+11)
    if preset.id in ("rock","ambient"): tones=[48+root,48+root+7,60+root]
    if preset.id=="ambient": attacks=[0]
    elif preset.id=="bossa": attacks=[0,.75,1.5,2.5,3.25]
    elif preset.id=="jazz": attacks=[.5,1.75,2.5,3.5]
    else: attacks=list(range(math.ceil((end-start)/beat)))
    if preset.id=="rock": attacks=[i*.5 for i in range(math.ceil((end-start)/beat*2))]
    for index,offset in enumerate(attacks):
        onset=start+offset*beat
        if onset>=end: continue
        chord_tones=[36+root] if preset.id=="waltz" and index%3==0 else tones
        for pitch in chord_tones:
            length=end-onset if preset.id=="ambient" else min(beat*(.28 if preset.id=="bossa" else .65),end-onset)
            track.notes.append(NoteEvent(pitch=pitch,start=onset,duration=length,velocity=round((32 if preset.id=="ambient" else 42)+30*strength)))

def add_drum_groove(track,preset,beat,duration,strength,rng):
    patterns={
      "jazz":([(51,0),(51,1),(51,1.66),(51,2),(51,3),(51,3.66),(38,1),(38,3)],4),
      "blues":([(42,t) for t in [0,.66,1,1.66,2,2.66,3,3.66]]+[(36,0),(36,2),(38,1),(38,3)],4),
      "rock":([(42,i*.5) for i in range(8)]+[(36,0),(36,2),(38,1),(38,3)],4),
      "bossa":([(36,0),(36,2),(37,.75),(37,1.5),(37,2.5),(37,3.25),(69,1),(69,3)],4),
      "waltz":([(36,0),(38,1),(38,2),(42,0),(42,1),(42,2)],3),
      "ambient":([(49,0)],8)
    }
    pattern,period=patterns[preset.id]
    for bar in range(math.ceil(duration/(period*beat))):
        for pitch,offset in pattern:
            onset=(bar*period+offset)*beat
            if onset>=duration or rng.random()>preset.density: continue
            track.notes.append(NoteEvent(pitch=pitch,start=onset,duration=min(.09,duration-onset),velocity=round((28 if preset.id=="ambient" else 40)+35*strength)))

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
