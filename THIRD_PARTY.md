# 第三方资源与软件

音频处理在本机执行。资源文件及下载 URL、大小、SHA-256 固定于 `backend/assets.json` 与 `backend/gpu-assets.json`。默认音源随安装包提供；模型首次下载，或从离线 ZIP 导入。

| 组件 | 来源 | 许可 |
|---|---|---|
| GeneralUser GS | https://github.com/mrbumpy409/GeneralUser-GS | GeneralUser GS 专用许可，完整文本见 vendor/licenses |
| Demucs 4 与官方 HTDemucs 权重 | https://github.com/facebookresearch/demucs | MIT |
| Basic Pitch ONNX 模型与 Python 后处理 | https://github.com/spotify/basic-pitch | Apache-2.0 |
| PyTorch 2.7.1 / torchaudio 2.7.1 | https://pytorch.org/ | BSD，wheel 内保留许可及 NVIDIA 运行库通知 |
| SpessaSynth core 4.3.22 / lib 4.3.14 | https://github.com/spessasus | Apache-2.0，修改部分仅为本项目的工作线程封装 |
| Electron / React | https://www.electronjs.org/ / https://react.dev/ | MIT，Chromium 第三方通知随 Electron 分发 |
| Python 3.11 | https://www.python.org/ | PSF，原运行时内保留许可 |
| Microsoft Visual C++ AMD64 运行库 14.44 | Microsoft 官方签名可再分发包 | 应用内部署；完整 Microsoft 软件许可见 vendor/licenses |
| FastAPI、NumPy、SciPy、librosa、ONNX Runtime 等 | Python 安装元数据 | 对应 dist-info/licenses 随运行环境保留 |
| FFmpeg 独立程序 | imageio-ffmpeg 0.6.0 所带 Windows 构建 | GPLv3，独立子进程调用，完整文本与编译信息见 vendor/licenses |

FFmpeg 构建源代码与构建方式：https://github.com/imageio/imageio-ffmpeg/tree/v0.6.0 及 https://github.com/FFmpeg/FFmpeg 。再分发 FFmpeg 时应同时提供该构建对应的源码及 GPL 通知；本项目保留构建配置，发布者需遵循其许可证。

默认筝、三味线、尺八、风笛、手风琴等使用 GeneralUser GS 的对应 GM 程序。中国笛类、俄罗斯拨弦等存在近似音色，界面显示实际使用名称；这四个预设只表达器乐编配方向。用户导入 SF2 的使用与再分发许可由该音源的提供方规定。
