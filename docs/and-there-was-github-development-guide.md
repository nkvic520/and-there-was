# 「就有了」GitHub 开发说明

项目英文名 **And There Was…**，GitHub 仓库名 `and-there-was`。产品行为和验收要求见[「就有了」项目架构与需求说明](./and-there-was-architecture-and-requirements.md)。GitHub 承载代码、协作、开发环境、构建、发布和演示。

## 一个仓库和一个应用

前端、后端、共用场景 SDK、项目自带素材、演示样例、测试、文档与部署配置放在同一个 GitHub 仓库。开发使用同一份代码检出，前后端取自同一提交并共用一个发布版本。

首版采用一个全栈应用容器。构建把前端静态文件打进服务端镜像，Node.js 在同一个地址提供画布和 `/api/`。项目内的演示素材随镜像发布。SQLite、生成作品和真实会话档案保存在同一部署实例的持久卷，模型凭证由实例配置提供。

## GitHub 资源怎么用

| 资源 | 用途 | 交付物 |
| --- | --- | --- |
| **Repository、Issues、Pull Requests** | 一个公开开源仓库存放代码和文档。用 Issue 跟踪可验收的任务，用分支和 PR 提交改动。 | 源码、提交历史、验收记录、README、开源许可证。 |
| **Codespaces** | 用仓库里的 `.devcontainer` 固定开发环境。从同一个工作区启动前端和 API，并转发一个应用端口。 | 可重建的开发环境和同址全栈演示。 [Codespaces 生命周期与端口转发](https://docs.github.com/en/codespaces/about-codespaces/deep-dive) |
| **Actions** | PR 自动检查前后端、运行测试并验证全栈构建。版本标签触发同一提交的镜像与安装文件发布。 | 检查结果、发行产物及对应提交。 [Actions 运行器](https://docs.github.com/en/actions/concepts/runners) |
| **GHCR 与 Releases** | 仓库关联一个全栈镜像。每个 Release 带对应镜像版本、安装配置和升级说明。 | `ghcr.io/<owner>/and-there-was:<version>`、镜像摘要、Compose 文件和配置样例。 [发布容器镜像](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) · [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) |

## 演示和部署

**统一的全栈演示** 在 Codespace 启动整个应用。开发时从仓库根目录启动前后端，前端开发服务将 `/api/` 转到后端，Codespaces 转发同一个入口。验证发行版时用该仓库发布的镜像启动。样例模式与真实模型模式都走完整的前端、API、运行与保存链路。转发地址在 Codespace 运行期间可用，默认使用私有端口。 [Codespaces 端口转发](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)

**模型接入** 合成样例模式用确定性响应复现生成、脚本执行、保存和恢复。真实生成模式由实例配置模型地址与凭证。若推理计算也限定在 GitHub 的环境内，可先在 Codespace 试跑轻量本地模型，实测算力与延迟。GitHub Models 的推理 API 已退役。 [GitHub Models 官方说明](https://docs.github.com/en/github-models)

**常驻自部署** 部署者用 Release 提供的版本和 Compose 文件，在自己的服务器一次启动整个应用。浏览器从同一个 HTTPS 地址加载画布、素材和 API。升级时使用指定版本的全栈镜像，数据库和素材沿用同一持久卷，备份和恢复以实例为单位。

## 仓库起步

开工时确认 `and-there-was` 所属的 GitHub 账号或组织，公开发布前选定开源许可证。 [GitHub 仓库许可证说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)

```text
apps/web/           画布、输入和前端素材
apps/server/        前端静态文件、API、模型调用和版本持久化
packages/scene/     宿主接口、协议校验和隔离执行
fixtures/           随项目提供的合成文本、协议、脚本、素材和世界快照
docs/               产品需求和本开发说明
.devcontainer/      Codespaces 环境
.github/workflows/  全栈检查、镜像构建与版本发布
Dockerfile          构建并打包前端和服务端
compose.yml         同一实例的应用与持久卷配置
.env.example        配置字段和示例值
```

用锁文件固定 Node.js 项目的依赖。README 给出从根目录启动整个应用的命令、全栈演示开启方式和自部署步骤。日常检查在合成样例模式下运行，覆盖场景协议更新、状态迁移、脚本失败、重试与撤销。真实模型测试由维护者在有模型配置的环境运行。用 Windows 和 Android 实机检查中文输入法、手机软键盘和触摸。

## 开发与验收顺序

1. **搭好仓库和开发环境。** 提交两份 Markdown、README、开发容器和第一条 PR 检查。用合成响应跑通空画布、文本提交、生成包的校验、隔离执行和保存。
2. **跑通真实模型。** 在 Codespace 连续输入「要有光」和「碰三次出现一扇门」。检查现场生成的协议和代码、第三次点击或触摸、失败恢复及重启后的世界恢复。记录所测提交、模型与首个可辨认变化的耗时。
3. **发布可复现的版本。** 给通过验收的提交打版本标签，由 Actions 发布一个全栈 GHCR 镜像和对应 Release。在 Codespace 中用该发行版，通过一个转发地址验证画布、API、素材加载、模型交互、保存和重启恢复。再用同一发行版验证自部署的备份恢复和版本锁定的作品链接。

## 下一项目会话的提示词

将两份 Markdown 放入同一个 GitHub 仓库的 `docs/` 目录，或作为附件一起提供给项目会话。

### 首次发送

```text
项目叫「就有了」（And There Was…），GitHub 仓库名为 and-there-was。请读取 docs/and-there-was-architecture-and-requirements.md 和 docs/and-there-was-github-development-guide.md，或使用我附上的同名 Markdown。产品需求和 GitHub 工程约定以这两份文档为准。

本轮先做只读核对和实现计划。请检查当前仓库和开发环境，给出首个可运行版本的范围、实施顺序、验收步骤，以及确实需要我决定的事项。

第一版先规划这条链路。打开空画布，输入「有一个球」。服务端用可复现的样例响应提供场景协议和脚本，应用校验并隔离执行，在原画布显示球。提交文本、协议、代码和世界状态可以查到，重启服务后可以恢复同一场景。
```

### 准备实现时发送

```text
按确认的范围开始实现首个可运行版本。实际运行「有一个球」的输入、隔离执行、保存和重启恢复链路，并给我启动命令、测试结果和可复现的验收步骤。
```
