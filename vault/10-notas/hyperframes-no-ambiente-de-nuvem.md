---
title: HyperFrames no ambiente de nuvem do Claude Code
aliases: [hyperframes, heygen, video pelo claude code, ambiente next-home, cdn.jsdelivr bloqueado]
tags: [infra, midia, armadilha]
type: armadilha
status: seedling
custou: medio
codigo:
  - .claude/skills/hyperframes/scripts/plugin-cli.mjs
  - .claude/settings.local.json
created: 2026-11-16
updated: 2026-11-17
fonte: sessão de 16/11 — doctor e renders de teste no container
summary: Bonecos 3D vêm do Figma (plano Starter tem teto diário de chamadas). Pelo Claude Code o conector HyperFrames só lê; criar vídeo é com as skills locais. Voz grátis é heygen-voice-1-turbo-free com NODE_USE_ENV_PROXY=1. O ambiente Default bloqueava o CDN do GSAP e o render falhava; o ambiente "next-home" libera o CDN e reinstala as skills.
---
# HyperFrames no ambiente de nuvem do Claude Code

**O conector não cria vídeo daqui.** O conector HyperFrames by HeyGen recusa
`compose` e `render_video` quando o pedido vem do Claude Code; só listar,
abrir e consultar status funcionam. Para criar vídeo, use as skills locais
(`npx skills add heygen-com/hyperframes`), que geram HTML/GSAP no disco e
renderizam o MP4 no próprio container. Projeto hospedado na HeyGen (com link
no app) só sai do claude.ai ou do app da HeyGen.

**A rede quebrava o render.** Os modelos da HyperFrames carregam o GSAP de
`cdn.jsdelivr.net`, e as fontes do Google. No ambiente Default esses
endereços eram recusados pela rede, e o render parava com
`SUB_TIMELINE_SCRIPT_FAILURE` / `ERR_TUNNEL_CONNECTION_FAILED`. O `doctor`
passa mesmo assim, porque não testa a rede. Contorno sem liberar a rede:
baixar o GSAP pelo npm (`npm pack gsap@<versão>`), copiar o
`gsap.min.js` para a raiz do projeto e para `compositions/`, e trocar o `src`.

**Ambiente "next-home" (16/11).** Ambiente pessoal criado só para este
repositório. O Default ficou intocado porque vale para todos os
repositórios. O "next-home" libera `cdn.jsdelivr.net`, `fonts.googleapis.com`
e `fonts.gstatic.com`. O script de inicialização reinstala as skills e grava
em `.claude/settings.local.json` a regra que libera
`node .claude/skills/hyperframes/scripts/plugin-cli.mjs` e
`npx hyperframes`. Isso é necessário porque `.claude/` está no `.gitignore`
e o container é apagado ao fim da sessão. Medido: modelo `warm-grain`, 10 s
em 1920x1080, renderizado em cerca de 15 s (qualidade `draft`, 4 núcleos,
GPU por software).

Faltam só itens opcionais, sem efeito no render: whisper (transcrição),
Kokoro (narração), MusicGen (música) e Docker.

**Voz e música pela HeyGen (17/11).** Quatro travas, nesta ordem:
1. A rede bloqueava a HeyGen: o ambiente "next-home" libera `api.heygen.com`,
   `api2.heygen.com`, `app.heygen.com`, `hyperframes.heygen.com`,
   `static.heygen.ai` e `resource2.heygen.ai` (onde ficam os áudios gerados).
2. O Node não usa o proxy sozinho (`fetch` dá `ENOTFOUND`): rodar a CLI com
   `NODE_USE_ENV_PROXY=1`. O login é `auth login --device` (o código é aprovado
   em app.heygen.com/oauth/device); o login comum abre navegador no servidor.
3. As vozes de catálogo (`/v3/voices/speech`) recusam o plano Free com
   `hf_subscription_required`. A voz grátis é o modelo
   `heygen-voice-1-turbo-free` em `POST /v3/models/audio/tts`, chamado com o
   próprio login da HyperFrames (a CLI `heygen` pede login próprio e só por TTY).
   Voz usada: Thaís (`a8c7b58e38c44719b3ab36342f080e95`), português.
4. O token OAuth expira: `auth refresh` antes de gerar de novo.
A música vem do catálogo (`audio.mjs`, `bgm.mode: retrieve`); para alongar uma
trilha, `acrossfade` com a MESMA música aberta duas vezes (`-i` duplo), não
`asplit` (saiu com 24 s). Música e vozes ficam fora do git: o repositório é
público e o áudio é licenciado para os vídeos.

**Bonecos 3D pelo Figma (17/11).** As cenas 3D vêm do `generate_image` do
conector Figma; para ter a imagem em 864x1536, `get_screenshot` com
`maxDimension 1536` e `enableBase64Response` (www.figma.com não é liberado na
rede). O plano Starter do Figma corta as chamadas do MCP no dia (parou em ~25
imagens): gerar e baixar cada uma logo em seguida. Um gerador só faz o mesmo
roteiro em 3D e no estilo clássico (`docs/videos/astro-dores/gerar.py`).

## Relacionadas
- [[MOC — Infraestrutura]]
- [[arte-e-video-pelo-numero-central]]
