# 就有了 · And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

一個念頭，一個小世界。讓孩子和陪伴他們的大人一起用文字創作。

## 可以做什麼

- 從空白畫布開始，用一句話讓球出現。
- 透過 OpenAI 或 DeepSeek 描述和修改世界，加入滑鼠點擊或觸控互動。
- 選擇持續活動的動態世界，或靜態漫畫／繪本頁面。
- 使用 OpenAI 或 Seedream 產生圖片，選擇免費素材，或上傳小朋友自己的畫作。
- 在同一張畫布上繼續創作，透過儲存的連結回到作品。

介面支援十種語言。首次使用時會參考瀏覽器偏好，無法配對時使用英文。這台裝置會記住你在語言選單中的選擇。每個世界各自儲存故事語言。

## 體驗範例

在本機啟動應用程式，傳送 **有一個球** 即可體驗免金鑰範例。公開展示網址將於可用時補上。

若要體驗圖片，請在 **素材／我的作品** 選圖，再傳送 **使用選取的素材**。

![內建範例：畫布上出現一個球](../../docs/media/ball.png)

## 自行部署

複製或下載本儲存庫，在根目錄將 [`.env.example`](../../.env.example) 複製為 `.env`。預設設定可直接執行不需要金鑰的範例。

### 使用 Docker Compose

```sh
docker compose up --build -d
```

開啟 [http://127.0.0.1:3000](http://127.0.0.1:3000)。Compose 將作品儲存在 `world-data` 磁碟區中；重新啟動和升級時請保留此磁碟區。

### 使用 Node.js

需要 **Node.js 24.11.1 或更新的 Node 24 版本**及 npm。在儲存庫根目錄執行：

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

同一可信任網路上的手機可在建置後執行 `npm run start:lan`，再開啟終端機列出的電腦區域網路位址。

## 環境設定

在 `.env` 設定參數，變更後重新啟動服務。金鑰僅放在伺服器端；既有環境變數優先於 `.env`。

| 設定項目 | 用途 |
| --- | --- |
| `HOST` | 監聽位址，預設為 `127.0.0.1`。 |
| `PORT` | HTTP 連接埠，預設為 `3000`。 |
| `DATA_DIR` | 作品與記錄的儲存目錄，預設為 `./data`。 |
| `GENERATOR_MODE` | 預設自動選擇。設為 `fixture` 可固定使用本機範例。 |
| `OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL` | 專案金鑰、場景模型和繪圖模型。 |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | DeepSeek 金鑰、模型與 API 位址。 |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Seedream 金鑰、模型、API 位址與圖片尺寸。 |

### AI 服務

在伺服器填入所屬 API 組織的 `OPENAI_API_KEY` 並重新啟動，即可使用 OpenAI 創作場景及繪圖。原有的 DeepSeek 和 Seedream 金鑰可以同時保留。

移除 OpenAI 金鑰並重新啟動後，`DEEPSEEK_API_KEY` 用於產生場景，`SEEDREAM_API_KEY` 用於選用的 AI 繪圖。免費素材和上傳的作品可直接放入畫布。

實際模型請求可能產生供應商費用。重新開啟既有作品不需要再次產生內容。

## 說明

- [使用說明（英文）](../../docs/help/README.md)
- [使用說明（簡體中文）](../../docs/help/README.zh-CN.md)

目前為單一擁有者的私人應用程式，沒有內建帳號系統。對外提供服務時需在前方設定 HTTPS 和身分驗證。請儲存完整的 `/w/<worldId>` 連結，以回到同一個世界。

## 授權

程式碼採用 [MIT](../../LICENSE) 授權。 內建圖片採用 [Kenney CC0 素材](../../fixtures/library/README.md)。上傳和產生的作品不包含在程式碼授權內。
