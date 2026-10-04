from backend.models import Project, Track, NoteEvent, SequenceInput, PerformanceSettings, ArrangementSettings
from backend.presets import PRESETS
from backend.storage import save_project, archive_project, open_archive

def test_creation_inputs_and_independent_styles_roundtrip(tmp_path):
    piano = Track(name="钢琴", instrument="piano", notes=[NoteEvent(id="piano-note", pitch=60, start=0, duration=.2)],
                  sequence=SequenceInput(text="WASD", noteIds=["piano-note"]),
                  performance=PerformanceSettings(octave=5, velocity=85),
                  arrangement=ArrangementSettings(preset=PRESETS[4], strength=.7, seed=123))
    guitar = Track(name="吉他", instrument="guitar", notes=[NoteEvent(id="guitar-note", pitch=47, start=0, duration=.4)],
                   sequence=SequenceInput(text="AS", bpm=96, loop=True, noteIds=["guitar-note"]),
                   performance=PerformanceSettings(frets=[0,2,2,0,0,0]),
                   arrangement=ArrangementSettings(preset=PRESETS[6], strength=.2))
    project = Project(tracks=[piano, guitar])
    save_project(project)
    path = tmp_path / "多乐器创作.mwork"
    archive_project(project, str(path))
    restored = open_archive(str(path))
    assert [(t.notes,t.sequence,t.performance,t.arrangement) for t in restored.tracks] == [
        (t.notes,t.sequence,t.performance,t.arrangement) for t in project.tracks]

def test_old_projects_without_creation_fields_remain_supported():
    track = Track.model_validate({"name":"旧工程", "instrument":"piano", "notes":[]})
    assert track.sequence is None and track.performance is None and track.arrangement is None
