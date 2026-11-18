# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Una idea se convierte en un pequeño mundo. Un lienzo para niños y para los adultos que crean a su lado.

## Qué puedes hacer

- Empieza con un lienzo vacío y haz aparecer una pelota con una frase.
- Sigue creando en el mismo lienzo y vuelve a tu obra mediante su enlace guardado.

La interfaz de la aplicación está actualmente en chino simplificado.

## Probar la demo

Todavía no hay una demo pública alojada. Ejecuta la aplicación localmente y envía **「有一个球」** (“Hay una pelota”). El ejemplo integrado no necesita credenciales de modelos y reconoce esta frase exacta en chino.

![Ejemplo integrado: una pelota en el lienzo](../../docs/media/ball.png)

## Alojamiento propio

Clona o descarga este repositorio. En su carpeta raíz, copia [`.env.example`](../../.env.example) como `.env`. La configuración predeterminada ejecuta el ejemplo sin claves de API.

### Con Docker Compose

```sh
docker compose up --build -d
```

Abre [http://127.0.0.1:3000](http://127.0.0.1:3000). Compose guarda las obras en el volumen `world-data`; consérvalo al reiniciar o actualizar.

### Con Node.js

Necesitas **Node.js 24.11.1 o una versión posterior de Node 24**, junto con npm. Ejecuta desde la raíz del repositorio:

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Para acceder desde un teléfono en la misma red de confianza, ejecuta `npm run start:lan` después de compilar y abre la dirección LAN del ordenador que aparece en la terminal.

## Configuración del entorno

Configura los valores en `.env` y reinicia el servicio tras los cambios. Guarda las claves de API solo en el servidor. Las variables de entorno existentes tienen prioridad sobre `.env`.

| Variable | Uso |
| --- | --- |
| `HOST` | Dirección de escucha; valor predeterminado: `127.0.0.1`. |
| `PORT` | Puerto HTTP; valor predeterminado: `3000`. |
| `DATA_DIR` | Carpeta de obras y registros; valor predeterminado: `./data`. |

## Ayuda

- [Guía de uso (inglés)](../../docs/help/README.md)
- [Guía de uso (chino simplificado)](../../docs/help/README.zh-CN.md)

Es una aplicación privada para un único propietario, sin cuentas integradas. Para acceder desde Internet, colócala detrás de HTTPS y autenticación. Guarda el enlace completo `/w/<worldId>` para volver al mismo mundo.

## Licencia

Código: [MIT](../../LICENSE).
