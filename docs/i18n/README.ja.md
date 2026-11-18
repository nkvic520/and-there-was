# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

ひとつの思いつきから、小さな世界へ。子どもと、一緒に創作する大人のためのキャンバスです。

## できること

- 空のキャンバスに、一文でボールを出現させます。
- OpenAI または DeepSeek で世界を描写・変更し、クリックやタッチで遊べるようにします。
- 動き続ける世界、または静止した漫画・絵本のページを選べます。
- OpenAI または Seedream で画像を生成するほか、無料素材や子どもの絵をアップロードして使えます。
- 同じキャンバスで創作を続け、保存したリンクから作品に戻れます。

画面は10言語に対応しています。初回はブラウザーの言語設定に従い、対応する言語がなければ英語を使います。言語メニューで選ぶと端末に保存されます。物語の言語は世界ごとに保存されます。

## デモを試す

アプリをローカルで起動し、**ボールがひとつある** と送ると、APIキーなしで試せます。公開デモのURLは準備ができ次第掲載します。

絵を使うには **素材・自分の絵** で選び、**選んだ素材を使って** と送ります。

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
| `GENERATOR_MODE` | 既定では自動選択。ローカルサンプルを使うには `fixture` を指定します。 |
| `OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL` | プロジェクトキー、シーン用モデル、画像用モデル。 |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | DeepSeek の API キー、モデル、接続先。 |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Seedream の API キー、モデル、接続先、画像サイズ。 |

### AI サービス

API 組織の `OPENAI_API_KEY` を設定して再起動すると、シーン作成と AI 作画に OpenAI を使います。DeepSeek と Seedream のキーは一緒に保存できます。

OpenAI のキーを外して再起動すると、シーンには `DEEPSEEK_API_KEY`、任意の AI 作画には `SEEDREAM_API_KEY` を使います。無料素材やアップロードした絵はそのまま配置できます。

実際のモデルへのリクエストには、提供元の料金が発生する場合があります。保存済みの作品は再生成せずに開けます。

## ヘルプ

- [ユーザーガイド（英語）](../../docs/help/README.md)
- [ユーザーガイド（簡体字中国語）](../../docs/help/README.zh-CN.md)

アカウント機能を持たない、単一の所有者向けのプライベートアプリです。インターネット経由で使う場合は、前段に HTTPS と認証を設定してください。同じ世界に戻るには、完全な `/w/<worldId>` リンクを保存します。

## ライセンス

コード：[MIT](../../LICENSE)。 同梱画像：[Kenney の CC0 素材](../../fixtures/library/README.md)。アップロードした作品や生成作品は、コードのライセンスに含まれません。
