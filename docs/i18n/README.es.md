# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

Una idea se convierte en un pequeño mundo. Un lienzo para niños y para los adultos que crean a su lado.

## Qué puedes hacer

- Empieza con un lienzo vacío y haz aparecer una pelota con una frase.
- Describe y modifica un mundo con DeepSeek, y añade interacciones con clics o toques.
- Elige un mundo animado o una página estática de cómic o cuento ilustrado.
- Crea imágenes con Seedream, elige recursos gratuitos o sube un dibujo del niño.
- Sigue creando en el mismo lienzo y vuelve a tu obra mediante su enlace guardado.

La interfaz ofrece diez idiomas. Sigue las preferencias del navegador y usa el inglés si no hay coincidencia. El dispositivo recuerda el idioma que elijas en el menú. Cada mundo guarda el idioma de su historia.

## Probar la demo

Ejecuta la aplicación localmente y envía **Hay una pelota** para probarla sin clave. El enlace a la demo pública se añadirá cuando esté disponible.

Para probar imágenes, elígelas en **Imágenes / mis dibujos** y envía **Usa las imágenes seleccionadas**.

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
| `GENERATOR_MODE` | `fixture` para el ejemplo integrado; `deepseek` para la creación libre. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | Clave de API, modelo y dirección de DeepSeek. |
| `SEEDREAM_API_KEY / SEEDREAM_MODEL / SEEDREAM_BASE_URL / SEEDREAM_SIZE` | Clave de API, modelo, dirección y tamaño de imagen de Seedream. |

### Servicios de IA

Activa DeepSeek con `GENERATOR_MODE=deepseek` y `DEEPSEEK_API_KEY`. El resto de opciones de conexión está en `.env.example`.

DeepSeek organiza la escena y las interacciones. Seedream dibuja las imágenes generadas por IA. Los recursos gratuitos y las subidas no llaman al modelo de imágenes; crear escenas en modo DeepSeek sigue utilizando el modelo de texto.

Las peticiones reales a los modelos pueden generar cargos del proveedor. Las obras guardadas se pueden volver a abrir sin regenerarlas.

## Ayuda

- [Guía de uso (inglés)](../../docs/help/README.md)
- [Guía de uso (chino simplificado)](../../docs/help/README.zh-CN.md)

Es una aplicación privada para un único propietario, sin cuentas integradas. Para acceder desde Internet, colócala detrás de HTTPS y autenticación. Guarda el enlace completo `/w/<worldId>` para volver al mismo mundo.

## Licencia

Código: [MIT](../../LICENSE). Imágenes incluidas: [recursos CC0 de Kenney](../../fixtures/library/README.md). Las obras subidas o generadas no están incluidas en la licencia del código.
