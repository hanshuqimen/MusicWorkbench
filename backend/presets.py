from .models import StylePreset
PRESETS = [
 StylePreset(id="chinese",name="中国古典器乐",description="拨弦 · 留白 · 装饰音",programs={"piano":73,"guitar":107,"bass":32,"drums":0},
 timbres={"piano":"笛类近似音色 · GM Flute","guitar":"筝类近似音色 · GM Koto","bass":"低音拨弦 · Acoustic Bass","drums":"轻打击乐 · GM Standard"},ornament=.5,density=.45,swing=0),
 StylePreset(id="japanese",name="日式传统器乐",description="筝 · 三味线 · 尺八",programs={"piano":77,"guitar":106,"bass":107,"drums":0},
 timbres={"piano":"尺八 · GM Shakuhachi","guitar":"三味线 · GM Shamisen","bass":"筝 · GM Koto（低音区）","drums":"稀疏打击 · GM Standard"},ornament=.3,density=.3,swing=0),
 StylePreset(id="scottish",name="苏格兰民谣",description="风笛 · 提琴 · 舞曲重音",programs={"piano":109,"guitar":110,"bass":43,"drums":0},
 timbres={"piano":"风笛 · GM Bag Pipe","guitar":"提琴 · GM Fiddle","bass":"低音弦乐 · Contrabass","drums":"舞曲打击 · GM Standard"},ornament=.55,density=.7,swing=.12),
 StylePreset(id="russian",name="俄罗斯民谣",description="手风琴 · 轮拨 · 起伏",programs={"piano":21,"guitar":24,"bass":32,"drums":0},
 timbres={"piano":"手风琴 · GM Accordion","guitar":"巴拉莱卡近似音色 · 轮拨尼龙吉他","bass":"低音拨弦 · Acoustic Bass","drums":"民谣打击 · GM Standard"},ornament=.65,density=.75,swing=.04),
 StylePreset(id="jazz",name="爵士摇摆",description="七和弦 · 反拍 · 行进低音",programs={"piano":4,"guitar":26,"bass":32,"drums":0},
 timbres={"piano":"电钢琴 · GM Electric Piano","guitar":"爵士吉他 · GM Jazz Guitar","bass":"行进低音 · Acoustic Bass","drums":"摇摆镲片 · GM Standard"},ornament=.45,density=.72,swing=.22),
 StylePreset(id="blues",name="布鲁斯",description="Shuffle · 蓝调装饰 · 回应句",programs={"piano":0,"guitar":27,"bass":33,"drums":0},
 timbres={"piano":"钢琴 · GM Acoustic Grand","guitar":"清音吉他 · GM Clean Guitar","bass":"电贝斯 · GM Finger Bass","drums":"Shuffle 鼓 · GM Standard"},ornament=.65,density=.6,swing=.28),
 StylePreset(id="rock",name="摇滚",description="五度和弦 · 八分脉冲 · 强反拍",programs={"piano":0,"guitar":29,"bass":34,"drums":0},
 timbres={"piano":"钢琴 · GM Acoustic Grand","guitar":"过载吉他 · GM Overdriven Guitar","bass":"拨片贝斯 · GM Pick Bass","drums":"强反拍 · GM Standard"},ornament=.22,density=.9,swing=0),
 StylePreset(id="bossa",name="波萨诺瓦",description="切分和弦 · 根五低音 · 轻打击",programs={"piano":0,"guitar":24,"bass":32,"drums":0},
 timbres={"piano":"钢琴 · GM Acoustic Grand","guitar":"尼龙吉他 · GM Nylon Guitar","bass":"原声低音 · GM Acoustic Bass","drums":"轻切分打击 · GM Standard"},ornament=.2,density=.58,swing=0),
 StylePreset(id="waltz",name="圆舞器乐",description="三拍重音感 · 根音与和弦 · 不改拍号",programs={"piano":0,"guitar":46,"bass":42,"drums":0},
 timbres={"piano":"钢琴 · GM Acoustic Grand","guitar":"竖琴 · GM Orchestral Harp","bass":"大提琴 · GM Cello","drums":"轻舞曲打击 · GM Standard"},ornament=.35,density=.5,swing=0),
 StylePreset(id="ambient",name="氛围器乐",description="长音铺底 · 稀疏织体 · 开放五度",programs={"piano":89,"guitar":46,"bass":43,"drums":0},
 timbres={"piano":"暖音垫 · GM Warm Pad","guitar":"竖琴 · GM Orchestral Harp","bass":"低音弦乐 · GM Contrabass","drums":"稀疏镲片 · GM Standard"},ornament=.15,density=.2,swing=0),
]

# Expose an explicit editable mapping for every new playable instrument.
# The defaults follow arrangement roles; editing one instrument stays independent.
for preset in PRESETS:
    for instrument,role in {"electricPiano":"piano","organ":"piano","violin":"piano","cello":"bass","flute":"piano","sax":"piano","trumpet":"piano","accordion":"piano","harp":"guitar","koto":"guitar","shamisen":"guitar","bagpipe":"piano"}.items():
        preset.programs[instrument]=preset.programs[role]
        preset.timbres[instrument]=preset.timbres[role]
