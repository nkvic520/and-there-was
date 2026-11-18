# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Aus einem Gedanken wird eine kleine Welt. Eine Leinwand für Kinder und die Erwachsenen, die mit ihnen gestalten.

## Was du machen kannst

- Beginne mit einer leeren Leinwand und lass mit einem Satz einen Ball erscheinen.
- Beschreibe und verändere mit DeepSeek eine Welt und füge Interaktionen per Klick oder Berührung hinzu.
- Wähle eine animierte Welt oder eine unbewegte Comic- oder Bilderbuchseite.
- Erzeuge Bilder mit Seedream, wähle kostenlose Vorlagen oder lade eine eigene Kinderzeichnung hoch.
- Gestalte auf derselben Leinwand weiter und kehre über den gespeicherten Link zu deinem Werk zurück.

Die Benutzeroberfläche ist derzeit auf vereinfachtem Chinesisch verfügbar.

## Demo ausprobieren

Es gibt noch keine öffentlich gehostete Demo. Starte die Anwendung lokal und sende **「有一个球」** („Da ist ein Ball“). Das integrierte Beispiel benötigt keine Modell-Zugangsdaten und erkennt genau diesen chinesischen Satz.

Um Bilder ohne Modellschlüssel auszuprobieren, wähle unter **素材／我的作品** Bilder aus und sende **「使用选中的素材」** („Ausgewählte Vorlagen verwenden“).

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
| `GENERATOR_MODE` | `fixture` für das integrierte Beispiel, `deepseek` für freies Gestalten. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | API-Schlüssel, Modell und Endpunkt von DeepSeek. |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | API-Schlüssel, Modell, Endpunkt und Bildgröße von Seedream. |

### KI-Dienste

Aktiviere DeepSeek mit `GENERATOR_MODE=deepseek` und `DEEPSEEK_API_KEY`. Weitere Verbindungseinstellungen stehen in `.env.example`.

DeepSeek gestaltet die Szene und ihre Interaktionen. Seedream zeichnet die KI-Bilder. Kostenlose Vorlagen und Uploads rufen das Bildmodell nicht auf; das Erstellen einer Szene im DeepSeek-Modus verwendet weiterhin das Textmodell.

Echte Modellanfragen können Kosten beim Anbieter verursachen. Gespeicherte Werke lassen sich ohne erneute Generierung öffnen.

## Hilfe

- [Benutzerhandbuch (Englisch)](../../docs/help/README.md)
- [Benutzerhandbuch (vereinfachtes Chinesisch)](../../docs/help/README.zh-CN.md)

Die Anwendung ist privat und für einen einzelnen Betreiber gedacht; eine Kontoverwaltung ist nicht integriert. Für den Zugriff über das Internet sind vorgeschaltetes HTTPS und eine Authentifizierung erforderlich. Speichere den vollständigen Link `/w/<worldId>`, um dieselbe Welt wieder zu öffnen.

## Lizenz

Code: [MIT](../../LICENSE). Enthaltene Bilder: [CC0-Vorlagen von Kenney](../../fixtures/library/README.md). Hochgeladene und generierte Werke sind nicht Teil der Code-Lizenz.
