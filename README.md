# MusicWorkbench · 本地音乐改编与创作工作台

Windows x64 桌面应用。Electron + React + TypeScript，独立 Python 3.11/FastAPI 后端，Demucs 六轨／四轨、Basic Pitch ONNX、真实 SF2 采样演奏。无需云端 API。

## 普通用户

运行 `release/MusicWorkbench Setup 0.2.0.exe` 按用户安装，然后打开桌面快捷方式。应用自动启动后端；音源随包提供，分离与转谱模型第一次启动下载约 139 MB。检测到 NVIDIA 显卡时，可下载约 3.28 GB 的 CUDA 12.8 运行组件；取消下载后 CPU 处理仍可用，设置中可重试。建议为安装、模型、GPU 组件下载及解压预留 15 GB 磁盘空间。资源全部准备好后可以离线使用。

也可运行 `release/win-unpacked/MusicWorkbench.exe`。`launch.cmd` 用于本机源码工作目录：已构建安装包时优先打开独立程序，否则使用本地 Node/Electron。`release/MusicWorkbench-resources.zip` 是校验离线资源包，可在设置中导入；GPU 扩展下载不是 CPU 离线使用的前提。

1. 导入或拖入 WAV／MP3／FLAC／M4A（≤10 分钟、500 MB）。点击“分离音轨”。六轨为模型估计分类，四轨无法单独选择钢琴和吉他。
2. 勾选钢琴、吉他、贝斯或鼓，选择器乐预设及主旋律轨。先生成片段预览再生成全曲。所选源轨被采样编配替换，未选轨原声保持对齐。
3. 点击时间线的音符视图编辑，修正转谱误差。可修改预设配器参数、强度、速度、调性；调性校正用于和声编配，不强制移动主旋律。
4. 创作页支持电脑键盘／鼠标演奏、四拍倒数、多轨逐次录制。默认保留实际时值；量化需主动点击。钢琴 Shift 延音，琴弦 A–H／A–F，鼓垫 A S D F J K L ;。按品后单弦拨动，右侧跨弦拖动扫弦。
5. 导出菜单保存 MIDI、WAV、MP3 或当前音轨。“保存工程”生成 `.mwork` ZIP 容器，含原音频、分离音频、音符、风格版本、控制及效果参数、扩展 SF2，可在移动后重开。

设置提供资源校验、离线 ZIP 导入、SF2 导入、后端重启及诊断日志导出。用户数据位于 `%APPDATA%/music-workbench`（以实际 Electron userData 为准），缓存与自动恢复均保留在此目录。导入长文件及渲染可能占用较多内存；当前渲染逐轨处理，建议至少 16 GB 内存。

## 开发与构建

```powershell
Set-Location D:\CODE\VibeCoding\test\MusicWorkbench
powershell -ExecutionPolicy Bypass -File .\setup.ps1
node scripts/dev.mjs
node scripts/package.mjs
```

安装版不需要 Node／Python。源码初始化脚本自动准备本地 Node、pnpm、uv、Python 3.11、依赖、FFmpeg 与音源；开发运行时默认 CUDA 12.8，安装包基础版用 CPU PyTorch，GPU 组件在用户数据目录内独立安装。

```powershell
.venv\Scripts\python.exe -m pytest backend/tests -q
node node_modules/typescript/bin/tsc --noEmit
node scripts/render-fixture.mjs
.venv\Scripts\python.exe scripts/integration.py
```

共享数据契约见 `src/types.ts` 与 `backend/models.py`。音符用秒保存，MIDI 按节拍映射转 tick。IPC 限制文件／任务操作；后端仅随机本机端口+会话令牌；推理在可取消的串行子进程中执行。官方模型 SHA 校验后才加载；分离、转谱按内容和参数缓存；随机种子控制风格结果。

## 验证状态

记录见 `docs/VALIDATION.md`。参考素材是用同一 SF2 生成的 8 秒钢琴／吉他／贝斯／鼓混音，专门用于真实模型集成检验，产品中没有固定演示音轨或模拟分离。另已完成 10 分钟输入分离压力测试。自动分离、转谱和鼓类别估计存在误差；吉他与钢琴串音尤其需要人工修正。独立干净 Windows、长曲播放／导出内存测量和多种真实歌曲质量测试仍需验收。

首版不包含外接 MIDI、VST、云端服务、触屏、五线谱／简谱／六线谱。MIDI 保留音符、延音等控制事件，音频轨和效果保存在工程与音频导出中。扩展 SF2 当前使用 Bank 0。预设不会把地域名称当作唯一音乐规则。

第三方许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。项目目前为未签名测试版本。

## 0.2 新功能

- **指令自动弹奏**：输入 `ASDFDGS` 自动依次演奏；忽略大小写、空白、逗号，`-` / `.` 表示停顿，`[AD]` 表示同时弹奏。速度 20–300 BPM，四／八／十六分音符时值，可循环或停止。吉他／贝斯按当前品位发声，其余按当前八度发声。试听不修改工程；“写入当前音轨”从当前光标处添加可编辑音符，支持撤销、保存及 MIDI / 音频导出。
- **16 种乐器**：原有钢琴、吉他、贝斯、鼓，加电钢琴、风琴、小提琴、大提琴、长笛、萨克斯、小号、手风琴、竖琴、筝、三味线、风笛。使用真实 GeneralUser GS 采样；民族音色为 GM 采样近似，不代表专业民族乐器采样库。新增旋律乐器采用屏幕键盘操作。
- **10 种风格**：保留中国古典、日式传统、苏格兰、俄罗斯；新增爵士摇摆、布鲁斯、摇滚、波萨诺瓦、圆舞器乐、氛围器乐，分别包含七和弦／行进低音、shuffle、五度和弦／八分脉冲、切分／根五低音、三拍重音感、长音／稀疏织体。圆舞预设不会自动改变原拍号。新增创作乐器也可参与编配；Demucs 的六种输出类别保持原模型范围。
- **应用内用户指引**：右上角“使用指引”，包含搜索、操作步骤及九步真实界面高亮；首次打开提供入口提示。
- **完全卸载**：设置中的“完全卸载应用”、Windows 应用列表或安装目录卸载器均可卸载安装版。独立版可从设置启动便携清理。先关闭所属进程，再清除应用管理的模型、CUDA 组件、音源、依赖、日志、缓存、设置与恢复工程；安装版同时移除快捷方式及注册信息。更新安装保留用户数据。用户另存的工程、导出作品、下载的安装包以及源码目录属于独立文件，需自行管理。

源码托管于公开仓库 [hanshuqimen/MusicWorkbench](https://github.com/hanshuqimen/MusicWorkbench)。模型、开发环境、测试输入／输出和大型安装包不进入 Git 历史；安装包通过 GitHub Releases 分发。
