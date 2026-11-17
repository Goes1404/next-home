#!/usr/bin/env bash
# Renderiza o vídeo e acelera tudo (imagem, voz, música e efeitos) em 1,18x,
# preservando a altura da voz. Uso: bash acelerar.sh
set -euo pipefail
cd "$(dirname "$0")"
node ../../../.claude/skills/hyperframes/scripts/plugin-cli.mjs render --quality delivery -o astro-bonecos-1x.mp4
ffmpeg -v error -y -i astro-bonecos-1x.mp4 \
  -filter_complex "[0:v]setpts=PTS/1.18,fps=30[v];[0:a]atempo=1.18[a]" -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart astro-bonecos.mp4
