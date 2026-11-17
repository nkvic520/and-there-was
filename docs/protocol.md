# 首个版本协议与恢复约定

这个文件描述已实现的样例版本；产品完整要求仍以两份需求文档为准。

## 入口

| 方法与路径 | 含义 |
| --- | --- |
| `POST /api/worlds` | 创建空世界和 revision 0 快照 |
| `GET /api/worlds/:id` | 当前已提交快照 |
| `POST /api/worlds/:id/turns` | `{text, clientSubmissionId}`，保留原文；同一提交 ID 返回原轮次 |
| `GET /api/worlds/:id/events` | SSE，支持 `Last-Event-ID` 或 `?after=`，序号与事件落库 |
| `GET /api/attempts/:id/candidate` | 当前有效候选包和它的基线快照 |
| `POST /api/trials` | 隔离试跑成功/失败回执，携带尝试 ID、包哈希、基线版本与修订号 |
| `POST /api/turns/:id/retry` | 失败轮次重新排队，保留旧尝试并创建新尝试 |
| `GET /api/worlds/:id/records` | 当前快照、轮次、尝试、所有版本和事件索引 |
| `GET /api/artifacts/:hash` | 读取并重新核验内容哈希；始终以纯文本返回 |
| `GET /api/health` | 样例模式及服务健康状态 |

API 仅接收最终文字与元数据，不接收麦克风或音频输入。仅保证单个 Node 实例管理同一个数据目录，不允许多个实例共享同一 SQLite 文件。

## 生成包

`formatVersion=1`、`sdkVersion=1`，入口固定为 `scene.js`，包含 `protocol.json`、`scene.js`、`view.json` 的 UTF-8 源文与 SHA-256。素材清单为空。ID/时间戳位于服务端记录，不进入可复现的样例内容。

协议描述整个模块状态。受限 JSON Schema 支持对象、数组、字符串、数值、布尔、null、必填字段、常量/枚举与长度/数量边界；对象必须闭合，数组必须有数量上限。不接受 `$ref`、正则或自定义关键字。第一版事件定义为空。

脚本必须导出同步 `mount(sdk)`，返回 undefined。SDK 包含 `getState()`、`setState(value)`、`circle(id,x,y,radius,color,alpha)`、`ellipse(id,x,y,radiusX,radiusY,color,alpha)`。所有绘图坐标在 0–1 的正方形内，按画布短边等比缩放并居中。宿主只识别绘图操作，不识别中文输入或 Ball 类型。

## 提交和失败边界

收到原文 → 入队 → 创建尝试并记录请求 → 保存响应与候选文件 → 校验 → Worker 隔离试跑 → 校验输出并验证可从快照恢复 → 发送回执 → 服务端复核有效尝试与当前基线 → 数据库事务提交快照/版本/事件 → 客户端显示。

文件先写入、校验，再提交数据库引用。未提交候选永不进入活跃世界。事务中重新读取尝试与基线，以处理并发回执；成功回执重复到达返回已有版本。网络重发使用同一个 `clientSubmissionId`；主动重试创建同一轮次下的新尝试。

生成超时 10 秒，候选等待试跑回执超时 60 秒；错误、超时和重启中断保留产物与诊断。脚本异常时暂存动作整体丢弃。客户端待发送文字放入 localStorage 队列；服务器是世界状态的唯一恢复来源。宿主不接收跨域生成模块导入，也不向 QuickJS 注入宿主身份或 I/O 对象。

## 恢复和已知范围

打开原世界 URL，加载已保存快照与对应包，重新在隔离运行时执行 mount 重建画面；状态和绘图操作必须与快照相同才显示。恢复不调用生成器，也不新增轮次。文件缺失或被修改会报错，不静默重新生成。

档案页源码仅作为文本展示。当前档案依赖本机或 Codespaces 私有入口的访问边界，没有独立账户/角色系统。公开部署、多用户认证、协议迁移、实时交互事件回放和归档导出不在这个版本内。
