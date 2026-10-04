from __future__ import annotations
from typing import Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, model_validator

def uid(): return str(uuid4())

class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

class NoteEvent(Model):
    id: str = Field(default_factory=uid)
    pitch: int = Field(ge=0, le=127)
    start: float = Field(ge=0, le=601)
    duration: float = Field(gt=0, le=601)
    velocity: int = Field(default=90, ge=1, le=127)
    string: int | None = Field(default=None, ge=0, le=5)

class ControlEvent(Model):
    time: float = Field(ge=0, le=601)
    controller: int = Field(ge=0, le=127)
    value: int = Field(ge=0, le=127)

class Effects(Model):
    bypass: bool = False
    low: float = Field(default=0, ge=-18, le=18)
    mid: float = Field(default=0, ge=-18, le=18)
    high: float = Field(default=0, ge=-18, le=18)
    compression: float = Field(default=0, ge=0, le=1)
    distortion: float = Field(default=0, ge=0, le=1)
    chorus: float = Field(default=0, ge=0, le=1)
    delay: float = Field(default=0, ge=0, le=1)
    reverb: float = Field(default=0, ge=0, le=1)

Instrument = Literal["piano", "guitar", "bass", "drums", "electricPiano", "organ", "violin", "cello", "flute", "sax", "trumpet", "accordion", "harp", "koto", "shamisen", "bagpipe", "vocals", "other"]

class PerformanceSettings(Model):
    octave: int = Field(default=4, ge=1, le=7)
    velocity: int = Field(default=90, ge=1, le=127)
    frets: list[int] = Field(default_factory=lambda: [0,2,2,0,0,0], min_length=4, max_length=6)

    @model_validator(mode="after")
    def valid_frets(self):
        if any(f < -1 or f > 7 for f in self.frets): raise ValueError("品位必须为 -1 至 7")
        return self

class SequenceInput(Model):
    text: str = Field(default="", max_length=4000)
    # Incomplete BPM edits are saved as drafts; note generation requires 20–300.
    bpm: float = Field(default=120, ge=0, le=1000)
    division: Literal[4,8,16] = 8
    loop: bool = False
    start: float = Field(default=0, ge=0, le=600)
    noteIds: list[str] = Field(default_factory=list, max_length=34000)

class StylePreset(Model):
    id: Literal["chinese", "japanese", "scottish", "russian", "jazz", "blues", "rock", "bossa", "waltz", "ambient"]
    name: str
    description: str = Field(default="", max_length=160)
    programs: dict[str, int]
    timbres: dict[str, str]
    ornament: float = Field(ge=0, le=1)
    density: float = Field(ge=0, le=1)
    swing: float = Field(ge=0, le=0.35)

class ArrangementSettings(Model):
    preset: StylePreset
    strength: float = Field(default=0.5, ge=0, le=1)
    seed: int = Field(default=42, ge=0, le=2147483647)

class Track(Model):
    id: str = Field(default_factory=uid)
    name: str = Field(max_length=120)
    instrument: Instrument
    mode: Literal["audio", "notes"] = "notes"
    asset: str | None = None
    originalAsset: str | None = None
    program: int = Field(default=0, ge=0, le=127)
    soundBank: str = "generaluser"
    notes: list[NoteEvent] = Field(default_factory=list, max_length=150000)
    sourceNotes: list[NoteEvent] = Field(default_factory=list, max_length=150000)
    controls: list[ControlEvent] = Field(default_factory=list, max_length=150000)
    gain: float = Field(default=0.8, ge=0, le=2)
    pan: float = Field(default=0, ge=-1, le=1)
    mute: bool = False
    solo: bool = False
    selected: bool = False
    estimated: bool = False
    effects: Effects = Field(default_factory=Effects)
    color: str = "#72d7c2"
    timbre: str = ""
    style: str | None = None
    performance: PerformanceSettings | None = None
    sequence: SequenceInput | None = None
    arrangement: ArrangementSettings | None = None

class TempoPoint(Model):
    time: float = Field(ge=0, le=601)
    bpm: float = Field(ge=20, le=300)

class Project(Model):
    schemaVersion: Literal[1] = 1
    id: str = Field(default_factory=uid)
    name: str = Field(default="未命名创作", min_length=1, max_length=160)
    duration: float = Field(default=16, ge=0, le=601)
    bpm: float = Field(default=120, ge=20, le=300)
    key: str = Field(default="C", max_length=20)
    meter: str = Field(default="4/4", pattern=r"^[1-9]\d?/(2|4|8|16)$")
    tempoMap: list[TempoPoint] = Field(default_factory=lambda: [TempoPoint(time=0,bpm=120)], max_length=5000)
    beats: list[float] = Field(default_factory=list, max_length=30000)
    chords: list[dict] = Field(default_factory=list, max_length=5000)
    original: str | None = None
    leadTrackId: str | None = None
    tracks: list[Track] = Field(default_factory=list, max_length=16)
    history: list[dict] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def coherent_timeline(self):
        if not self.tempoMap or self.tempoMap[0].time!=0: raise ValueError("节拍映射必须从 0 秒开始")
        if any(b.time<=a.time for a,b in zip(self.tempoMap,self.tempoMap[1:])): raise ValueError("节拍映射时间必须递增")
        if len({t.id for t in self.tracks})!=len(self.tracks): raise ValueError("音轨编号不能重复")
        return self

class JobRequest(Model):
    kind: Literal["initialize", "separate", "transcribe", "arrange", "selftest"]
    projectId: str | None = None
    trackIds: list[str] = Field(default_factory=list, max_length=16)
    model: Literal["htdemucs_6s", "htdemucs"] = "htdemucs_6s"
    device: Literal["auto", "cpu"] = "auto"
    style: StylePreset | None = None
    strength: float = Field(default=0.5, ge=0, le=1)
    seed: int = Field(default=42, ge=0, le=2147483647)
    preview: bool = False
    start: float = Field(default=0, ge=0, le=600)
    end: float = Field(default=20, gt=0, le=600)
