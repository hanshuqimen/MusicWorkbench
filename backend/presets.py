from .models import StylePreset
PRESETS = [
 StylePreset(id="chinese",name="中国古典器乐",programs={"piano":73,"guitar":107,"bass":32,"drums":0},
 timbres={"piano":"笛类近似音色 · GM Flute","guitar":"筝类近似音色 · GM Koto","bass":"低音拨弦 · Acoustic Bass","drums":"轻打击乐 · GM Standard"},ornament=.5,density=.45,swing=0),
 StylePreset(id="japanese",name="日式传统器乐",programs={"piano":77,"guitar":106,"bass":107,"drums":0},
 timbres={"piano":"尺八 · GM Shakuhachi","guitar":"三味线 · GM Shamisen","bass":"筝 · GM Koto（低音区）","drums":"稀疏打击 · GM Standard"},ornament=.3,density=.3,swing=0),
 StylePreset(id="scottish",name="苏格兰民谣",programs={"piano":109,"guitar":110,"bass":43,"drums":0},
 timbres={"piano":"风笛 · GM Bag Pipe","guitar":"提琴 · GM Fiddle","bass":"低音弦乐 · Contrabass","drums":"舞曲打击 · GM Standard"},ornament=.55,density=.7,swing=.12),
 StylePreset(id="russian",name="俄罗斯民谣",programs={"piano":21,"guitar":24,"bass":32,"drums":0},
 timbres={"piano":"手风琴 · GM Accordion","guitar":"巴拉莱卡近似音色 · 轮拨尼龙吉他","bass":"低音拨弦 · Acoustic Bass","drums":"民谣打击 · GM Standard"},ornament=.65,density=.75,swing=.04),
]
