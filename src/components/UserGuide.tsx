import {useEffect,useRef,useState} from 'react';
import {BookOpen,ChevronRight,X,Search} from 'lucide-react';
const chapters=[
 {id:'start',title:'从这里开始',summary:'两种工作台，按你的目标选择。',steps:['改编现有音乐：导入 → 分离 → 勾选音轨 → 选择风格 → 预览 → 生成全曲 → 导出。','从零创作：新建工程 → 选择乐器 → 演奏或输入指令 → 录制／写入 → 编辑 → 保存。','左侧管理音轨，中央试听与编辑，右侧编配与音源，底部始终显示播放和录制控制。']},
 {id:'import',title:'导入与音轨分离',summary:'把整首音乐拆成可以单独处理的轨道。',steps:['点击左侧“导入音乐”，或将 WAV、MP3、FLAC、M4A 拖入窗口；最长 10 分钟、最大 500 MB。','导入后点击“分离音轨”。六轨模式包含钢琴、吉他、贝斯、鼓、人声、其他；四轨模式不能单选钢琴和吉他。','类别是模型估计。S 独奏、M 静音帮助检查串音；可以修改名称、音量和声像。“其他”仍可能混有多种乐器。']},
 {id:'arrange',title:'选择风格并改编',summary:'只改编勾选的乐器，原主旋律与时间轴会保留。',steps:['勾选左侧复选框，选一个或多个乐器；人声与其他混合轨支持保留原声和效果处理。','右侧有 10 种风格。调节强度并选择主旋律轨；高级设置可调整音源、密度、装饰音、摆动和随机种子。','设置预览起止秒数，先“生成片段预览”再“试听预览”。预览不会覆盖已保存的源轨。','满意后“生成全曲编配”。生成轨替换选中源轨，未选轨保留原声。“原曲 A/B”便于比较。']},
 {id:'play',title:'自由演奏与录制',summary:'16 种乐器，支持鼠标和电脑键盘。',steps:['钢琴、弦乐与管乐都使用屏幕键盘；“更多乐器”选择电钢琴、小提琴、长笛等。键帽显示电脑键盘映射，+ / − 调整八度，Shift 控制延音。','吉他有六弦、贝斯有四弦。先点击指板按品，再拨动右侧琴弦；跨弦拖动可以扫弦，快捷和弦可快速设置按品。','鼓提供八个鼓垫。力度滑杆影响新弹奏的音符；使用 GeneralUser GS 采样音色，民族音色标明近似来源。','底部红色录制键倒数四拍后开始录制。再次点击结束。可在不同轨道逐次录制；默认保留实际时间，量化需要手动应用。']},
 {id:'sequence',title:'指令自动弹奏',summary:'例如 ASDFDGS：让应用逐个按键演奏。',steps:['在中央“指令自动弹奏”输入当前乐器的按键。忽略大小写、空白与逗号；按键映射和手动演奏相同。','ASDFDGS 连续演奏；A-S 在 A 与 S 之间停顿；[AD]F 同时弹奏 A+D 再弹 F。- 和 . 都表示一个位置的停顿。','设置 BPM 及四／八／十六分音符时值，再点击“自动弹奏”。可循环，也可随时“停止指令”。','试听不修改工程。“写入当前音轨”将音符放在当前播放光标处，保留力度、品位和时值，可撤销、编辑并导出 MIDI。']},
 {id:'edit',title:'时间线、音符与效果',summary:'修正自动转谱，或者继续打磨自己的创作。',steps:['中央时间线切换到音符视图，即为钢琴卷帘。拖动音符改变起点与音高，拖动尾部改变时长。','工具栏支持新增、删除、复制与量化；选中音符后可修改力度。底部撤销／重做恢复编辑操作。','每轨可设置均衡、压缩、失真、合唱、延迟与混响。旁路按钮方便对比未处理声音。','转谱可能出现错音或漏音，请先独奏试听。音源面板可换采样库或 GM 音色编号；设置支持导入用户 SF2。']},
 {id:'export',title:'保存、导出与自动恢复',summary:'保存工程用于继续编辑，导出音频用于分享。',steps:['“保存工程”得到可移动的 .mwork，包含音频、音符、控制事件、编配、效果和扩展音源。“打开”可以恢复编辑。','导出菜单支持混音或当前音轨的 WAV、MP3、MIDI。WAV / MP3 保留音源与效果；MIDI 包含音符和控制事件，不包含原声音频。','修改自动保存到应用恢复目录。重新启动会恢复最近工程；正式作品请另存工程，避免完全卸载时丢失恢复副本。']},
 {id:'offline',title:'资源下载与故障恢复',summary:'资源就绪后，处理与演奏都在本机进行。',steps:['音源随安装包提供；第一次使用需要下载分离和转谱模型。下载失败时，已就绪的自由演奏仍可使用。','右上角设置可校验／下载资源、导入校验离线 ZIP 包、强制 CPU，以及重新启动后端。任务可取消后重试。','GPU 初始化需额外下载 CUDA 组件。实际推理自检失败或显存不足会降分段或回退 CPU。','出现问题时导出诊断日志。后台推理无需关闭演奏界面；处理期间请等待任务完成后再编辑待处理音符。']},
 {id:'uninstall',title:'完全卸载',summary:'清除应用管理的环境、资源和个人设置。',steps:['设置中的“完全卸载应用”会关闭程序并启动清理，也可以从 Windows“已安装的应用”卸载。','清除安装目录内 Electron、Python、依赖、FFmpeg 和音源，以及应用目录内模型、GPU 组件、缓存、日志、设置和恢复工程。','请先另存需要保留的 .mwork。用户自行保存到其他目录的工程、导出作品、下载的安装包和源码属于独立文件，需要在各自目录管理。','更新安装不会清除模型或工程恢复数据；仅真正卸载时执行完整清理。']}
];
const tourSteps=[
 {selector:'.project-actions',title:'先选目标',text:'新建作品，或者打开已有 .mwork 工程。保存和导出也在这里。'},
 {selector:'.import-button',title:'导入音乐',text:'从文件选择或拖入开始。导入后，左侧会出现分离音轨按钮。'},
 {selector:'.track-list',title:'管理音轨',text:'点击音轨切换编辑对象，勾选复选框选择要改编的轨道。S 独奏，M 静音。'},
 {selector:'.timeline',title:'查看和修正',text:'切换音符视图，在钢琴卷帘编辑音高、起点、时长和力度。'},
 {selector:'.style-panel',title:'试听编配',text:'选风格和强度，先生成片段预览，再应用全曲。没有选中的轨道继续保留原声。'},
 {selector:'.instrument-panel',title:'让乐器发声',text:'屏幕上的键帽就是电脑键盘按键。“更多乐器”提供弦乐、管乐和民族音色。'},
 {selector:'.sequence-panel',title:'输入演奏指令',text:'ASDFDGS 自动连续演奏，[AD] 组成和弦，- 表示停顿。写入音轨后可以编辑和导出。'},
 {selector:'.transport',title:'播放与记录',text:'底部控制播放、停止、倒数录制、BPM、循环和节拍器。录制默认保留真实时值。'},
 {selector:'.header-actions',title:'资源和维护',text:'设置中下载／导入模型、重启后端、导出日志和完全卸载。帮助按钮可随时重看指引。'}
];
interface Props {open:boolean;onClose:()=>void;tour:number|null;onTour:(step:number|null)=>void}
export default function UserGuide({open,onClose,tour,onTour}:Props){
 const [chapter,setChapter]=useState('start'),[query,setQuery]=useState('');const modal=useRef<HTMLElement>(null);
 const current=chapters.find(c=>c.id===chapter)||chapters[0];
 useEffect(()=>{
  if(!open)return;const previous=document.activeElement as HTMLElement|null;
  const first=modal.current?.querySelector<HTMLElement>('button');first?.focus();
  const keys=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose()}
   if(event.key==='Tab'){const all=Array.from(modal.current?.querySelectorAll<HTMLElement>('button,input,[tabindex="0"]')||[]).filter(e=>!e.hasAttribute('disabled'));const first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
  };document.addEventListener('keydown',keys);return()=>{document.removeEventListener('keydown',keys);previous?.focus()};
 },[open]);
 useEffect(()=>{
  if(tour===null)return;const element=document.querySelector<HTMLElement>(tourSteps[tour]?.selector||'');
  element?.classList.add('guide-target');element?.scrollIntoView({block:'center',behavior:'instant'});
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onTour(null)};document.addEventListener('keydown',escape);
  return()=>{element?.classList.remove('guide-target');document.removeEventListener('keydown',escape)};
 },[tour]);
 const results=chapters.filter(c=>(c.title+c.summary+c.steps.join('')).includes(query));
 return <>
  {open&&<div className="modal-backdrop" onClick={onClose}><section ref={modal} className="guide-modal panel" role="dialog" aria-modal="true" aria-label="用户指引" onClick={e=>e.stopPropagation()}>
   <div className="section-heading"><div className="inline"><BookOpen size={22}/><h2>用户指引</h2></div><button aria-label="关闭用户指引" className="icon-button" onClick={onClose}><X size={20}/></button></div>
   <div className="guide-search"><Search size={16}/><input aria-label="搜索指引" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索：录制、指令、卸载…"/></div>
   <div className="guide-layout"><nav aria-label="指引章节">{results.map(c=><button key={c.id} aria-current={current.id===c.id?'page':undefined} className={current.id===c.id?'active':''} onClick={()=>setChapter(c.id)}>{c.title}<ChevronRight size={13}/></button>)}{!results.length&&<p className="hint">没有匹配章节，请换一个关键词。</p>}</nav>
    <article><h3>{current.title}</h3><p className="muted">{current.summary}</p><ol>{current.steps.map(s=><li key={s}>{s}</li>)}</ol><button className="primary" onClick={()=>{onClose();onTour(0)}}>带我走一遍界面<ChevronRight size={15}/></button></article>
   </div></section></div>}
  {tour!==null&&<aside className="guide-tour panel" role="region" aria-label="界面操作指引" aria-live="polite"><div className="inline"><span className="badge">{tour+1} / {tourSteps.length}</span><h3>{tourSteps[tour].title}</h3><button aria-label="结束界面指引" className="icon-button" onClick={()=>onTour(null)}><X size={16}/></button></div><p>{tourSteps[tour].text}</p><div className="inline"><button disabled={tour===0} onClick={()=>onTour(tour-1)}>上一步</button><button className="primary" onClick={()=>onTour(tour===tourSteps.length-1?null:tour+1)}>{tour===tourSteps.length-1?'完成指引':'下一步'}</button></div></aside>}
 </>;
}
