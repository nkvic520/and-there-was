# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

ひとつの思いつきから、小さな世界へ。子どもと、一緒に創作する大人のためのキャンバスです。

## できること

- 空のキャンバスに、一文でボールを出現させます。
- DeepSeek で世界を描写・変更し、クリックやタッチで遊べるようにします。
- 動き続ける世界、または静止した漫画・絵本のページを選べます。
- 同じキャンバスで創作を続け、保存したリンクから作品に戻れます。

アプリの画面表示は現在、簡体字中国語です。

## デモを試す

公開ホスト型のデモはまだありません。ローカルで起動し、**「有一个球」**（「ボールがある」）と送信してください。内蔵サンプルにはモデルの API キーは不要です。この中国語の文をそのまま使います。

![内蔵サンプル：キャンバスに現れたボール](../../docs/media/ball.png)

## セルフホスト

このリポジトリをクローンまたはダウンロードし、ルートフォルダーの [`.env.example`](../../.env.example) を `.env` にコピーします。初期設定では API キーなしでサンプルを利用できます。

### Docker Compose を使う

```sh
docker compose up --build -d
```

[http://127.0.0.1:3000](http://127.0.0.1:3000) を開きます。作品は Compose の `world-data` ボリュームに保存されるため、再起動や更新時にもこのボリュームを残してください。

### Node.js を使う

**Node.js 24.11.1 以降の Node 24 系**と npm が必要です。リポジトリのルートで実行します。

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

同じ信頼できるネットワーク上のスマートフォンで使うには、ビルド後に `npm run start:lan` を実行し、ターミナルに表示された PC の LAN アドレスを開きます。

## 環境設定

`.env` に設定を記入し、変更後はサービスを再起動します。API キーはサーバー側だけに保存してください。既存の環境変数は `.env` より優先されます。

| 設定 | 用途 |
| --- | --- |
| `HOST` | 待ち受けアドレス。初期値は `127.0.0.1`。 |
| `PORT` | HTTP ポート。初期値は `3000`。 |
| `DATA_DIR` | 作品と記録の保存先。初期値は `./data`。 |
| `GENERATOR_MODE` | 内蔵サンプルは `fixture`、自由な創作は `deepseek`。 |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | DeepSeek の API キー、モデル、接続先。 |

### AI サービス

`GENERATOR_MODE=deepseek` と `DEEPSEEK_API_KEY` を設定すると DeepSeek を有効にできます。その他の接続設定は `.env.example` を参照してください。

実際のモデルへのリクエストには、提供元の料金が発生する場合があります。保存済みの作品は再生成せずに開けます。

## ヘルプ

- [ユーザーガイド（英語）](../../docs/help/README.md)
- [ユーザーガイド（簡体字中国語）](../../docs/help/README.zh-CN.md)

アカウント機能を持たない、単一の所有者向けのプライベートアプリです。インターネット経由で使う場合は、前段に HTTPS と認証を設定してください。同じ世界に戻るには、完全な `/w/<worldId>` リンクを保存します。

## ライセンス

コード：[MIT](../../LICENSE)。
