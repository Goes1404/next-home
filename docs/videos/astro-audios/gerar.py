"""Gera "um dia em 3 áudios" (corretor autônomo, ~70 s) nos três estilos.

    python3 gerar.py  ->  astro-audios/          (animação de cinema, imagens do Figma)
                          ../astro-audios-3d/       (bonecos 3D em código, Three.js)
                          ../astro-audios-classico/ (céu da Astro e celular)

As conversas com o número central usam os textos reais do código
(src/lib/central/proposta.ts, tratadores/*, src/lib/crm/resumoDoDia.ts,
lembretes.ts, notificacoes/lembreteDeVisita.ts). Só o fundo muda.
"""
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "../astro-dores"))
from gerar import FACE, CSS, CSS_CLASSICO, W, H, SIM, titulo, bolha, central, selo, sep, dur  # noqa: E402

CSS_AUDIOS = '''    .hora { position: absolute; left: 90px; top: 150px; padding: 10px 26px 12px; border-radius: 999px; background: #4d84e0; color: #fff;
      font: 700 32px "Figtree", sans-serif; letter-spacing: 0.04em; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35); }
    .onda { display: inline-flex; align-items: center; gap: 6px; margin-right: 14px; vertical-align: middle; }
    .onda i { display: block; width: 7px; border-radius: 4px; background: #1f8a5b; }
    .slam { position: absolute; left: 50px; right: 50px; top: 230px; text-align: center; font-family: "Anton", sans-serif; font-size: 156px;
      line-height: 1.04; color: #f5f7fb; text-transform: uppercase; text-shadow: 0 8px 28px rgba(0, 0, 0, 0.5); }
    .slam .p { display: inline-block; margin: 0 0.1em; }
    .slam .d { background: #4d84e0; padding: 0 0.12em; text-shadow: none; }
    .risco { position: absolute; left: 50%; padding: 14px 34px; border-radius: 26px; background: rgba(15, 37, 71, 0.92); white-space: nowrap;
      font: 700 46px "Figtree", sans-serif; color: #f5f7fb; transform: translateX(-50%); box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4); }
    .risco s { text-decoration-color: #e0484d; text-decoration-thickness: 6px; }
    .feito { position: absolute; left: 90px; right: 90px; padding: 22px 30px; border-radius: 30px; background: rgba(245, 247, 251, 0.97);
      font: 700 34px "Figtree", sans-serif; color: #0d1b33; box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35); }
    .feito small { display: block; margin-top: 4px; font: 400 27px "Figtree", sans-serif; color: #3b4a63; }
    .feito b { color: #1f9d6b; }
'''


def onda(n=14):
    alt = [18, 30, 44, 26, 38, 50, 22, 34, 46, 28, 40, 20, 32, 24]
    return '<span class="onda">' + "".join(f'<i style="height: {alt[k % len(alt)]}px"></i>' for k in range(n)) + "</span>"


def audio(i, transcricao, top, seg="0:07"):
    return bolha(i, "eu", f'<span class="rotulo">🎙 Áudio · {seg}</span>{onda()}<br><span style="color: #3b4a63; font-size: 29px">“{transcricao}”</span>', top)


def hora(i, txt):
    return f'<div id="{i}" class="hora">🕗 {txt}</div>'


# cada cena: id, início, duração, imagem (cinema), cabeçalho do celular (clássico), títulos, elementos
CENAS = [
    dict(id="a", ini=0.0, dur=4.8, img="c02-audio.png", pan=(15, -25),
         titulos=[], slam=[("O", 0.55), ("seu", 0.75), ("CRM", 0.95), ("em", 2.0), ("3", 2.35), ("áudios?", 2.7)],
         el=[(bolha("a-o1", "eu", f'<span class="rotulo">🎙 09:00</span>{onda()}', 1060), 2.4, "pop", None),
             (bolha("a-o2", "eu", f'<span class="rotulo">🎙 14:00</span>{onda()}', 1220), 2.65, "pop", None),
             (bolha("a-o3", "eu", f'<span class="rotulo">🎙 20:00</span>{onda()}', 1380), 2.9, "pop", None)]),
    dict(id="b", ini=4.8, dur=10.0, img="c01-cozinha.png", pan=(0, -30),
         titulos=[("b-t", "08h. O seu dia", "já chegou.", 0.3, None, "d")],
         el=[(hora("b-h", "08:00"), 0.2, "pop", None),
             (bolha("b-b1", "ele", central("Bom dia, Ana! Seu dia:<br><br><b>Visitas de hoje (1)</b><br>• Paula Reis — 16h, Vitra<br><br>"
                                            "<b>Esperando sua resposta (2)</b><br>• Carla Mendes — Vitra<br>• Bruno Alves — Barueri<br><br>"
                                            "<b>Leads novos (24h) (3)</b><br>• Juliana Prado — anúncio Art Design<br>• Rafael Costa — site<br>• Lívia Melo — portfólio"), 960), 1.5, "pop", None)]),
    dict(id="c", ini=14.8, dur=11.0, img="c03-cartao.png", pan=(-15, -25),
         titulos=[("c-t", "1º áudio,", "no plantão.", 0.3, 6.3, "d"), ("c-t2", "Dois pedidos,", "um sim só.", 6.45, None, "d")],
         el=[(hora("c-h", "09:00"), 0.2, "pop", None),
             (audio("c-b1", "cadastra o Marcos Lima, 11 99123-4567, e marca visita com ele sábado às dez", 930), 0.6, "pop", None),
             (bolha("c-b2", "ele", central("Vou fazer isto:<br>1) Cadastrar Marcos Lima, (11) 99123-4567<br>2) Marcar visita com Marcos Lima, sábado 21/11 às 10h<br><br>" + SIM), 1180), 2.7, "pop", None),
             (bolha("c-b3", "eu", "sim", 1560), 7.0, "pop", None),
             (bolha("c-b4", "ele", central("Marcos Lima cadastrado na sua carteira.<br>Visita com Marcos Lima marcada para sábado 21/11 às 10h. Já está na Agenda."), 1660), 7.8, "pop", None)]),
    dict(id="d", ini=25.8, dur=10.5, img="c04-carro.png", pan=(10, -25),
         titulos=[("d-t", "2º áudio,", "no carro.", 0.3, None, "d")],
         el=[(hora("d-h", "14:00"), 0.2, "pop", None),
             (audio("d-b1", "manda as fotos e a planta do Vitra pra Carla e me lembra de ligar pra ela às seis", 930, "0:06"), 0.6, "pop", None),
             (bolha("d-b2", "ele", central("Vou fazer isto:<br>1) Mandar a Carla Mendes, pelo seu WhatsApp, as fotos e a planta do Vitra<br>2) Lembrar você hoje às 18h: ligar para a Carla<br><br>" + SIM), 1180), 2.6, "pop", None),
             (bolha("d-b3", "eu", "sim", 1600), 6.3, "pop", None),
             (bolha("d-b4", "ele", central("Mandei a Carla Mendes, pelo seu WhatsApp, as fotos e a planta do Vitra.<br>Lembrete marcado para hoje às 18h."), 1700), 7.0, "pop", None)]),
    dict(id="e", ini=36.3, dur=7.2, img="c11-lembrete.png", pan=(15, -25),
         titulos=[("e-t", "Os avisos chegam", "sozinhos.", 0.3, None, "d")],
         el=[(hora("e-h", "15:00"), 0.2, "pop", 3.25), (hora("e-h2", "18:00"), 3.35, "pop", None),
             (bolha("e-b1", "ele", central("<b>Visita em 1 hora</b><br>Paula Reis às 16:00."), 1000), 0.9, "pop", None),
             (bolha("e-b2", "ele", central("<b>⏰ Lembrete</b><br><br>Ligar para a Carla.<br><br>👤 Carla Mendes"), 1260), 3.5, "pop", None)]),
    dict(id="f", ini=43.5, dur=8.6, img="c07-noite.png", pan=(0, -30),
         titulos=[("f-t", "3º áudio,", "à noite.", 0.3, None, "d")],
         el=[(hora("f-h", "20:00"), 0.2, "pop", None),
             (audio("f-b1", "quem eu ligo amanhã?", 960, "0:02"), 0.8, "pop", None),
             (bolha("f-b2", "ele", central("Amanhã você tem:<br>📅 Visita às 10h com o Marcos Lima<br>🔥 Mais quentes: Carla Mendes (91) e Paula Reis (86)<br>⏳ Sem resposta há 2 dias: Bruno Alves"), 1200), 2.9, "pop", None)]),
    dict(id="g", ini=52.1, dur=7.8, img="c06-lista.png", pan=(-10, -25),
         titulos=[("g-t", "Três áudios.", "Dia em ordem.", 4.3, None, "d")],
         el=[('<div id="g-r1" class="risco" style="top: 300px"><s>abrir painel</s></div>', 0.4, "pop", 4.1),
             ('<div id="g-r2" class="risco" style="top: 430px"><s>planilha</s></div>', 1.5, "pop", 4.1),
             ('<div id="g-r3" class="risco" style="top: 560px"><s>esquecer alguém</s></div>', 2.6, "pop", 4.1),
             ('<div id="g-f1" class="feito" style="top: 1000px">🎙 09:00 <b>✓</b><small>Marcos cadastrado e visita na Agenda</small></div>', 4.7, "pop", None),
             ('<div id="g-f2" class="feito" style="top: 1170px">🎙 14:00 <b>✓</b><small>Material enviado e lembrete marcado</small></div>', 5.1, "pop", None),
             ('<div id="g-f3" class="feito" style="top: 1340px">🎙 20:00 <b>✓</b><small>Quem ligar amanhã, já na mão</small></div>', 5.5, "pop", None)]),
]
FECHO_INI, FECHO_DUR = 59.9, 9.5
TOTAL = round(FECHO_INI + FECHO_DUR, 2)
FALAS = {"a01": 0.3, "a02": 5.1, "a03": 15.1, "a04": 26.1, "a05": 36.6, "a06": 43.8, "a07": 52.4, "a08": FECHO_INI + 0.3}


def cena(c, modo):
    i = c["id"]
    js, cam = [], []
    if modo == "filme":
        px, py = c["pan"]
        cam += [f'<div id="{i}-f" class="fundo" style="background-image: url(\'assets/cenas/{c["img"]}\')"></div>', '<div class="sombra"></div>', '<div class="sombra-baixo"></div>']
        js.append(f'tl.fromTo("#{i}-f", {{ scale: 1.14, x: 0, y: 0, filter: "blur(10px)" }}, {{ scale: 1.04, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }}, 0);')
        js.append(f'tl.to("#{i}-f", {{ scale: 1.1, x: {px}, y: {py}, duration: {round(c["dur"] - 0.45, 2)}, ease: "none" }}, 0.45);')
    elif modo == "3d":
        cam += ['<div class="sombra"></div>']
    else:
        cab = (f'<div class="fone" id="{i}-fone"><div class="tela"><div class="cab com">{selo(68, 34)}<div>Astro CRM<small>número central</small></div></div></div></div>')
        cam.append(cab)
        js.append(f'tl.fromTo("#{i}-fone", {{ y: 120, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }}, 0);' if i == "a" else
                  f'tl.fromTo("#{i}-fone", {{ scale: 0.97 }}, {{ scale: 1, duration: 0.35, ease: "power2.out" }}, 0);')
    if c.get("slam"):
        cam.append('<div id="a-g" class="slam">' + "".join(f'<span class="p{" d" if w == "3" else ""}" id="a-g{k}">{w}</span>' for k, (w, t) in enumerate(c["slam"])) + "</div>")
        for k, (w, t) in enumerate(c["slam"]):
            js.append(f'tl.fromTo("#a-g{k}", {{ opacity: 0, scale: 1.9 }}, {{ opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.4)" }}, {t});')
    for (tid, a, b, t0, t1, cor) in c["titulos"]:
        cam.append(titulo(tid, a, b, cor))
        js.append(f'tl.fromTo(".{tid}-w", {{ opacity: 0, scale: 1.5, filter: "blur(6px)" }}, {{ opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.3, stagger: 0.07, ease: "back.out(2.2)" }}, {t0});')
        if t1:
            js.append(f'tl.to("#{tid}", {{ opacity: 0, filter: "blur(8px)", duration: 0.14, ease: "power2.in" }}, {t1});')
    for (html, t, tipo, t1) in c["el"]:
        cam.append(html)
        eid = html.split('id="')[1].split('"')[0]
        js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }}, {t});')
        if t1:
            js.append(f'tl.to("#{eid}", {{ opacity: 0, scale: 0.9, duration: 0.15, ease: "power2.in" }}, {t1});')
    # conversas longas: as bolhas antigas sobem para dar lugar às novas
    sobe = {"c": [("c-b1", 7.0, -330), ("c-b2", 7.0, -330), ("c-b3", 7.6, -230)], "d": [("d-b1", 6.3, -330), ("d-b2", 6.3, -330), ("d-b3", 6.9, -230)]}
    for (eid, t, dy) in sobe.get(i, []):
        js.append(f'tl.to("#{eid}", {{ y: {dy}, duration: 0.4, ease: "power2.inOut" }}, {t});')
    js.append(f'tl.to("#{i}-cena", {{ opacity: 0, duration: 0.15, ease: "power2.in" }}, {round(c["dur"] - 0.15, 2)});')
    css = CSS + CSS_AUDIOS + (CSS_CLASSICO + "    .fone { top: 560px; height: 1480px; }\n    .hora { top: 150px; }\n" if modo == "classico" else "")
    miolo = "\n    ".join(cam)
    corpo = "\n    ".join(js)
    return f'''<template>
  <style>
{FACE}{css}  </style>
  <div id="root" data-composition-id="{i}" data-width="{W}" data-height="{H}">
    <div id="{i}-cena" style="position: absolute; inset: 0">
    {miolo}
    </div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {corpo}
    window.__timelines["{i}"] = tl;
  </script>
</template>
'''


def fecho(modo):
    """Só a chamada: logo, TESTE GRÁTIS POR 7 DIAS, Começar agora."""
    fx = open(os.path.join(AQUI, "../astro-completo/compositions/fecho.html")).read()
    a = fx.index('    <div id="e-celular"')
    b = fx.index('    <h1 id="e-frase"')
    fundo = ""
    if modo == "filme":
        fundo = '    <div id="e-foto" style="position: absolute; inset: -40px; background-size: cover; background-position: center; background-image: url(\'assets/cenas/c14-chaves.png\')"></div>\n'
    fundo += '    <div id="e-escuro" style="position: absolute; inset: 0; background: rgba(5, 11, 24, 0.72)"></div>\n'
    fx = fx[:a] + fundo + fx[b:]
    i0 = fx.index('    <h1 id="e-frase"')
    i1 = fx.index("</h1>", i0) + 6
    fx = fx[:i0] + fx[i1:]
    fx = fx.replace('data-start="6.4" data-duration="5.4"', f'data-start="0.2" data-duration="{FECHO_DUR - 0.2}"')
    s0 = fx.index("<script>")
    linhas = []
    for ln in fx[s0:].split("\n"):
        if "#e-celular" in ln or ".e-w" in ln:
            continue
        if ln.strip().startswith("tl.") and ln.rstrip().endswith(");"):
            corpo, t = ln.rstrip()[:-2].rsplit(",", 1)
            t = round(max(0.0, float(t) - 6.0), 2)
            ln = f"{corpo}, {t});"
        linhas.append(ln)
    script = "\n".join(linhas)
    anima = 'tl.fromTo("#e-escuro", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);'
    if modo == "filme":
        anima += '\n    tl.fromTo("#e-foto", { scale: 1.12, filter: "blur(10px)" }, { scale: 1.03, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, 0);\n    tl.to("#e-foto", { scale: 1.1, duration: 9, ease: "none" }, 0.5);'
    script = script.replace("const tl = gsap.timeline({ paused: true });", "const tl = gsap.timeline({ paused: true });\n    " + anima)
    return fx[:s0] + script


def preparar(pasta, modo):
    os.makedirs(os.path.join(pasta, "compositions"), exist_ok=True)
    base = os.path.join(AQUI, "../astro-site/assets")
    for d in ("fonts", "sfx", "bgm"):
        destino = os.path.join(pasta, "assets", d)
        if not os.path.exists(destino):
            shutil.copytree(os.path.join(base, d), destino)
    if pasta != AQUI:
        shutil.copytree(os.path.join(AQUI, "assets/voice"), os.path.join(pasta, "assets/voice"), dirs_exist_ok=True)
    for f in ("hyperframes.json", ".gitignore"):
        shutil.copy(os.path.join(AQUI, "../astro-site", f), os.path.join(pasta, f))
    if modo == "filme":
        os.makedirs(os.path.join(pasta, "assets/cenas"), exist_ok=True)
        for c in [x["img"] for x in CENAS] + ["c14-chaves.png"]:
            shutil.copy(os.path.join(AQUI, "../astro-bonecos/assets/cenas", c), os.path.join(pasta, "assets/cenas", c))
    if modo == "3d":
        shutil.copy(os.path.join(AQUI, "../astro-site/assets/three.min.js"), os.path.join(pasta, "assets/three.min.js"))
        shutil.copy(os.path.join(AQUI, "mundo-audios.js"), os.path.join(pasta, "assets/mundo.js"))
    if modo == "classico":
        shutil.copy(os.path.join(AQUI, "../astro-completo/compositions/cidade.html"), os.path.join(pasta, "compositions/cidade.html"))


def gerar(modo, pasta):
    preparar(pasta, modo)
    for c in CENAS:
        open(os.path.join(pasta, f"compositions/{c['id']}.html"), "w").write(cena(c, modo))
    open(os.path.join(pasta, "compositions/fecho.html"), "w").write(fecho(modo))
    cenas = [(c["id"], c["ini"], c["dur"]) for c in CENAS] + [("fecho", FECHO_INI, FECHO_DUR)]
    hosts = "\n".join(
        f'''      <div id="{n}" data-composition-id="{n}" data-composition-src="compositions/{n}.html"
        data-start="{a}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>'''
        for n, a, d in cenas)
    aud = [f'      <audio id="voz-{k}" src="assets/voice/{k}.wav" data-start="{t}" data-duration="{dur(os.path.join(AQUI, f"assets/voice/{k}.wav")):.2f}" data-volume="1" data-track-index="2"></audio>' for k, t in FALAS.items()]
    trilha = os.path.join(pasta, "assets/bgm/trilha-audios.wav")
    if not os.path.exists(trilha):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(pasta, "assets/bgm/trilha.wav"), "-t", str(TOTAL),
                        "-af", f"afade=t=out:st={TOTAL - 2.5}:d=2.5", trilha], check=True)
    aud.append(f'      <audio id="trilha" src="assets/bgm/trilha-audios.wav" data-start="0" data-duration="{TOTAL}" data-volume="0.2" data-track-index="3"></audio>')
    fx = [("click-soft", t, 0.5) for t in (0.55, 0.75, 0.95, 2.0)] + [("impact-bass-1", 2.35, 0.7)]
    for c in CENAS[1:]:
        fx.append(("whoosh", round(c["ini"] - 0.25, 2), 0.45))
    for c in CENAS:
        for (html, t, tipo, t1) in c["el"]:
            som = "pop"
            if 'class="bolha eu"' in html and "Áudio" in html:
                som = "whoosh-short"
            if "Já está na Agenda" in html or "Lembrete marcado" in html or 'class="feito"' in html:
                som = "chime"
            if "Lembrete</b>" in html or "Visita em 1 hora" in html:
                som = "chime"
            fx.append((som, round(c["ini"] + t, 2), 0.5))
    fx += [("whoosh", FECHO_INI - 0.25, 0.45), ("impact-bass-1", FECHO_INI + 0.45, 0.6), ("click-soft", FECHO_INI + 1.0, 0.6),
           ("click-soft", FECHO_INI + 1.23, 0.6), ("pop", FECHO_INI + 1.46, 0.7), ("whoosh-short", FECHO_INI + 1.85, 0.5)]
    for k, (f, t, v) in enumerate(sorted(fx, key=lambda x: x[1])):
        d = min(dur(os.path.join(pasta, f"assets/sfx/{f}.mp3")), TOTAL - t)
        aud.append(f'      <audio id="sfx-{k:02d}" src="assets/sfx/{f}.mp3" data-start="{t}" data-duration="{d:.2f}" data-volume="{v}" data-track-index="{4 + k % 4}"></audio>')
    fundo = ""
    if modo == "classico":
        fundo = (f'      <div id="ceu" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="0" style="position: absolute; inset: 0; background: radial-gradient(circle at 50% 0%, #1f4a96 0%, #12306a 10%, #0a1a3c 24%, #060a16 45%)"></div>\n'
                 f'      <div id="cidade" data-composition-id="cidade" data-composition-src="compositions/cidade.html" data-start="0" data-duration="{TOTAL}" data-track-index="8" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>\n')
    if modo == "3d":
        fundo = f'      <canvas id="mundo" width="1080" height="1920" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="0" style="position: absolute; left: 0; top: 0; width: 1080px; height: 1920px"></canvas>\n'
    fontes = "".join(f'      @font-face {{ font-family: "Figtree"; src: url("assets/fonts/Figtree-{w}.woff2") format("woff2"); font-weight: {w}; }}\n' for w in (400, 700))
    tres = '    <script src="assets/three.min.js"></script>\n' if modo == "3d" else ""
    mundo = '    <script src="assets/mundo.js"></script>\n' if modo == "3d" else ""
    html = f'''<!doctype html>
<html lang="pt-BR" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
{tres}    <style>
{fontes}      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #060a16; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
{fundo}{hosts}
{chr(10).join(aud)}
    </div>
{mundo}    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
'''
    open(os.path.join(pasta, "index.html"), "w").write(html)
    print(modo, len(cenas), "cenas,", len(aud), "faixas,", TOTAL, "s")


if __name__ == "__main__":
    modos = sys.argv[1:] or ["filme", "classico", "3d"]
    pastas = {"filme": AQUI, "classico": os.path.join(AQUI, "../astro-audios-classico"), "3d": os.path.join(AQUI, "../astro-audios-3d")}
    for m in modos:
        gerar(m, pastas[m])
