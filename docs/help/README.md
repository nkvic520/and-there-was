# User guide

[Project overview](../../README.md) · [简体中文](README.zh-CN.md)

## Create and reopen a world

Open the home page to create an empty world. Type **There is a ball** and click the arrow to send it. Choosing a word with an input method or pressing Enter does not send the sentence; use the send button.

The canvas fills the browser window. After the scene appears, choose **Keep creating** to open the writing box again. You can fold it away while playing and return to your draft.

The address becomes `/w/<worldId>`. Save or bookmark the **whole address** to return to that work. Opening the home page creates another world. A saved world can be reopened after a service restart as long as its data is kept.

Open the world menu in the upper right and choose **Language**. The app remembers it on this device. On a first visit it checks your browser languages and falls back to English. The sample input and artwork picker show phrases you can send in the selected language.

The first meaningful sentence sets the language of a new story. For a name such as “Milo” or an emoji, the app uses the menu language. A world keeps its story language as you edit it or open it on another device. To change the language of the work, ask explicitly, for example “Tell this story in Japanese.” Titles and narration follow the story language. Your submitted sentences and the names you give uploaded drawings are saved as written.

## Choose a world type

- **Animation** — a world with ongoing movement and click or touch interactions. Open the world menu and use **Pause animation** to pause and **Play animation** to resume.
- **Comic / picture book** — a still illustration or comic page with text.

Choose a type when starting a world. Use **New world** in the world menu to create a different kind of work. If your device prefers reduced motion, animation starts paused and can be resumed with the play button.

## Free-form creation

Set `OPENAI_API_KEY` in the server’s `.env` and restart. Use a project key from the API organization holding your credits. The default `auto` mode selects OpenAI for both scenes and artwork. To use DeepSeek and optional Seedream instead, remove the OpenAI key and restart with the other keys configured. You can describe a scene and add requests to the same world, such as **Let there be light** followed by **After three touches, make a door appear**.

The model can take some time and may fail. **Try again** retries a failed request; it sends another model request and may incur a charge. If an attempt fails, the last saved scene stays available.

Set `GENERATOR_MODE=fixture` for the no-key sample. This mode recognizes **There is a ball** and **Use the selected assets**, rather than arbitrary sentences.

## Choose artwork

Open the artwork selector below the input box. This choice is independent of the world type.

### AI artwork

OpenAI provides both scene creation and artwork with one key. When using DeepSeek for scenes, configure Seedream for artwork. The canvas can stay plain. When a new background is needed, the image model receives the canvas dimensions at the time you send your sentence. Turning your device reframes the saved scenery. Characters can move separately from it. Existing pictures can be reused for motion changes. An image character can move, scale, rotate and react to a click; a single image does not provide articulated limb animation.

### Assets / my artwork

Select bundled images or upload a drawing. Give an upload a name and choose its role: **Character / sticker**, **Background** or **Full-page drawing**. The selected images accompany your next sentence. In sample mode, send **Use the selected assets** to use them.

- Static PNG, JPEG and WebP files up to **8 MB** are supported. If a large photo is rejected, reduce its dimensions before uploading.
- The original file is kept. The display copy is oriented correctly and resized when needed. Paper backgrounds are kept; uploading does not automatically cut out or repaint the drawing.
- The reference-image checkbox names the active provider (OpenAI or Seedream). Check it to allow the selected uploads to be sent to that provider for the next submission. Later submissions or a different provider need fresh permission.
- Bundled [Kenney assets](../../fixtures/library/README.md) use CC0 and are not sent as image-model references. A provider can use its own generated images as references for later edits. Other saved images can still be placed directly.

Placing a free asset or uploaded drawing uses the saved image. In real-model mode, writing the scene still uses the text model. If a provider runs out of credits, the current work stays playable. The owner can check credit balance, project access and model availability. Requests stay with the selected provider until the owner changes the configuration.

For OpenAI requests, the app stores the world locally and requests `store:false` for scene generation. Before processing personal data of children under 13 or the applicable age of digital consent via OpenAI, enable approved Zero Data Retention for the API organization or project and use eligible models. These provider controls are separate from this app’s three-month archive policy. [OpenAI under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) · [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

## Install and configure

From the repository root, copy `.env.example` to `.env`. Keep the file private.

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```sh
cp .env.example .env
```

If a `.env` file already exists, edit it instead of overwriting it. Then choose one launch method:

| Method | Requirements | Commands |
| --- | --- | --- |
| Docker Compose | Docker with Compose | `docker compose up --build -d` |
| Node.js | Node 24.11.1 or newer within Node 24, and npm | `npm ci`, `npm run build`, `npm start` |

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Node startup reads the root `.env` file; values already present in the process environment take precedence. Restart the service after editing configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Node listen address. |
| `PORT` | `3000` | Node HTTP port. |
| `DATA_DIR` | `./data` | Persistent works and records. |
| `PUBLIC_ORIGIN` | Unset | Exact public origin, such as `https://example.com`, if an authenticated reverse proxy rewrites the Host header. |
| `GENERATOR_MODE` | `auto` | Prefer OpenAI when its key is present, otherwise use configured DeepSeek or the bundled examples. Explicit `fixture` uses only examples. The legacy `deepseek` setting also prefers an OpenAI key. |
| `OPENAI_API_KEY` | Empty | Project key for both OpenAI services. Subscription API credits apply to the linked organization. |
| `OPENAI_TEXT_MODEL` | `gpt-6.2-sol` | Scene and interaction model supporting structured Responses. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-sunburst` | Model for new artwork and reference-image edits. |
| `DEEPSEEK_API_KEY` | Empty | Your server-side API key. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek service address. |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Model to use. |
| `ARCHIVE_RETENTION_MONTHS` | `3` | Supported retention period for real records. |
| `SEEDREAM_API_KEY` | Empty | Your server-side Volcano Engine Ark API key. |
| `SEEDREAM_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` | Seedream service address. |
| `SEEDREAM_MODEL` | `doubao-seedream-5-5-261028` | Enabled model or endpoint ID. |
| `SEEDREAM_SIZE` | `2K` | Requested image size. |

Enable the selected Seedream model in your Volcano Engine Ark account. The default model supports the image settings used by the app; other models must support the same settings.

Compose sets the in-container listen address, port and data path in `compose.yml`, and publishes port 3000 on the host’s loopback address. Change the port mapping there if needed. Model settings are read from the root `.env` file.

## Network access

For a phone on the same trusted network, build the app, run `npm run start:lan`, and open the computer’s LAN URL printed in the terminal. A phone’s `127.0.0.1` refers to the phone itself, not the computer. Check your firewall if the LAN address does not open.

The app has no built-in accounts and is intended for a private, single-owner instance. Internet access requires HTTPS and authentication in front of both the page and its API. If the proxy rewrites the Host header, configure PUBLIC_ORIGIN; with Compose, add it to the app service's environment in compose.yml too. There is currently no public hosted demo.

## Save, back up and restore

For Node deployments, keep the entire directory selected by `DATA_DIR`. For Compose, keep the `world-data` volume. Stop the service before taking a complete copy, and restore that whole copy to the same data location. Removing the directory or volume removes the saved works.

After an update or restart, reopen the complete world link rather than the home page. Saved game state and saved animation progress are restored. A sudden exit may lose animation time that had not yet been saved. Reopening a saved world does not call the model again.

Real records are kept for **three calendar months per record**. The current work and the files it needs remain available. Expired inputs, model requests and responses, and unneeded history are cleaned up automatically. Unused uploaded or generated images also expire after three months; images and originals still used by the current work are retained. Bundled samples are retained unless used with real uploaded material. Copies in your own backups and provider-side records follow their own retention rules.

Choose **World history** in the world menu, or open `/inspect/<worldId>`, to view saved inputs, generated content and versions, including image sources and original-image downloads. This is an owner’s view, separate from the creation screen.

## Common questions

**Why did my world disappear?** Reopen its full `/w/<worldId>` address and check that the service is using the original data directory or volume. The home page always creates a new world.

**Why doesn’t my sentence work?** In `fixture` mode, only the sample phrases listed above are supported. For free-form requests, configure OpenAI or DeepSeek and restart.

**Why can’t the phone connect?** Use the computer’s LAN address, make sure both devices can reach that network, and allow the app’s port through the computer’s firewall.

**Why is generation failing?** Check the configured provider, model access and account balance. After updating keys or model settings, restart the service. The `/api/health` page shows the active model and whether image generation is configured, without displaying the keys. A failed scene can be retried while keeping the last saved work.

**Why is the picture still?** A picture-book world is intentionally still. In an animated world, check the play/pause control and the device’s reduced-motion setting.
