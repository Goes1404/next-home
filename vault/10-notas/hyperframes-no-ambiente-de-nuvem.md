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
updated: 2026-11-16
fonte: sessão de 16/11 — doctor e renders de teste no container
summary: Pelo Claude Code o conector HyperFrames só lê; criar vídeo é com as skills locais. O ambiente Default bloqueava o CDN do GSAP e o render falhava; o ambiente "next-home" libera o CDN e reinstala as skills.
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

## Relacionadas
- [[MOC — Infraestrutura]]
- [[arte-e-video-pelo-numero-central]]
