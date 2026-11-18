# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Aus einem Gedanken wird eine kleine Welt. Eine Leinwand für Kinder und die Erwachsenen, die mit ihnen gestalten.

## Was du machen kannst

- Beginne mit einer leeren Leinwand und lass mit einem Satz einen Ball erscheinen.
- Beschreibe und verändere mit OpenAI oder DeepSeek eine Welt und füge Interaktionen per Klick oder Berührung hinzu.
- Wähle eine animierte Welt oder eine unbewegte Comic- oder Bilderbuchseite.
- Erzeuge Bilder mit OpenAI oder Seedream, wähle kostenlose Vorlagen oder lade eine eigene Kinderzeichnung hoch.
- Gestalte auf derselben Leinwand weiter und kehre über den gespeicherten Link zu deinem Werk zurück.

Die Oberfläche unterstützt zehn Sprachen. Beim ersten Besuch gelten die Spracheinstellungen des Browsers, ersatzweise Englisch. Das Gerät merkt sich deine Wahl im Sprachmenü. Jede Welt speichert ihre eigene Erzählsprache.

## Demo ausprobieren

Starte die App lokal und sende **Da ist ein Ball**, um sie ohne Modellschlüssel auszuprobieren. Ein öffentlicher Demo-Link folgt, sobald er verfügbar ist.

Wähle Bilder unter **Vorlagen / meine Bilder** und sende **Verwende die ausgewählten Bilder**.

![Integriertes Beispiel: ein Ball auf der Leinwand](../../docs/media/ball.png)

## Selbst hosten

Klone dieses Repository oder lade es herunter. Kopiere im Hauptverzeichnis [`.env.example`](../../.env.example) nach `.env`. Mit der Standardeinstellung läuft das Beispiel ohne API-Schlüssel.

### Mit Docker Compose

```sh
docker compose up --build -d
```

Öffne [http://127.0.0.1:3000](http://127.0.0.1:3000). Compose speichert die Werke im Volume `world-data`; behalte es bei Neustarts und Aktualisierungen bei.

### Mit Node.js

Du benötigst **Node.js 24.11.1 oder eine neuere Version von Node 24** sowie npm. Führe im Hauptverzeichnis des Repositorys Folgendes aus:

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Für ein Smartphone im selben vertrauenswürdigen Netzwerk starte nach dem Build `npm run start:lan` und öffne die im Terminal angezeigte LAN-Adresse des Computers.

## Umgebung konfigurieren

Trage die Werte in `.env` ein und starte den Dienst nach Änderungen neu. API-Schlüssel gehören nur auf den Server. Bereits gesetzte Umgebungsvariablen haben Vorrang vor `.env`.

| Einstellung | Zweck |
| --- | --- |
| `HOST` | Adresse zum Lauschen; Standard: `127.0.0.1`. |
| `PORT` | HTTP-Port; Standard: `3000`. |
| `DATA_DIR` | Ordner für Werke und Aufzeichnungen; Standard: `./data`. |
| `GENERATOR_MODE` | Automatische Auswahl als Standard. `fixture` aktiviert die lokalen Beispiele. |
| `OPENAI_API_KEY / OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL` | Projektschlüssel und Modelle für Szenen und Bilder. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | API-Schlüssel, Modell und Endpunkt von DeepSeek. |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | API-Schlüssel, Modell, Endpunkt und Bildgröße von Seedream. |

### KI-Dienste

Trage den `OPENAI_API_KEY` deiner API-Organisation ein und starte die Anwendung neu. OpenAI erstellt dann Szenen und Bilder, auch wenn die Schlüssel für DeepSeek und Seedream vorhanden sind.

Entfernst du den OpenAI-Schlüssel und startest die Anwendung neu, dient `DEEPSEEK_API_KEY` der Szenenerstellung und `SEEDREAM_API_KEY` den optionalen KI-Bildern. Kostenlose Vorlagen und hochgeladene Zeichnungen lassen sich direkt platzieren.

Echte Modellanfragen können Kosten beim Anbieter verursachen. Gespeicherte Werke lassen sich ohne erneute Generierung öffnen.

## Hilfe

- [Benutzerhandbuch (Englisch)](../../docs/help/README.md)
- [Benutzerhandbuch (vereinfachtes Chinesisch)](../../docs/help/README.zh-CN.md)

Die Anwendung ist privat und für einen einzelnen Betreiber gedacht; eine Kontoverwaltung ist nicht integriert. Für den Zugriff über das Internet sind vorgeschaltetes HTTPS und eine Authentifizierung erforderlich. Speichere den vollständigen Link `/w/<worldId>`, um dieselbe Welt wieder zu öffnen.

## Lizenz

Code: [MIT](../../LICENSE). Enthaltene Bilder: [CC0-Vorlagen von Kenney](../../fixtures/library/README.md). Hochgeladene und generierte Werke sind nicht Teil der Code-Lizenz.
