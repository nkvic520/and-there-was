# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Une idée devient un petit monde. Un canevas pour les enfants et les adultes qui créent à leurs côtés.

## Ce que vous pouvez faire

- Partez d’un canevas vide et faites apparaître une balle avec une phrase.
- Décrivez et modifiez un monde avec DeepSeek, puis ajoutez des interactions par clic ou toucher.
- Choisissez un monde animé ou une page fixe de bande dessinée ou de livre illustré.
- Créez des images avec Seedream, choisissez des ressources gratuites ou importez un dessin de votre enfant.
- Continuez sur le même canevas et retrouvez votre création grâce à son lien enregistré.

L’interface de l’application est actuellement en chinois simplifié.

## Essayer la démo

Aucune démo publique hébergée n’est encore disponible. Lancez l’application en local et envoyez **「有一个球」** (« Il y a une balle »). L’exemple intégré ne nécessite aucune clé de modèle et reconnaît cette phrase chinoise exacte.

Pour essayer les images sans clé de modèle, sélectionnez des images dans **素材／我的作品**, puis envoyez **「使用选中的素材」** (« Utiliser les ressources sélectionnées »).

![Exemple intégré : une balle sur le canevas](../../docs/media/ball.png)

## Auto-hébergement

Clonez ou téléchargez ce dépôt. À sa racine, copiez [`.env.example`](../../.env.example) vers `.env`. La configuration par défaut lance l’exemple sans clé d’API.

### Avec Docker Compose

```sh
docker compose up --build -d
```

Ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000). Compose conserve les créations dans le volume `world-data` ; gardez ce volume lors des redémarrages et des mises à jour.

### Avec Node.js

Utilisez **Node.js 24.11.1 ou une version ultérieure de Node 24**, avec npm. Exécutez ces commandes à la racine du dépôt :

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Pour un téléphone sur le même réseau de confiance, lancez `npm run start:lan` après la compilation et ouvrez l’adresse LAN de l’ordinateur affichée dans le terminal.

## Configuration de l’environnement

Définissez les valeurs dans `.env`, puis redémarrez le service après toute modification. Conservez les clés d’API uniquement sur le serveur. Les variables d’environnement existantes ont priorité sur `.env`.

| Paramètre | Rôle |
| --- | --- |
| `HOST` | Adresse d’écoute ; valeur par défaut : `127.0.0.1`. |
| `PORT` | Port HTTP ; valeur par défaut : `3000`. |
| `DATA_DIR` | Dossier des créations et des archives ; valeur par défaut : `./data`. |
| `GENERATOR_MODE` | `fixture` pour l’exemple intégré ; `deepseek` pour la création libre. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | Clé d’API, modèle et adresse de DeepSeek. |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Clé d’API, modèle, adresse et taille d’image de Seedream. |

### Services d’IA

Activez DeepSeek avec `GENERATOR_MODE=deepseek` et `DEEPSEEK_API_KEY`. Les autres paramètres de connexion figurent dans `.env.example`.

DeepSeek organise la scène et les interactions. Seedream dessine les images générées par IA. Les ressources gratuites et les imports ne font pas appel au modèle d’images ; la création de scènes en mode DeepSeek utilise toujours le modèle de texte.

Les requêtes réelles aux modèles peuvent être facturées par leurs fournisseurs. Une création enregistrée peut être rouverte sans être générée à nouveau.

## Aide

- [Guide d’utilisation (anglais)](../../docs/help/README.md)
- [Guide d’utilisation (chinois simplifié)](../../docs/help/README.zh-CN.md)

L’application est privée, destinée à un seul propriétaire et sans gestion de comptes intégrée. Pour un accès par Internet, placez-la derrière HTTPS et une authentification. Enregistrez le lien complet `/w/<worldId>` pour retrouver le même monde.

## Licence

Code : [MIT](../../LICENSE). Images incluses : [ressources CC0 de Kenney](../../fixtures/library/README.md). Les créations importées et générées ne sont pas couvertes par la licence du code.
