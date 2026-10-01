from backend.models import Project,Track,NoteEvent,JobRequest
from backend.presets import PRESETS
from backend.arrangement import arrange_track,estimate_chords
from backend.worker import execute

def events(track):return [(n.pitch,round(n.start,5),round(n.duration,5),n.velocity) for n in track.notes]

def test_new_styles_change_arrangement_not_only_program():
    source=Track(name="伴奏",instrument="guitar",notes=[NoteEvent(pitch=p,start=0,duration=2,velocity=90) for p in (60,64,67)])
    chords=estimate_chords(source.notes,120,4)
    results=[]
    for preset in PRESETS[4:]:
        result=arrange_track(source,preset,.8,120,42,4,False,chords)
        assert events(result)==events(arrange_track(source,preset,.8,120,42,4,False,chords))
        assert all(n.duration>0 and n.start+n.duration<=4.00001 for n in result.notes)
        results.append(tuple(events(result)))
    assert len(set(results))==6

def test_extended_instrument_and_unselected_stems_survive_worker():
    violin=Track(name="小提琴",instrument="violin",notes=[NoteEvent(pitch=60,start=.2,duration=1,velocity=85)])
    original=Track(name="原声",instrument="vocals",mode="audio",asset="audio/vocals.wav")
    project=Project(duration=4,tracks=[violin,original],leadTrackId=violin.id)
    request=JobRequest(kind="arrange",projectId=project.id,trackIds=[violin.id],style=PRESETS[4])
    result=Project.model_validate(execute({"request":request.model_dump(),"project":project.model_dump()})["project"])
    assert result.tracks[1]==original
    assert any(n.pitch==60 and n.start==.2 for n in result.tracks[0].notes)
    assert result.tracks[0].style=="jazz"
    assert result.bpm==project.bpm and result.meter==project.meter

def test_empty_estimated_track_does_not_invent_instrument():
    for preset in PRESETS:
        result=arrange_track(Track(name="空吉他",instrument="guitar",estimated=True),preset,1,120,42,4,False,[{"start":0,"end":4,"root":0,"quality":"major"}])
        assert not result.notes
