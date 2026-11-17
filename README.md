# 就有了 · And There Was…

说一句「有一个球」，它就出现在眼前。

这是一个可自部署的 2D 世界实验。当前版本使用**确定性样例**，真实经过服务端归档、协议校验、Worker 内 QuickJS 隔离试跑、事务提交和 PixiJS 渲染。无需模型密钥。

## 启动

需要 Node.js 24（已验证 24.11.1）和 npm。Windows PowerShell、Linux、Codespaces 均从仓库根目录执行：

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173>。API 在 3000 端口，网页通过同源代理访问。输入「有一个球」，点击箭头发送。输入法选字和 Enter 不发送整句；只用发送按钮提交。系统听写所得文字也可编辑，应用不接收音频。

生产构建使用一个 Node 进程同时提供页面、WASM 和 API：

```sh
npm run build
npm start
```

打开 <http://127.0.0.1:3000>。配置见 [.env.example](.env.example)。`npm start` 自动读取根目录 `.env`。开发模式可直接通过环境变量设置 `DATA_DIR` / `PORT`（改 API 端口时也需调整 Vite 代理）。

同一可信局域网的手机试玩，构建后运行 `npm run start:lan`，在手机浏览器输入终端打印的电脑 WLAN/以太网地址，例如 `http://<电脑局域网IP>:3000/`。此模式监听所有网卡，仅用于你信任的局域网；默认 `npm start` 仍只监听本机。页面在普通局域网 HTTP 下也能完成哈希校验和生成，不依赖仅限 HTTPS/localhost 的浏览器加密接口。

## 查看和恢复

打开首页会创建一个空世界，并自动变成 `/w/<世界ID>`。**保留这个完整 URL**，重启后打开它会恢复同一世界。首页 `/` 总是新建一个空世界。

项目所有者可直接打开 `/inspect/<世界ID>` 查看原文、模型样例请求与原始响应、协议、脚本、哈希、试跑结果、版本和事件。此入口不放在孩子的画布上。

默认持久目录为 `data/`：`worlds.sqlite`（含 WAL/SHM）和 `artifacts/`。不要删除目录或使用另一个 `DATA_DIR` 后期待旧场景出现。停止服务后复制整个目录可做本地备份；不要在服务运行时只复制 SQLite 主文件。真实会话数据和 `.env` 被 Git/Docker 忽略。

每次主动发送是一个新轮次；网络重发复用提交 ID。连续发送样例仍显示一个球。其他文字会被保存并提示暂不支持。失败尝试可重试，最近成功的场景保持不变。重启时未提交的尝试标记为中断，可再次尝试。

## 检查

```sh
npm run check
npm run build
npm run test:e2e
```

本机端到端测试使用已安装的 Chrome、Edge，另外运行手机尺寸/触摸模拟。没有这两个浏览器时可用 `npx playwright install chromium`，再设置 `CI=1` 执行端到端测试。CI 自动安装 Chromium。

测试会启动独立的 3179 端口服务和临时数据目录，执行真实脚本、重启服务进程、用新的浏览器上下文恢复并比较完整快照。截图、浏览器版本和计时保存在忽略的 `test-results/`；汇总见 [验收记录](docs/acceptance.md)。

## 容器和 Codespaces

```sh
docker compose up --build -d
# 停止后启动，保持 world-data 卷即可恢复。
docker compose restart
# 独立临时卷的构建与恢复测试：
npm run test:container
```

Compose 只绑定本机 3000 端口。Codespaces 使用开发容器，运行 `npm run dev` 后只转发 5173，保持端口 **Private**。前端、API 和 WASM 从同一个转发地址访问。CI 同时检查 Windows、Linux 和全栈容器。

当前是单实例、单所有者的私有试玩版本，没有应用内账号系统。用于本机、可信局域网或私有 Codespaces；公网自部署需先配置 HTTPS 和身份访问控制。源码公开不代表档案公开。

## 当前边界

- 仅「有一个球」样例；SDK 提供可序列化状态、圆和椭圆绘制。协议采用有界 JSON Schema 子集，暂不支持引用和事件。
- 脚本在 QuickJS/WASM 中执行，不向其注入 DOM、网络、文件或身份能力。500ms 调用预算、16MiB QuickJS 堆、1,000 条输出操作，并有外层 Worker 超时。该堆限制不代表整个浏览器进程内存限制。
- 试跑结果在服务端二次校验并提交后才显示；保存后校验失败会保留旧场景。恢复时重新加载对应脚本，重建的状态和绘图必须与已保存快照一致。
- 试跑回执来自私有实例的可信宿主，不作为面向不可信多用户的远程执行证明。
- 真实模型、连续生成新玩法、互动、迁移、撤销、完整导出和作品发布尚未实现。
- REDMI Turbo 4 的 Edge 已由用户实测输入、选字、触摸发送和重启恢复。Android Chrome、Windows 系统级中文输入法与离线听写尚未实测；浏览器模拟不能代替。

需求依据：[项目架构与需求说明](docs/and-there-was-architecture-and-requirements.md) · [GitHub 开发说明](docs/and-there-was-github-development-guide.md)。开源许可：[MIT](LICENSE)。
