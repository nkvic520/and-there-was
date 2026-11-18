# 就有了 · And There Was…

[English](../../README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

一个念头，一个小世界。让孩子和陪伴他们的大人一起用文字创作。

## 可以做什么

- 从空画布开始，用一句话让球出现。
- 在同一张画布上继续创作，用保存的链接回到作品。

应用界面目前为简体中文。

## 体验样例

目前没有公开托管的演示地址。自部署后发送 **「有一个球」** 即可体验。内置样例无需模型密钥，需使用这句准确的中文。

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

## 帮助

- [User guide（英文）](../../docs/help/README.md)
- [使用帮助（简体中文）](../../docs/help/README.zh-CN.md)

当前为单所有者的私有应用，没有内置账号系统。公网访问需在前方配置 HTTPS 和身份认证。保存完整的 `/w/<worldId>` 链接，即可回到同一个世界。

## 许可

代码采用 [MIT](../../LICENSE) 许可。
