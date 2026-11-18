# And There Was…

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [繁體中文](docs/i18n/README.zh-TW.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [Français](docs/i18n/README.fr.md) · [Deutsch](docs/i18n/README.de.md) · [Português (Brasil)](docs/i18n/README.pt-BR.md) · [Русский](docs/i18n/README.ru.md)

A thought becomes a little world. A canvas for children and the grown-ups creating alongside them.

## What you can do

- Start with an empty canvas and bring a ball into the scene with a sentence.
- Describe a world, change it with OpenAI or DeepSeek, and add click or touch interactions.
- Choose a lively animated world or a still comic / picture-book page.
- Create artwork with OpenAI or Seedream, choose free assets, or upload a child’s own drawing.
- Keep the same canvas and return to your work using its saved link.

The app has ten interface languages. It uses your browser preferences or English, and remembers your choice in the language menu on this device. Each saved world has its own story language.

## Try the demo

Run the app locally and send **There is a ball** to try it without a model key. A public demo URL will be added when available.

To try pictures, choose them under **Assets / my artwork**, then send **Use the selected assets**.

![Built-in sample: a ball on the canvas](docs/media/ball.png)

## Self-host

Clone or download this repository. From its root folder, copy [`.env.example`](.env.example) to `.env`. The default configuration runs the sample without API keys.

### With Docker Compose

```sh
docker compose up --build -d
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Compose keeps your work in the `world-data` volume; keep this volume when restarting or upgrading.

### With Node.js

Use Node.js **24.11.1 or a newer Node 24 release**, with npm. Run from the repository root:

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

For a phone on the same trusted network, run `npm run start:lan` after building and open the computer’s LAN address printed in the terminal.

## Environment

Set values in `.env` and restart the service after changes. Keep API keys on the server. Existing environment variables take precedence over `.env`.

| Setting | Purpose |
| --- | --- |
| `HOST` | Listen address; default `127.0.0.1`. |
| `PORT` | HTTP port; default `3000`. |
| `DATA_DIR` | Saved works and records; default `./data`. |
| `GENERATOR_MODE` | Automatic selection by default. Use `fixture` for the local examples. |
| `OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL` | Project key, scene model and image model. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | DeepSeek API key, model and endpoint. |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Seedream API key, model, endpoint and image size. |

### AI services

Set `OPENAI_API_KEY` from your API organization and restart. OpenAI then handles scenes and AI artwork, including when the DeepSeek and Seedream keys are also present.

With the OpenAI key removed, `DEEPSEEK_API_KEY` enables scene generation and `SEEDREAM_API_KEY` enables optional AI artwork. Free assets and uploaded drawings can be placed directly.

Real model requests may incur provider charges. Existing works can be reopened without generating them again.

## Help

- [User guide (English)](docs/help/README.md)
- [使用帮助（简体中文）](docs/help/README.zh-CN.md)

This is a private, single-owner app without built-in accounts. For internet access, place it behind HTTPS and authentication. Save the full `/w/<worldId>` link to reopen the same world.

## License

Code: [MIT](LICENSE). Bundled artwork: [Kenney CC0 assets](fixtures/library/README.md). Uploaded and generated works are not included in the code license.
