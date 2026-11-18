# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

하나의 생각이 작은 세상이 됩니다. 아이와 곁에서 함께 만드는 어른을 위한 캔버스입니다.

## 할 수 있는 일

- 빈 캔버스에서 시작해 한 문장으로 공을 나타나게 합니다.
- OpenAI 또는 DeepSeek로 세상을 설명하고 바꾸며, 클릭이나 터치로 상호작용을 더합니다.
- 계속 움직이는 세계 또는 정지된 만화·그림책 페이지를 선택합니다.
- OpenAI 또는 Seedream으로 그림을 생성하거나 무료 소재, 아이가 직접 그려 업로드한 그림을 사용합니다.
- 같은 캔버스에서 계속 만들고, 저장한 링크로 작품에 돌아올 수 있습니다.

화면은 10개 언어를 지원합니다. 처음에는 브라우저의 언어 설정을 따르며 지원하지 않는 경우 영어로 표시됩니다. 언어 메뉴에서 선택하면 이 기기에 저장됩니다. 각 세계에는 이야기 언어가 따로 저장됩니다.

## 데모 체험

앱을 내 기기에서 실행한 후 **공이 하나 있어** 라고 보내면 API 키 없이 체험할 수 있습니다. 공개 데모 주소는 준비되면 추가됩니다.

그림을 사용하려면 **소재 / 내 그림** 에서 그림을 고르고 **선택한 그림을 사용해 줘** 라고 보내세요.

![기본 예제: 캔버스에 나타난 공](../../docs/media/ball.png)

## 직접 호스팅

이 저장소를 복제하거나 내려받고, 루트 폴더의 [`.env.example`](../../.env.example)을 `.env`로 복사하세요. 기본 설정에서는 API 키 없이 예제를 실행할 수 있습니다.

### Docker Compose 사용

```sh
docker compose up --build -d
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)을 여세요. Compose는 작품을 `world-data` 볼륨에 저장합니다. 재시작하거나 업그레이드할 때 이 볼륨을 유지하세요.

### Node.js 사용

**Node.js 24.11.1 이상의 Node 24 버전**과 npm이 필요합니다. 저장소 루트에서 실행하세요.

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

같은 신뢰할 수 있는 네트워크의 휴대폰에서 사용하려면 빌드 후 `npm run start:lan`을 실행하고, 터미널에 표시된 컴퓨터의 LAN 주소를 여세요.

## 환경 설정

`.env`에서 값을 설정하고 변경 후 서비스를 재시작하세요. API 키는 서버에만 보관하세요. 기존 환경 변수는 `.env`보다 우선합니다.

| 설정 | 용도 |
| --- | --- |
| `HOST` | 수신 주소. 기본값은 `127.0.0.1`입니다. |
| `PORT` | HTTP 포트. 기본값은 `3000`입니다. |
| `DATA_DIR` | 작품 및 기록 저장 경로. 기본값은 `./data`입니다. |
| `GENERATOR_MODE` | 기본값은 자동 선택입니다. 로컬 예제는 `fixture`로 설정하세요. |
| `OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL` | 프로젝트 키, 장면 모델, 이미지 모델. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | DeepSeek API 키, 모델 및 엔드포인트. |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Seedream API 키, 모델, 엔드포인트 및 이미지 크기. |

### AI 서비스

API 조직의 `OPENAI_API_KEY`를 설정하고 다시 시작하면 OpenAI로 장면과 AI 그림을 만듭니다. DeepSeek와 Seedream 키도 그대로 보관할 수 있습니다.

OpenAI 키를 지우고 다시 시작하면 `DEEPSEEK_API_KEY`로 장면을 만들고 `SEEDREAM_API_KEY`로 AI 그림을 그릴 수 있습니다. 무료 소재와 업로드한 그림은 캔버스에 바로 놓을 수 있습니다.

실제 모델 요청에는 공급업체 요금이 발생할 수 있습니다. 저장한 작품을 다시 여는 데는 재생성이 필요하지 않습니다.

## 도움말

- [사용자 안내서(영어)](../../docs/help/README.md)
- [사용자 안내서(중국어 간체)](../../docs/help/README.zh-CN.md)

내장 계정 기능이 없는 단일 소유자용 비공개 앱입니다. 인터넷에 연결할 때는 앞단에 HTTPS와 인증을 설정하세요. 같은 세계를 다시 열려면 전체 `/w/<worldId>` 링크를 저장하세요.

## 라이선스

코드: [MIT](../../LICENSE). 기본 그림: [Kenney CC0 소재](../../fixtures/library/README.md). 업로드하거나 생성한 작품에는 코드 라이선스가 적용되지 않습니다.
