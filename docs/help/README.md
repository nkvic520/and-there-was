# User guide

[Project overview](../../README.md) · [简体中文](README.zh-CN.md)

## Create and reopen a world

Open the home page to create an empty world. Type **有一个球** and click the arrow to send it. Choosing a word with an input method or pressing Enter does not send the sentence; use the send button.

The address becomes `/w/<worldId>`. Save or bookmark the **whole address** to return to that work. Opening the home page creates another world. A saved world can be reopened after a service restart as long as its data is kept.

The app interface is currently in Simplified Chinese. The bundled sample recognizes exact Chinese phrases, so copy the examples as shown.

## Choose a world type

- **动态动画 — Animated:** a world with ongoing movement and click or touch interactions. Use **暂停动画** to pause and **播放动画** to resume.
- **静态漫画／绘本 — Comic / picture book:** a still illustration or comic page with text.

Choose a type when starting a world. Use **新世界** to create a different kind of work. If your device prefers reduced motion, animation starts paused and can be resumed with the play button.

## Free-form creation with DeepSeek

Set `GENERATOR_MODE=deepseek` and your own `DEEPSEEK_API_KEY` in `.env`, then restart. You can describe a scene and add requests to the same world, such as **要有光** (“Let there be light”) followed by **碰三次出现一扇门** (“After three touches, make a door appear”).

The model can take some time and may fail. **再试一次** retries a failed request; it sends another model request and may incur a charge. If an attempt fails, the last saved scene stays available.

Set `GENERATOR_MODE=fixture` for the no-key sample. This mode recognizes **有一个球**, rather than arbitrary sentences.

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
| `GENERATOR_MODE` | `fixture` | Use `deepseek` for real model generation. |
| `DEEPSEEK_API_KEY` | Empty | Your server-side API key. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek service address. |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Model to use. |
| `ARCHIVE_RETENTION_MONTHS` | `3` | Supported retention period for real records. |

Compose sets the in-container listen address, port and data path in `compose.yml`, and publishes port 3000 on the host’s loopback address. Change the port mapping there if needed. Model settings are read from the root `.env` file.

## Network access

For a phone on the same trusted network, build the app, run `npm run start:lan`, and open the computer’s LAN URL printed in the terminal. A phone’s `127.0.0.1` refers to the phone itself, not the computer. Check your firewall if the LAN address does not open.

The app has no built-in accounts and is intended for a private, single-owner instance. Internet access requires HTTPS and authentication in front of both the page and its API. If the proxy rewrites the Host header, configure PUBLIC_ORIGIN; with Compose, add it to the app service's environment in compose.yml too. There is currently no public hosted demo.

## Save, back up and restore

For Node deployments, keep the entire directory selected by `DATA_DIR`. For Compose, keep the `world-data` volume. Stop the service before taking a complete copy, and restore that whole copy to the same data location. Removing the directory or volume removes the saved works.

After an update or restart, reopen the complete world link rather than the home page. Saved game state and saved animation progress are restored. A sudden exit may lose animation time that had not yet been saved. Reopening a saved world does not call the model again.

Real records are kept for **three calendar months per record**. The current work and the files it needs remain available. Expired inputs, model requests and responses, and unneeded history are cleaned up automatically. Bundled samples are retained. Copies in your own backups and provider-side records follow their own retention rules.

The owner can open `/inspect/<worldId>` to view saved inputs, generated content and versions. This is an owner’s view, separate from the creation screen.

## Common questions

**Why did my world disappear?** Reopen its full `/w/<worldId>` address and check that the service is using the original data directory or volume. The home page always creates a new world.

**Why doesn’t my sentence work?** In `fixture` mode, only the sample phrases listed above are supported. For free-form requests, configure DeepSeek and restart.

**Why can’t the phone connect?** Use the computer’s LAN address, make sure both devices can reach that network, and allow the app’s port through the computer’s firewall.

**Why is generation failing?** Check the configured provider, model access and account balance. After updating keys or model settings, restart the service. The `/api/health` page shows the active model, without displaying the keys. A failed scene can be retried while keeping the last saved work.

**Why is the picture still?** A picture-book world is intentionally still. In an animated world, check the play/pause control and the device’s reduced-motion setting.

