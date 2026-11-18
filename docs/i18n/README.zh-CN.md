# 就有了 · And There Was…

[English](../../README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

一个念头，一个小世界。让孩子和陪伴他们的大人一起用文字创作。

## 可以做什么

- 从空画布开始，用一句话让球出现。
- 通过 DeepSeek 描述和修改世界，加入鼠标点击或触摸互动。
- 选择持续活动的动态世界，或静态漫画／绘本页面。
- 使用 Seedream 生成图片，选择免费素材，或上传小朋友自己的画作。
- 在同一张画布上继续创作，用保存的链接回到作品。

应用界面目前为简体中文。

## 体验样例

目前没有公开托管的演示地址。自部署后发送 **「有一个球」** 即可体验。内置样例无需模型密钥，需使用这句准确的中文。

要在没有模型密钥时体验图片，先在 **素材／我的作品** 中选图，再发送 **「使用选中的素材」**。

![内置样例：画布上出现一个球](../../docs/media/ball.png)

## 自部署

克隆或下载本仓库，在根目录将 [`.env.example`](../../.env.example) 复制为 `.env`。默认配置可直接运行无需密钥的样例。

### 使用 Docker Compose

```sh
docker compose up --build -d
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。Compose 将作品保存在 `world-data` 卷中；重启和升级时保留此卷。

### 使用 Node.js

需要 **Node.js 24.11.1 或更新的 Node 24 版本**及 npm。在仓库根目录执行：

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

同一可信网络的手机访问：构建后运行 `npm run start:lan`，打开终端打印的电脑局域网地址。

## 环境配置

在 `.env` 中设置参数，修改后重启服务。密钥仅配置在服务端；已有环境变量优先于 `.env`。

| 配置项 | 用途 |
| --- | --- |
| `HOST` | 监听地址，默认 `127.0.0.1`。 |
| `PORT` | HTTP 端口，默认 `3000`。 |
| `DATA_DIR` | 作品及记录的保存目录，默认 `./data`。 |
| `GENERATOR_MODE` | `fixture` 使用内置样例；`deepseek` 开启自由创作。 |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | DeepSeek 密钥、模型和接口地址。 |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Seedream 密钥、模型、接口地址和图片尺寸。 |

### AI 服务

设置 `GENERATOR_MODE=deepseek` 并填写 `DEEPSEEK_API_KEY` 即可启用 DeepSeek，其他连接参数见 `.env.example`。

DeepSeek 编排场景和互动，Seedream 为 AI 画图生成图片。免费素材和上传本身不调用图片模型；DeepSeek 模式下编排场景仍使用文字模型。

真实模型请求可能产生供应商费用。重新打开已有作品无需再次生成。

## 帮助

- [User guide（英文）](../../docs/help/README.md)
- [使用帮助（简体中文）](../../docs/help/README.zh-CN.md)

当前为单所有者的私有应用，没有内置账号系统。公网访问需在前方配置 HTTPS 和身份认证。保存完整的 `/w/<worldId>` 链接，即可回到同一个世界。

## 许可

代码采用 [MIT](../../LICENSE) 许可。 内置图片采用 [Kenney CC0 素材](../../fixtures/library/README.md)。上传及生成的作品不包含在代码许可内。
