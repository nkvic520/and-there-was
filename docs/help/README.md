# User guide

[Project overview](../../README.md) · [简体中文](README.zh-CN.md)

## Create and reopen a world

Open the home page to create an empty world. Type **有一个球** and click the arrow to send it. Choosing a word with an input method or pressing Enter does not send the sentence; use the send button.

The address becomes `/w/<worldId>`. Save or bookmark the **whole address** to return to that work. Opening the home page creates another world. A saved world can be reopened after a service restart as long as its data is kept.

The app interface is currently in Simplified Chinese. The bundled sample recognizes exact Chinese phrases, so copy the examples as shown.

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

Compose sets the in-container listen address, port and data path in `compose.yml`, and publishes port 3000 on the host’s loopback address. Change the port mapping there if needed.

## Network access

For a phone on the same trusted network, build the app, run `npm run start:lan`, and open the computer’s LAN URL printed in the terminal. A phone’s `127.0.0.1` refers to the phone itself, not the computer. Check your firewall if the LAN address does not open.

The app has no built-in accounts and is intended for a private, single-owner instance. Internet access requires HTTPS and authentication in front of both the page and its API. If the proxy rewrites the Host header, configure PUBLIC_ORIGIN; with Compose, add it to the app service's environment in compose.yml too. There is currently no public hosted demo.

## Save, back up and restore

For Node deployments, keep the entire directory selected by `DATA_DIR`. For Compose, keep the `world-data` volume. Stop the service before taking a complete copy, and restore that whole copy to the same data location. Removing the directory or volume removes the saved works.

After an update or restart, reopen the complete world link rather than the home page.

Sample records are kept until you remove the instance’s data.

The owner can open `/inspect/<worldId>` to view saved inputs, generated content and versions. This is an owner’s view, separate from the creation screen.

## Common questions

**Why did my world disappear?** Reopen its full `/w/<worldId>` address and check that the service is using the original data directory or volume. The home page always creates a new world.

**Why doesn’t my sentence work?** This version uses a built-in sample. Send the exact phrase **有一个球**.

**Why can’t the phone connect?** Use the computer’s LAN address, make sure both devices can reach that network, and allow the app’s port through the computer’s firewall.
