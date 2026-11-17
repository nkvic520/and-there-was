# 协议、互动与恢复约定

这个文件描述 0.3 的已实现接口。SDK 1/2 保持兼容，SDK 3 增加动态和绘本模式；产品完整要求仍以两份需求文档及后续用户确认的范围为准。

## 入口

| 方法与路径 | 含义 |
| --- | --- |
| `POST /api/worlds` | `{mode:"animated"|"storybook"}` 创建空世界和 revision 0 快照；省略 mode 保留旧 API 样例行为 |
| `GET /api/worlds/:id` | 当前已提交快照 |
| `GET /api/worlds/:id/playback` | 当前包的 `{packageHash,elapsedMs,paused,cues}`；新包默认时间为 0 |
| `POST /api/worlds/:id/playback` | `{versionId,elapsedMs,paused,cues?}` 保存播放检查点，不新增世界版本 |
| `POST /api/worlds/:id/turns` | `{text, clientSubmissionId}`，保留原文；同一提交 ID 返回原轮次 |
| `GET /api/worlds/:id/events` | SSE，支持 `Last-Event-ID` 或 `?after=`，序号与事件落库 |
| `GET /api/attempts/:id/candidate` | 当前有效候选包和它的基线快照 |
| `POST /api/trials` | 隔离试跑成功/失败回执，携带尝试 ID、包哈希、基线版本与修订号 |
| `POST /api/turns/:id/retry` | 失败轮次重新排队，保留旧尝试并创建新尝试 |
| `POST /api/worlds/:id/interactions` | `{clientEventId,versionId,revision,targetId,output?,error?}`，提交本地事件执行结果 |
| `GET /api/worlds/:id/activity` | 最近 200 条轮次/尝试的状态，供断线恢复轮询 |
| `GET /api/worlds/:id/records` | 当前快照、轮次、尝试、所有版本和事件索引 |
| `GET /api/artifacts/:hash` | 读取并重新核验内容哈希；始终以纯文本返回 |
| `GET /api/health` | 实际生成模式、模型 ID、版本与保留期限 |

API 仅接收最终文字与元数据，不接收麦克风或音频输入。仅保证单个 Node 实例管理同一个数据目录，不允许多个实例共享同一 SQLite 文件。

## 生成包

`formatVersion=1`、`sdkVersion=1|2|3`，入口固定为 `scene.js`，包含 `protocol.json`、`scene.js`、`view.json` 的 UTF-8 源文与 SHA-256。素材清单为空。ID/时间戳位于服务端记录，不进入可复现的样例内容。`schemaVersion` 必须与 SDK 版本相同；状态结构可在同一 SDK 版本内由新包扩展。SDK 3 的协议和 view 都必须携带与世界一致的 mode；显式选模式的新世界拒绝 SDK 1/2 候选。

协议描述整个模块状态。受限 JSON Schema 支持对象、数组、字符串、数值、布尔、null、必填字段、常量/枚举与长度/数量边界；对象必须闭合，数组必须有数量上限。不接受 `$ref`、正则或自定义关键字。SDK 1 事件为空；SDK 2 的 `events` 将最多 32 个事件名映射到闭合的 JSON payload schema。

脚本必须导出同步 `mount(sdk)`，返回 undefined。SDK 包含 `getState()`、`setState(value)`、`circle(id,x,y,radius,color,alpha)`、`ellipse(id,x,y,radiusX,radiusY,color,alpha)`。所有绘图坐标在 0–1 的正方形内，按画布短边等比缩放并居中。宿主只识别绘图操作，不识别中文输入或 Ball 类型。

SDK 2 另外提供 `rect(id,x,y,width,height,color,alpha)` 和 `onTap(drawnId,eventName,payload={})`。矩形的 x/y 为中心，width/height 为完整尺寸；保存的绘图操作仍使用半径字段表示半宽/半高。每个绑定必须指向本次 mount 实际画出的唯一 ID，payload 必须符合对应事件 schema。鼠标和触屏统一映射为这个事件，不把 DOM/浏览器事件传入脚本。

候选生效前调用 `migrate(sdk, previousProtocol)`（若导出），然后 mount。事件调用 `onEvent(sdk,eventName,payload)`，然后 mount。迁移/事件阶段只保留状态变化，画面与绑定完整取自 mount。所有导出均为同步调用并返回 undefined。SDK 对象冻结；没有 Date、可变随机数、定时器、网络或文件能力。恢复时 mount 必须生成相同状态、绘图与绑定，否则拒绝显示。

每次执行创建独立 QuickJS VM，预算 500ms、堆 16MiB、栈 256KiB、绘图及绑定各最多 1,000 条。浏览器保留已加载的 Worker/WASM 引擎以支持断网后的本地互动，VM 不跨调用复用；外层 Worker 有启动及单次调用终止计时器。

## SDK 3 画面与动画

`sdk.node({id,kind,x,y,width,height,color,...})` 支持 circle、ellipse、rect、path、text、group。位置指节点中心，世界左上 `(0,0)`、右下 `(1,1)`；width/height 是完整尺寸。父节点必须是本次 mount 中的 group，子节点坐标是相对父节点的世界单位偏移。ID 跨轮次稳定，渲染器按 ID 保留显示对象，变更位置平滑过渡，新对象淡入或弹入。

可选字段包含 parent、rotation、alpha、stroke、strokeWidth、roundness、gradient、shadow、path、text、fontSize、align、enter。path 是 M/L/Q/C/Z 数组，数字以自身宽高为单位，不能携带 SVG/HTML 或代码。文字用 Pixi Text 绘制。SDK 3 最多 256 节点、1,024 路径命令、24 个文字节点／2,400 字符，并限制换行数量和估算文字纹理面积；每条路径最多 64 命令，组层级最多 8。

`motions` 每节点最多 3 条轨道，最多 64 个节点有动画。一条轨道为 `{duration,loop,frames,easing?,phase?}`：duration 为 0.2–120 秒；loop 为 repeat、pingpong 或 once；frames 为 2–16 个 at 从 0 严格递增到 1 的关键帧。帧可包含 x/y 偏移、scaleX/scaleY、rotation 和 alpha。平移/旋转相加，缩放/透明度相乘。pingpong 的 duration 是单程时长。

节点上的 `motionKey`（最多 80 字符）变化时重置该节点轨道，例如 `motionKey:String(state.taps)` 让每次点击都重新跳跃。它不能放入轨道内部。宿主保存 `cues:{[nodeId]:{key,startMs}}` 和有效播放时间，恢复相同关键帧。服务端校验 cue 对应当前操作、数量不超过 64、起点不晚于播放时间。过期版本拒绝写入，较早时间的回执忽略；每两秒及关键动作保存一次。突然断电或离线时最多只能恢复已送达的检查点。

静态绘本必须无事件、无绑定、无动作和入场效果。页面按整个内容边界缩放，以免手机裁切页边；平时停止 ticker，只在变化和调整尺寸时重绘。动态时间在隐藏标签页或暂停时不推进，系统减少动态效果偏好默认暂停。不新增定时器、浏览器能力或脚本逐帧入口。

## 真实模型与归档

`GENERATOR_MODE=deepseek` 使用服务器密钥调用 `/chat/completions`。请求指定 JSON 输出、SSE 流、非思考模式，输出预算 16,384 tokens；原始 SSE 上限 8MiB、生成文本上限 192KiB、最终包上限 256KiB。请求正文、提示词版本、响应 ID、原始 SSE、片段、结束原因和用量均被归档，Authorization 不写入档案。只有完整结束且可解析的输出才能成为候选。上游错误、截断流、解析失败仍保留已收到的内容。

服务端由模型的 `{protocol,script,view}` 构造运行包并计算哈希，不采用模型声称的哈希。每个世界按轮次串行生成，事件仍可继续执行。主动重试携带上一失败产物和诊断，属于新的尝试与模型请求；不在后台无限重试。

## 提交和失败边界

收到原文 → 入队 → 创建尝试并记录请求 → 保存响应与候选文件 → 校验 → Worker 隔离试跑 → 校验输出并验证可从快照恢复 → 发送回执 → 服务端复核有效尝试与当前基线 → 数据库事务提交快照/版本/事件 → 客户端显示。

文件先写入、校验，再提交数据库引用。未提交候选永不进入活跃世界。事务中重新读取尝试与基线，以处理并发回执；成功回执重复到达返回已有版本。网络重发使用同一个 `clientSubmissionId`；主动重试创建同一轮次下的新尝试。

文字模型请求限时 120 秒，纯文字总门槛 125 秒；图片模式总门槛 500 秒，每张图片请求 180 秒、最多两张。候选等待试跑回执为 60 秒。错误、超时和重启中断保留产物与诊断。脚本异常时暂存动作整体丢弃。客户端待发送文字及素材选择放入 localStorage 队列；服务器是世界状态的权威恢复来源。宿主不接收跨域生成模块导入，也不向 QuickJS 注入宿主身份或 I/O 对象。

生成期间若世界已被点击更新，旧基线回执返回 409，候选不会立即作废。客户端重新读取同一个候选，以最新快照重新迁移/试跑，不重新生成，也不覆盖刚发生的互动。

## 互动一致性

本地 Worker 先执行已声明事件并验证可恢复性，浏览器预览临时状态；事件意图及回执先写入 localStorage，再发送服务器。服务器验证目标绑定、包、基线修订和输出 schema，通过事务产生新世界版本，返回后才视为已保存。相同 `clientEventId` 的重发返回原结果，不重复计数。

失去回执时复用原回执，过期基线时从服务器最新快照重新执行；运行或状态校验失败保存诊断并回退。断网期间最多暂存 100 个意图，重连后按序保存。若已切换到另一运行包，不将旧对象上的触碰套用到新包。文字提交等待本机待保存的互动完成，模型因此能看到最新次数。

## 恢复和已知范围

打开原世界 URL，加载已保存快照与对应包，重新在隔离运行时执行 mount 重建画面；状态、绘图操作和事件绑定必须与快照相同才显示。恢复不调用生成器，也不新增轮次。文件缺失或被修改会报错，不静默重新生成。

真实记录按 UTC 的 3 个日历月到期。清理以逐轮记录为单位，不以世界最后活跃时间顺延。正在运行的尝试和仍被未过期档案引用的版本暂缓删除；当前世界快照和运行必需文件始终保留。启动和每小时清理一次；SQLite 开启 secure_delete，清理后执行 WAL checkpoint，无引用的内容哈希文件一并清除。当前作品源码不依赖历史轮次才能查看。

档案页源码仅作为文本展示。实例仍是单所有者的私有运行环境，没有独立账户/角色系统；客户端回执也不构成不可信多用户的执行证明。撤销、完整导出、固定版本公开播放、物理/碰撞系统和骨骼动画未实现。演示地址按 2026-11-17 的确认留待后期自建，不执行 Codespaces 云端验收。

## SDK 4 图片与两种素材来源

`schemaVersion/sdkVersion=4` 沿用 SDK 3 的模式和所有能力，增加 `sprite`：

```js
sdk.node({id:'fox', kind:'sprite', asset:'fox_art', x:.5, y:.55, width:.4, height:.4,
  motions:[{duration:3,loop:'pingpong',frames:[{at:0,y:-.02},{at:1,y:.02}]}]});
```

`asset` 是本运行包清单的别名；图片居中、保持比例放入节点边界。不得传 URL 或读取像素，脚本没有图片下载/解码能力。背景、角色和上传图片都走同一节点及动画/事件机制。绘本仍拒绝动作和事件。

`ScenePackage.assets` 每项包含 `id`（脚本别名）、`imageId`（持久记录 ID）、`hash`（显示 PNG）、`originalHash`、`mediaType`、`width/height`、`name`、`role`、`source`、`credit`，以及可选 `sourceUrl`。最多 16 项、尺寸各不超过 2048、合计不超过 16,777,216 像素。新增素材不能伪造已有记录或引用其他世界上传的图片；免费图片是实例共用的。服务器逐项核对数据库清单和文件哈希。

文本提交可携带 `artSource:library|seedream`、`assetIds`（选中的持久 imageId，最多 16）、`allowUploadReferences`。三者与原文一起按 `clientSubmissionId` 去重、归档和重发，改变选择不能复用旧提交 ID。旧客户端不传这些字段仍可使用旧协议。

DeepSeek 的图片工作流响应为 `{protocol,script,view,assetIds,assetRequests}`。响应 `assetIds` 使用包别名，不是上传选择的 imageId；已有别名必须原样保留。`assetRequests` 最多两项 `{id,name,role,prompt,references?}`。新 ID 必须声明，引用最多两张且已存在。免费素材禁止作为模型参考；上传图必须同时被本次选择并获得明确许可；已有 Seedream 图片可复用为编辑参考。普通图片使用不传像素给 DeepSeek。修改动作或修复失败脚本时复用已有图片，避免重复出图。

服务器用 Seedream `/images/generations` 的 PNG、`b64_json` 响应获取图片，最多接收 24MiB 响应/16MiB 生成原图；不追踪模型返回的任意 URL。上传最多 8MiB，接受静态 PNG/JPEG/WebP，解码限制 16,777,216 像素；保留原件，按 EXIF 方向旋转后缩至 2048、去元数据并保存显示 PNG。文件按字节 SHA-256 入库，再构造最终包。图片模型请求、原始响应、状态、错误与生成尝试关联保存在 `image_jobs`；服务重启将未完成图片任务标记中断。

客户端在发送成功试跑回执前，从同源 `/api/images/:hash` 下载并校验字节哈希、解码尺寸和纹理预算。准备失败不替换当前纹理或场景。提交及互动时服务端再核对图片；只有版本提交成功才绘制新场景。重启从相同快照和图片文件恢复，不调用两个模型。原件下载为 `/api/images/:imageId/original`；查看页保留来源、哈希及图片模型请求响应链接，源码始终作为文本展示。

图片记录及原件、图片模型档案各自保留三个月。清理从所有未过期版本/尝试和当前作品追踪包内图片依赖，保留仍有引用的显示文件、原件和来源；删除过期、未使用的图片和请求响应。免费图片保留。原始上传仅因被当前作品引用而延长保留，不会让已过期的聊天请求响应一起永久保留。
