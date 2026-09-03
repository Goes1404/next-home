#!/usr/bin/env bash
#
# Protótipo do motor de vídeo — gramática de câmera sobre foto real.
#
# ## Por que este arquivo existe
#
# Nasceu da exploração de 03/09/2026, junto com o roadmap em
# `docs/ROADMAP-VIDEO.md`. É versionado pelo mesmo motivo de
# `scripts/traces/`: exploração que ficou só no scratchpad da sessão
# desaparece, e daqui saíram as duas restrições que só apareceram montando
# um vídeo de verdade (fotos panorâmicas demais para 9:16; título vazando
# pela direita).
#
# NÃO é código de produção. É a prova de que o caminho funciona e a
# referência de como o movimento é calculado. A versão de produto vira
# módulo puro + testes quando a F1 do roadmap for liberada.
#
# ## A gramática
#
# Um movimento por TIPO de plano, derivado do `alt` da foto. É isto que
# impede todos os vídeos de ficarem iguais: a variação sai do DADO (quais
# fotos aquele imóvel tem), não de sorteio — sorteio parece igual depois de
# dez vídeos.
#
#   fachada/exterior ...... TILT: sobe revelando a altura do prédio
#   living/sala/jantar .... PUSH: aproxima devagar, como quem entra
#   lazer/gourmet/piscina . PAN:  percorre lateralmente, mostra a extensão
#   implantação/planta .... PULL: afasta revelando o conjunto inteiro
#
# Toda curva usa aceleração (ease-out, `pow(1-t,3)`). Movimento LINEAR é o
# que denuncia slideshow; movimento que desacelera no fim parece operador
# de câmera. Foi a diferença mais visível de toda a exploração.
#
# ## Duas armadilhas medidas
#
# 1. As fotos do catálogo são ~1000x512 — panorâmicas demais para 9:16. A
#    foto nítida ocupa uma FAIXA e o resto do quadro leva uma cópia borrada
#    e escurecida dela mesma. Escalar pela largura estoura o crop: o idioma
#    certo é `force_original_aspect_ratio=increase`.
# 2. `zoompan` trabalha em pixel inteiro e treme. O upscale grande ANTES do
#    zoompan (`scale=-1:3200`) é o que tira o tremor.
#
# ## Uso
#
#   apt-get update && apt-get install -y --no-install-recommends ffmpeg
#   . scripts/video/gramatica.sh
#   plano foto.jpg saida.mp4 tilt
#
# Medido em 4 CPUs: ~15 s por plano de 4 s, ~12 s para a montagem final.

FPS=${FPS:-30}
DUR=${DUR:-4}
FAIXA=${FAIXA:-760}      # altura da faixa de foto nítida no quadro 1080x1920
TOPO=${TOPO:-420}        # onde a faixa começa

# Grade de cor: contraste, leve dessaturação de azul e nitidez. Sem isto a
# foto parece foto; com isto parece material tratado.
GRADE="eq=contrast=1.10:saturation=1.06:gamma=0.98,\
curves=r='0/0.02 0.5/0.5 1/0.98':b='0/0.04 0.5/0.5 1/0.96',\
unsharp=5:5:0.40"

movimento() {
  local N=$((DUR*FPS))
  case "$1" in
    tilt) echo "z='1.34-0.06*pow(1-on/$N,3)':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-pow(1-on/$N,3))'";;
    push) echo "z='1.18-0.18*pow(1-on/$N,3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";;
    pan)  echo "z='1.22':x='(iw-iw/zoom)*(0.12+0.76*(1-pow(1-on/$N,3)))':y='ih/2-(ih/zoom/2)'";;
    pull) echo "z='1.02+0.24*pow(1-on/$N,3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";;
    *)    echo "ERRO: movimento desconhecido '$1'" >&2; return 1;;
  esac
}

# plano <foto> <saida.mp4> <tilt|push|pan|pull>
plano() {
  local N=$((DUR*FPS))
  ffmpeg -y -loglevel error -loop 1 -i "$1" -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         gblur=sigma=38,eq=brightness=-0.26:saturation=0.78,setsar=1[bg];
    [0:v]scale=-1:3200:flags=lanczos,crop='min(iw,3200*1080/$FAIXA)':3200,
         zoompan=$(movimento "$3"):d=$N:s=1080x$FAIXA:fps=$FPS,
         $GRADE,setsar=1[fg];
    [bg][fg]overlay=(W-w)/2:$TOPO:shortest=1,format=yuv420p[v]
  " -map "[v]" -t "$DUR" -r "$FPS" -c:v libx264 -preset medium -crf 20 "$2"
}

# Véu em degradê para a legenda ficar legível sobre qualquer foto.
veu() { # <saida.png> [altura]
  ffmpeg -y -loglevel error -f lavfi -i "color=c=black:s=1080x${2:-740},format=rgba" \
    -vf "geq=r=0:g=0:b=0:a='255*pow(Y/H,1.5)'" -frames:v 1 "$1"
}
