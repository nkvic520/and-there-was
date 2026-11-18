# And There Was…

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Português (Brasil)** · [Русский](README.ru.md)

Uma ideia vira um pequeno mundo. Uma tela para crianças e para os adultos que criam ao lado delas.

## O que você pode fazer

- Comece com uma tela vazia e faça uma bola aparecer com uma frase.
- Descreva e modifique um mundo com o DeepSeek e adicione interações por clique ou toque.
- Continue criando na mesma tela e volte à sua obra pelo link salvo.

A interface do aplicativo está atualmente em chinês simplificado.

## Experimente a demonstração

Ainda não há uma demonstração pública hospedada. Execute o aplicativo localmente e envie **「有一个球」** (“Há uma bola”). O exemplo incluído não precisa de credenciais de modelos e reconhece exatamente essa frase em chinês.

![Exemplo incluído: uma bola na tela](../../docs/media/ball.png)

## Hospedagem própria

Clone ou baixe este repositório. Na pasta raiz, copie [`.env.example`](../../.env.example) para `.env`. A configuração padrão executa o exemplo sem chaves de API.

### Com Docker Compose

```sh
docker compose up --build -d
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000). O Compose salva as obras no volume `world-data`; mantenha esse volume ao reiniciar ou atualizar.

### Com Node.js

Use **Node.js 24.11.1 ou uma versão mais recente do Node 24**, com npm. Execute na raiz do repositório:

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Para acessar pelo celular na mesma rede confiável, execute `npm run start:lan` após a compilação e abra o endereço LAN do computador exibido no terminal.

## Configuração do ambiente

Defina os valores em `.env` e reinicie o serviço após alterações. Mantenha as chaves de API somente no servidor. Variáveis de ambiente já definidas têm prioridade sobre `.env`.

| Configuração | Finalidade |
| --- | --- |
| `HOST` | Endereço de escuta; padrão: `127.0.0.1`. |
| `PORT` | Porta HTTP; padrão: `3000`. |
| `DATA_DIR` | Pasta das obras e dos registros; padrão: `./data`. |
| `GENERATOR_MODE` | `fixture` para o exemplo incluído; `deepseek` para criação livre. |
| `DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL` | Chave de API, modelo e endereço do DeepSeek. |

### Serviços de IA

Ative o DeepSeek com `GENERATOR_MODE=deepseek` e `DEEPSEEK_API_KEY`. As demais configurações de conexão estão em `.env.example`.

Requisições reais aos modelos podem gerar cobranças dos fornecedores. Obras salvas podem ser reabertas sem uma nova geração.

## Ajuda

- [Guia de uso (inglês)](../../docs/help/README.md)
- [Guia de uso (chinês simplificado)](../../docs/help/README.zh-CN.md)

Este é um aplicativo privado para um único proprietário, sem contas integradas. Para acesso pela internet, coloque-o atrás de HTTPS e autenticação. Salve o link completo `/w/<worldId>` para reabrir o mesmo mundo.

## Licença

Código: [MIT](../../LICENSE).
