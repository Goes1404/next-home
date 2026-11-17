"""Gera o vídeo "o site da sua imobiliária" (bonecos 3D feitos em código).

Fundo: um canvas Three.js (assets/mundo.js) que desenha cidade, bonecos e
câmera a partir do tempo do vídeo. Por cima, uma composição por cena com os
títulos e as telas reais do site e do CRM (peças do vídeo das dores).
"""
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "../astro-dores"))
from gerar import FACE, CSS, W, H, titulo, mini, sep, selo, dur  # noqa: E402

CSS_SITE = '''    .sombra { height: 700px; }
    .slam { position: absolute; left: 50px; right: 50px; top: 210px; text-align: center; font-family: "Anton", sans-serif; font-size: 148px;
      line-height: 1.04; color: #f5f7fb; text-transform: uppercase; text-shadow: 0 8px 28px rgba(0, 0, 0, 0.5); }
    .slam .p { display: inline-block; margin: 0 0.1em; }
    .slam .r { background: #e0484d; padding: 0 0.12em; text-shadow: none; }
    .risco { position: absolute; left: 50%; padding: 14px 34px; border-radius: 26px; background: rgba(15, 37, 71, 0.92); white-space: nowrap;
      font: 700 46px "Figtree", sans-serif; color: #f5f7fb; transform: translateX(-50%); box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4); }
    .risco s { text-decoration-color: #e0484d; text-decoration-thickness: 6px; }
'''


def tela(i, h, img):
    return f'<div id="{i}" style="height: {h}px; background-image: url(\'assets/telas/{img}\')"></div>'


def aviso(i, top, titulo_, texto):
    return (f'<div id="{i}" class="aviso" style="top: {top}px"><div class="topo">{selo()}<span>Astro CRM · agora</span></div>'
            f'<b>{titulo_}</b><p>{texto}</p></div>')


# (id, início, duração, títulos [(id, l1, l2, entra, sai, cor)], elementos [(html, entra, tipo, sai)], extra js)
CENAS = [
    dict(id="s1", ini=0.0, dur=5.4, titulos=[], el=[], slam=[("Sua", 0.3), ("imobiliária", 0.6), ("ainda", 1.15), ("depende", 1.45), ("do", 1.8), ("Instagram?", 2.05)]),
    dict(id="s2", ini=5.4, dur=7.0, titulos=[("s2-t", "Site próprio,", "com a sua marca.", 0.4, None, "d")],
         el=[(mini("s2-m", 640, 1060, tela("s2-p1", 779, "site-home.jpg")), 3.4, "sobe", None)]),
    dict(id="s3", ini=12.4, dur=12.0, titulos=[("s3-t", "Cadastrar imóvel?", "Cole o link.", 0.3, 8.6, "d"), ("s3-t2", "Você revisa", "e publica.", 8.8, None, "d")],
         el=[(mini("s3-m", 60, 1060, tela("s3-p1", 443, "importar.jpg") + tela("s3-p2", 719, "imoveis.jpg")), 0.9, "sobe", None)],
         js=['tl.set("#s3-p2", { opacity: 0 }, 0);', 'tl.to("#s3-p1", { opacity: 0, duration: 0.2 }, 5.6);',
             'tl.fromTo("#s3-p2", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 5.7);', 'tl.fromTo("#s3-p2", { y: 0 }, { y: -60, duration: 3, ease: "power1.inOut" }, 6.0);']),
    dict(id="s4", ini=24.4, dur=8.4, titulos=[("s4-t", "Tour 360°", "no seu site.", 0.3, None, "d")],
         el=[(mini("s4-m", 640, 1060, '<video id="s4-v" class="clip" src="assets/telas/tour360.mp4" data-start="1.6" data-duration="6.8" data-playback-rate="0.85" muted playsinline style="position: absolute; left: 0; top: 0; width: 360px; height: 760px; object-fit: cover"></video>'), 1.4, "sobe", None),
             (sep("s4-s", "O cliente visita antes da visita", 1760), 4.2, "pop", None)]),
    dict(id="s5", ini=32.8, dur=10.6, titulos=[("s5-t", "Cada corretor,", "seu portfólio.", 0.3, 6.3, "d"), ("s5-t2", "O contato", "é dele.", 6.5, None, "d")],
         el=[(mini("s5-m", 640, 1080, tela("s5-p1", 2154, "site-corretora.jpg")), 5.0, "sobe", None),
             (sep("s5-s", "🔗 link pessoal do corretor", 1760), 6.4, "pop", None)],
         js=['tl.fromTo("#s5-p1", { y: 0 }, { y: -700, duration: 4.2, ease: "power2.inOut" }, 5.8);']),
    dict(id="s6", ini=43.4, dur=10.2, titulos=[("s6-t", "Pediu contato?", "Virou lead.", 0.3, 6.0, "d"), ("s6-t2", "Cliques no WhatsApp,", "por corretor.", 6.2, None, "d")],
         el=[(aviso("s6-av", 1300, "Novo lead · site", "Carla Mendes pediu contato pelo portfólio da Ana Lima."), 5.4, "desce", 6.1)]),
    dict(id="s7", ini=53.6, dur=9.0, titulos=[("s7-t", "Tudo no", "mesmo lugar.", 0.3, None, "d")],
         el=[('<div id="s7-r1" class="risco" style="top: 1340px"><s>agência</s></div>', 4.8, "pop", None),
             ('<div id="s7-r2" class="risco" style="top: 1480px"><s>planilha</s></div>', 5.7, "pop", None),
             ('<div id="s7-r3" class="risco" style="top: 1620px"><s>lead perdido</s></div>', 6.8, "pop", None)]),
]
FECHO_INI, FECHO_DUR = 62.6, 12.0
TOTAL = round(FECHO_INI + FECHO_DUR, 2)


IMG = {"s1": ("f1-dono-instagram.png", (0, -30)), "s2": ("f2-dono-site.png", (15, -25)), "s3": ("c08-link.png", (15, -25)),
       "s4": ("c10-tour.png", (0, -20)), "s5": ("f3-corretores.png", (-10, -25)), "s6": ("c12-roleta.png", (10, -25)),
       "s7": ("f4-dono-janela.png", (-15, -20))}


def cena(c, modo="3d"):
    i = c["id"]
    js, cam = [], ['<div class="sombra"></div>']
    if modo == "filme":
        img, (px, py) = IMG[i]
        cam = [f'<div id="{i}-f" class="fundo" style="background-image: url(\'assets/cenas/{img}\')"></div>', '<div class="sombra"></div>', '<div class="sombra-baixo"></div>']
        js.append(f'tl.fromTo("#{i}-f", {{ scale: 1.14, x: 0, y: 0, filter: "blur(10px)" }}, {{ scale: 1.04, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }}, 0);')
        js.append(f'tl.to("#{i}-f", {{ scale: 1.1, x: {px}, y: {py}, duration: {round(c["dur"] - 0.45, 2)}, ease: "none" }}, 0.45);')
    if c.get("slam"):
        cam.append('<div id="s1-g" class="slam">' + "".join(
            f'<span class="p{" r" if w.startswith("Instagram") else ""}" id="s1-g{k}">{w}</span>' for k, (w, t) in enumerate(c["slam"])) + "</div>")
        for k, (w, t) in enumerate(c["slam"]):
            js.append(f'tl.fromTo("#s1-g{k}", {{ opacity: 0, scale: 1.9 }}, {{ opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.4)" }}, {t});')
        js.append('tl.to("#s1-g5", { x: 8, duration: 0.05, repeat: 5, yoyo: true, ease: "none" }, 2.3);')
    for (tid, a, b, t0, t1, cor) in c["titulos"]:
        cam.append(titulo(tid, a, b, cor))
        js.append(f'tl.fromTo(".{tid}-w", {{ opacity: 0, scale: 1.5, filter: "blur(6px)" }}, {{ opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.3, stagger: 0.07, ease: "back.out(2.2)" }}, {t0});')
        if t1:
            js.append(f'tl.to("#{tid}", {{ opacity: 0, filter: "blur(8px)", duration: 0.14, ease: "power2.in" }}, {t1});')
    for (html, t, tipo, t1) in c["el"]:
        cam.append(html)
        eid = html.split('id="')[1].split('"')[0]
        if tipo == "pop":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }}, {t});')
        elif tipo == "desce":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, y: -160 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }}, {t});')
        elif tipo == "sobe":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, y: 900 }}, {{ opacity: 1, y: 0, rotation: {-3 if "left: 640" in html else 3}, duration: 0.55, ease: "power3.out" }}, {t});')
        if t1:
            js.append(f'tl.to("#{eid}", {{ opacity: 0, scale: 0.9, duration: 0.15, ease: "power2.in" }}, {t1});')
    js += c.get("js", [])
    js.append(f'tl.to("#{i}-cena", {{ opacity: 0, duration: 0.15, ease: "power2.in" }}, {round(c["dur"] - 0.15, 2)});')
    miolo = "\n    ".join(cam)
    corpo = "\n    ".join(js)
    return f'''<template>
  <style>
{FACE}{CSS}{CSS_SITE}  </style>
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


def fecho(modo="3d"):
    fx = open(os.path.join(AQUI, "../astro-completo/compositions/fecho.html")).read()
    a = fx.index('    <div id="e-celular"')
    b = fx.index('    <h1 id="e-frase"')
    bg = '    <div id="e-foto" style="position: absolute; inset: -40px; background-size: cover; background-position: center; background-image: url(\'assets/cenas/f5-equipe.png\')"></div>\n' if modo == "filme" else ''
    fx = fx[:a] + bg + '    <div id="e-escuro" style="position: absolute; inset: 0; background: rgba(5, 11, 24, 0.55)"></div>\n' + fx[b:]
    palavras = ["Quer", "ver", "com", "os", "imóveis", "da", "sua", "imobiliária?"]
    frase = "".join(f'<span class="p e-w{" d" if w == "imobiliária?" else ""}">{w}</span>' for w in palavras)
    i0 = fx.index('<h1 id="e-frase"')
    i1 = fx.index("</h1>", i0) + 5
    fx = fx[:i0] + f'<h1 id="e-frase" class="titulo clip" data-start="0.2" data-duration="2.5">{frase}</h1>' + fx[i1:]
    fx = fx.replace('data-start="6.4" data-duration="5.4"', f'data-start="2.6" data-duration="{FECHO_DUR - 2.6}"')
    fx = fx.replace("    #e-frase {\n      font-size: 100px;\n    }", "    #e-frase {\n      font-size: 120px;\n    }")
    fx = fx.replace("font-size: 178px;", "font-size: 150px;")
    fx = fx.replace('<span class="c" id="ec1">Teste</span><span class="c" id="ec2">grátis</span><br /><span class="c d" id="ec3">por 7 dias</span>',
                    '<span class="c" id="ec1">Agende</span><span class="c" id="ec2">uma</span><br /><span class="c d" id="ec3">demonstração</span>')
    fx = fx.replace("Começar agora →", "Agendar agora →")
    s0 = fx.index("<script>")
    linhas = []
    for ln in fx[s0:].split("\n"):
        if "#e-celular" in ln:
            continue
        if ln.strip().startswith("tl.") and ln.rstrip().endswith(");"):
            corpo, t = ln.rstrip()[:-2].rsplit(",", 1)
            t = float(t)
            if t >= 6.2:
                t = round(t - 3.7, 2)
            elif ".e-w.d" in ln:
                t = 1.4
            elif ".e-w" in ln:
                t = 0.3
            ln = f"{corpo}, {t});"
        linhas.append(ln)
    script = "\n".join(linhas).replace("stagger: 0.07", "stagger: 0.16")
    script = script.replace("const tl = gsap.timeline({ paused: true });", 'const tl = gsap.timeline({ paused: true });\n    tl.fromTo("#e-escuro", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);')
    if modo == "filme":
        script = script.replace('tl.fromTo("#e-escuro", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);', 'tl.fromTo("#e-escuro", { opacity: 0.2 }, { opacity: 0.35, duration: 0.5 }, 0);\n    tl.to("#e-escuro", { opacity: 1, duration: 0.4 }, 2.5);\n    tl.fromTo("#e-foto", { scale: 1.12, filter: "blur(10px)" }, { scale: 1.03, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, 0);\n    tl.to("#e-foto", { scale: 1.1, duration: 11, ease: "none" }, 0.5);')
    return fx[:s0] + script


def main(modo="3d", pasta=AQUI):
    os.makedirs(os.path.join(pasta, "compositions"), exist_ok=True)
    for c in CENAS:
        open(os.path.join(pasta, f"compositions/{c['id']}.html"), "w").write(cena(c, modo))
    open(os.path.join(pasta, "compositions/fecho.html"), "w").write(fecho(modo))

    cenas = [(c["id"], c["ini"], c["dur"]) for c in CENAS] + [("fecho", FECHO_INI, FECHO_DUR)]
    hosts = "\n".join(
        f'''      <div id="{n}" data-composition-id="{n}" data-composition-src="compositions/{n}.html"
        data-start="{a}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>'''
        for n, a, d in cenas)
    falas = {"s01": 0.3, "s02": 5.6, "s03": 12.6, "s04": 24.6, "s05": 33.0, "s06": 43.6, "s07": 53.8, "s08": FECHO_INI + 0.25}
    aud = [f'      <audio id="voz-{k}" src="assets/voice/{k}.wav" data-start="{t}" data-duration="{dur(os.path.join(AQUI, f"assets/voice/{k}.wav")):.2f}" data-volume="1" data-track-index="2"></audio>' for k, t in falas.items()]
    trilha = os.path.join(pasta, "assets/bgm/trilha-site.wav")
    if not os.path.exists(trilha):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(pasta, "assets/bgm/trilha.wav"), "-t", str(TOTAL),
                        "-af", f"afade=t=out:st={TOTAL - 2.5}:d=2.5", trilha], check=True)
    aud.append(f'      <audio id="trilha" src="assets/bgm/trilha-site.wav" data-start="0" data-duration="{TOTAL}" data-volume="0.2" data-track-index="3"></audio>')
    fx = [("click-soft", t, 0.5) for t in (0.3, 0.6, 1.15, 1.45, 1.8)] + [("impact-bass-1", 2.05, 0.7)]
    for c in CENAS[1:]:
        fx.append(("whoosh", round(c["ini"] - 0.25, 2), 0.45))
    for c in CENAS:
        for (html, t, tipo, t1) in c["el"]:
            fx.append(({"pop": "pop", "desce": "chime", "sobe": "whoosh-short"}[tipo], round(c["ini"] + t, 2), 0.5))
    # o que acontece no mundo 3D (no modo filme não há mundo 3D)
    if modo != "filme":
        fx += [("whoosh-short", 6.0, 0.5), ("impact-bass-1", 6.9, 0.45), ("pop", 8.1, 0.5), ("whoosh-short", 13.4, 0.5)]
        fx += [("click-soft", round(15.7 + k * 0.55 + 0.4, 2), 0.35) for k in range(9)] + [("chime", 21.6, 0.6)]
        fx += [("whoosh-short", 26.2, 0.45)] + [("pop", round(34.6 + k * 0.9, 2), 0.5) for k in range(3)]
        fx += [("whoosh", 46.6, 0.45), ("chime", 48.9, 0.6)] + [("pop", round(50.0 + k * 0.25, 2), 0.45) for k in range(3)]
        fx += [("whoosh-short", round(54.4 + k * 0.6, 2), 0.35) for k in range(4)]
    fx += [("whoosh", FECHO_INI - 0.25, 0.45), ("impact-bass-1", FECHO_INI + 2.75, 0.6), ("click-soft", FECHO_INI + 3.3, 0.6),
           ("click-soft", FECHO_INI + 3.53, 0.6), ("pop", FECHO_INI + 3.76, 0.7), ("whoosh-short", FECHO_INI + 4.15, 0.5)]
    for k, (f, t, v) in enumerate(sorted(fx, key=lambda x: x[1])):
        d = min(dur(os.path.join(AQUI, f"assets/sfx/{f}.mp3")), TOTAL - t)
        aud.append(f'      <audio id="sfx-{k:02d}" src="assets/sfx/{f}.mp3" data-start="{t}" data-duration="{d:.2f}" data-volume="{v}" data-track-index="{4 + k % 4}"></audio>')

    fontes = "".join(f'      @font-face {{ font-family: "Figtree"; src: url("assets/fonts/Figtree-{w}.woff2") format("woff2"); font-weight: {w}; }}\n' for w in (400, 700))
    html = f'''<!doctype html>
<html lang="pt-BR" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <script src="assets/three.min.js"></script>
    <style>
{fontes}      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #0b1834; }}
      #mundo {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      <canvas id="mundo" width="1080" height="1920" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="0"></canvas>
{hosts}
{chr(10).join(aud)}
    </div>
    <script src="assets/mundo.js"></script>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
'''
    if modo == "filme":
        html = html.replace('    <script src="assets/three.min.js"></script>\n', "").replace(f'      <canvas id="mundo" width="1080" height="1920" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="0"></canvas>\n', "").replace('    <script src="assets/mundo.js"></script>\n', "")
    open(os.path.join(pasta, "index.html"), "w").write(html)
    print(len(cenas), "cenas,", len(aud), "faixas,", TOTAL, "s")


if __name__ == "__main__":
    main()
    main("filme", os.path.join(AQUI, "../astro-site-filme"))
