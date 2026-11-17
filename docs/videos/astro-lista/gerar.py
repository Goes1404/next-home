"""Gera "lista de transmissão segura" (corretor autônomo, ~62 s) nos três estilos.

    python3 gerar.py  ->  astro-lista/           (animação de cinema, imagens já geradas)
                          ../astro-lista-3d/        (bonecos 3D em código, Three.js)
                          ../astro-lista-classico/  (céu da Astro e celular)

Textos reais do código: proposta da lista (src/lib/central/tratadores/listas.ts),
ritmo e limites (src/lib/whatsapp/antiBan.ts, primeiroContato.ts), recusa
(recusaDoCliente.ts). O status da lista é exemplo.
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


CSS_LISTA = """    .contador { position: absolute; left: 0; right: 0; top: 820px; text-align: center; font: 700 220px "Figtree", sans-serif; color: #ffffff;
      text-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); }
    .contador small { display: block; font: 700 44px "Figtree", sans-serif; color: #ffd0d2; margin-top: -10px; }
    .flash { position: absolute; inset: 0; background: #e0484d; opacity: 0; }
    .botao-vermelho { position: absolute; left: 190px; right: 190px; top: 1380px; padding: 34px 0; border-radius: 999px; background: #e0484d; color: #fff;
      font: 700 46px "Figtree", sans-serif; text-align: center; box-shadow: 0 20px 50px rgba(224, 72, 77, 0.55); }
    .dedo-toque { position: absolute; left: 640px; top: 1450px; font-size: 130px; }
    .massa { position: absolute; left: 60px; right: 60px; padding: 18px 26px; border-radius: 26px; border-top-right-radius: 8px; background: #d9fdd3;
      font: 400 30px/1.3 "Figtree", sans-serif; color: #0d1b33; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35); }
    .massa small { float: right; color: #6b7790; font-size: 24px; margin-left: 16px; }
"""
CSS_AUDIOS = CSS_AUDIOS + CSS_LISTA

FX_SEM = '<div id="{i}-fx" class="faixa sem">SEM ASTRO</div>'
FX_COM = '<div id="{i}-fx" class="faixa com">COM ASTRO</div>'
MASSA = "Oi! Imóvel incrível em Barueri, confira! 🏠🔥"

# cada cena: id, início, duração, imagem (cinema), títulos, elementos, js extra
CENAS = [
    dict(id="a", ini=0.0, dur=5.6, img="d01-gancho.png", pan=(0, -40), sem_fone=True,
         titulos=[], slam=[("Seu", 0.8), ("número", 1.05), ("vai", 1.95), ("cair.", 2.25)],
         el=[('<div id="a-flash" class="flash"></div>', 0.0, "set", None),
             ('<div id="a-n" class="contador">0<small>mensagens iguais enviadas</small></div>', 0.1, "pop", 3.1),
             ('<div id="a-b" class="botao-vermelho">Enviar para 200 contatos</div>', 3.3, "pop", None),
             ('<div id="a-d" class="dedo-toque">👆</div>', 3.9, "pop", None)],
         js=[f'tl.set("#a-n", {{ innerHTML: "{v}<small>mensagens iguais enviadas</small>" }}, {round(0.1 + k * 0.1, 2)});' for k, v in enumerate(range(10, 210, 10))]
            + ['tl.fromTo("#a-flash", { opacity: 0 }, { opacity: 0.55, duration: 0.06, yoyo: true, repeat: 3 }, 2.25);',
               'tl.fromTo("#a-cena", { x: 0 }, { x: 18, duration: 0.05, yoyo: true, repeat: 7, ease: "none" }, 2.25);',
               'tl.to("#a-g3", { color: "#ffffff", backgroundColor: "#e0484d", duration: 0.05 }, 2.25);',
               'tl.to("#a-d", { y: -40, duration: 0.15, yoyo: true, repeat: 1, ease: "power2.out" }, 4.3);',
               'tl.to("#a-b", { scale: 0.93, duration: 0.1, yoyo: true, repeat: 1 }, 4.45);',
               'tl.fromTo("#a-flash", { opacity: 0 }, { opacity: 0.8, duration: 0.08, yoyo: true, repeat: 1 }, 4.6);']),
    dict(id="b", ini=5.6, dur=10.6, img="d03-cafe.png", pan=(-10, -25),
         titulos=[("b-t", "Disparo em massa", "é banimento.", 0.3, None, "r")],
         el=[(FX_SEM.format(i="b"), 0.1, "pop", None)]
            + [(f'<div id="b-m{k}" class="massa" style="top: {900 + k * 110}px">{MASSA}<small>✓✓ 14:0{k}</small></div>', round(0.6 + k * 0.25, 2), "pop", 6.1) for k in range(6)]
            + [(sep("b-r1", "✕ Texto repetido", 1100, "ruim"), 6.5, "pop", None), (sep("b-r2", "✕ Tudo de uma vez", 1240, "ruim"), 7.4, "pop", None),
               (sep("b-r3", "✕ Gente bloqueando", 1380, "ruim"), 8.5, "pop", None)]),
    dict(id="c", ini=16.2, dur=6.6, img="c02-audio.png", pan=(15, -25),
         titulos=[("c-t", "Com a Astro,", "você só pede.", 0.3, None, "d")],
         el=[(FX_COM.format(i="c"), 0.1, "pop", None),
             (audio("c-b1", "manda o Vitra pra quem quer Barueri até 600 mil", 1000, "0:04"), 0.8, "pop", None)]),
    dict(id="d", ini=22.8, dur=8.2, img="c08-link.png", pan=(15, -25),
         titulos=[("d-t", "Cada um", "do seu jeito.", 0.3, None, "d")],
         el=[(FX_COM.format(i="d"), 0.1, "pop", None),
             (bolha("d-b1", "ele", central("Lista de transmissão pelo SEU WhatsApp.<br>Filtros: Barueri, até R$ 600 mil, imóvel Vitra.<br>23 pessoas; 9 nunca falaram com você.<br>"
                                            "Primeiro contato tem limite (10 por dia, 30 por semana): hoje cabem 9 de 9.<br>Cada mensagem é reescrita e conferida antes de sair (não sai texto repetido), "
                                            "primeiro contato vai sem foto, e quem já recebeu lista nesta semana fica de fora.<br><br>" + SIM), 900), 0.5, "pop", 3.9),
             (bolha("d-p1", "eu", '<span class="rotulo">reescrita para cada um</span>Oi, Carla! Lembrei de você: o Vitra, em Barueri, tem 2 quartos e cabe no que você me falou. Quer ver as fotos?', 960), 4.1, "pop", None),
             (bolha("d-p2", "eu", "Marcos, tudo bem? Saiu uma unidade no Vitra dentro do seu orçamento. Posso te mandar?", 1250), 4.7, "pop", None),
             (bolha("d-p3", "eu", "Oi, Juliana! Tenho uma opção em Barueri que combina com o que você procura. Te mando os detalhes?", 1460), 5.3, "pop", None)]),
    dict(id="e", ini=31.0, dur=8.2, img="c06-lista.png", pan=(-10, -25),
         titulos=[("e-t", "Do seu número,", "no ritmo seguro.", 0.3, None, "d")],
         el=[(FX_COM.format(i="e"), 0.1, "pop", None),
             ('<div id="e-f1" class="feito" style="top: 980px">⏱ Uma mensagem a cada 1min30<small>saindo do seu próprio WhatsApp</small></div>', 1.0, "pop", None),
             ('<div id="e-f2" class="feito" style="top: 1150px">🕘 Das 9h às 21h, de segunda a sábado<small>nada de madrugada</small></div>', 2.3, "pop", None),
             ('<div id="e-f3" class="feito" style="top: 1320px">👋 Primeiro contato: 10 por dia, 30 por semana<small>o resto espera a vez, na fila</small></div>', 5.3, "pop", None)]),
    dict(id="f", ini=39.2, dur=8.0, img="c07b-followup.png", pan=(-10, -25),
         titulos=[("f-t", "Quem sai,", "fica de fora.", 0.3, 4.6, "d"), ("f-t2", "Quem responde,", "a IA atende.", 4.75, None, "d")],
         el=[(FX_COM.format(i="f"), 0.1, "pop", None),
             (bolha("f-b1", "ele", "Por favor, não quero mais receber.", 1000), 0.6, "pop", 4.5),
             (sep("f-s1", "✓ Fora das próximas listas", 1160, "bom"), 1.7, "pop", 4.5),
             (bolha("f-b2", "ele", "Ainda tem o Vitra?", 1000), 5.0, "pop", None),
             (bolha("f-b3", "ia", '<span class="rotulo">✨ IA da Astro · agora</span>Tem sim, Carla! O Vitra tem 2 quartos em Barueri. Quer que eu te mande as fotos?', 1160), 5.9, "pop", None)]),
    dict(id="g", ini=47.2, dur=5.6, img="c04-carro.png", pan=(10, -25),
         titulos=[("g-t", "Como está", "a lista?", 0.3, None, "d")],
         el=[(FX_COM.format(i="g"), 0.1, "pop", None),
             (bolha("g-b1", "eu", "como está a lista?", 1000), 0.5, "pop", None),
             (bolha("g-b2", "ele", central("Lista “Vitra · Barueri” (exemplo): enviando.<br>23 pessoas · 14 enviadas · 5 responderam<br>Ficaram para os próximos dias: 9<br><br>Quem é cada um fica no painel, em Listas → Ver quem recebeu."), 1140), 1.8, "pop", None)]),
]
FECHO_INI, FECHO_DUR = 52.8, 9.5
TOTAL = round(FECHO_INI + FECHO_DUR, 2)
FALAS = {"l01": 0.5, "l02": 5.9, "l03": 16.5, "l04": 23.1, "l05": 31.3, "l06": 39.5, "l07": 47.5, "l08": FECHO_INI + 0.3}


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
    elif not c.get("sem_fone"):
        cab = (f'<div class="fone" id="{i}-fone"><div class="tela"><div class="cab com">{selo(68, 34)}<div>Astro CRM<small>número central</small></div></div></div></div>')
        cam.append(cab)
        js.append(f'tl.fromTo("#{i}-fone", {{ y: 120, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }}, 0);' if i == "a" else
                  f'tl.fromTo("#{i}-fone", {{ scale: 0.97 }}, {{ scale: 1, duration: 0.35, ease: "power2.out" }}, 0);')
    if c.get("slam"):
        cam.append('<div id="a-g" class="slam">' + "".join(f'<span class="p{" d" if w == "cair." else ""}" id="a-g{k}">{w}</span>' for k, (w, t) in enumerate(c["slam"])) + "</div>")
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
        if tipo != "set":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }}, {t});')
        if t1:
            js.append(f'tl.to("#{eid}", {{ opacity: 0, scale: 0.9, duration: 0.15, ease: "power2.in" }}, {t1});')
    # conversas longas: as bolhas antigas sobem para dar lugar às novas
    js += c.get("js", [])
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
    """A frase "Divulgue sem queimar o seu número." e a chamada do teste grátis."""
    fx = open(os.path.join(AQUI, "../astro-completo/compositions/fecho.html")).read()
    a = fx.index('    <div id="e-celular"')
    b = fx.index('    <h1 id="e-frase"')
    fundo = ""
    if modo == "filme":
        fundo = '    <div id="e-foto" style="position: absolute; inset: -40px; background-size: cover; background-position: center; background-image: url(\'assets/cenas/c14-chaves.png\')"></div>\n'
    fundo += '    <div id="e-escuro" style="position: absolute; inset: 0; background: rgba(5, 11, 24, 0.72)"></div>\n'
    fx = fx[:a] + fundo + fx[b:]
    palavras = ["Divulgue", "sem", "queimar", "o", "seu", "número."]
    frase = "".join(f'<span class="p e-w{" d" if w == "número." else ""}">{w}</span>' for w in palavras)
    i0 = fx.index('<h1 id="e-frase"')
    i1 = fx.index("</h1>", i0) + 5
    fx = fx[:i0] + f'<h1 id="e-frase" class="titulo clip" data-start="0.2" data-duration="2.5">{frase}</h1>' + fx[i1:]
    fx = fx.replace("    #e-frase {\n      font-size: 100px;\n    }", "    #e-frase {\n      font-size: 128px;\n    }")
    fx = fx.replace('data-start="6.4" data-duration="5.4"', f'data-start="2.6" data-duration="{FECHO_DUR - 2.6}"')
    s0 = fx.index("<script>")
    linhas = []
    for ln in fx[s0:].split("\n"):
        if "#e-celular" in ln:
            continue
        if ln.strip().startswith("tl.") and ln.rstrip().endswith(");"):
            corpo, t = ln.rstrip()[:-2].rsplit(",", 1)
            t = float(t)
            if t >= 6.2:
                t = round(t - 3.6, 2)
            elif ".e-w.d" in ln:
                t = 1.2
            elif ".e-w" in ln:
                t = 0.3
            ln = f"{corpo}, {t});"
        linhas.append(ln)
    script = "\n".join(linhas).replace("stagger: 0.07", "stagger: 0.17")
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
            shutil.copy(os.path.join(AQUI, "../astro-dores/assets/cenas" if c.startswith("d0") else "../astro-bonecos/assets/cenas", c), os.path.join(pasta, "assets/cenas", c))
    if modo == "3d":
        shutil.copy(os.path.join(AQUI, "../astro-site/assets/three.min.js"), os.path.join(pasta, "assets/three.min.js"))
        shutil.copy(os.path.join(AQUI, "mundo-lista.js"), os.path.join(pasta, "assets/mundo.js"))
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
    trilha = os.path.join(pasta, "assets/bgm/trilha-lista.wav")
    if not os.path.exists(trilha):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(pasta, "assets/bgm/trilha.wav"), "-t", str(TOTAL),
                        "-af", f"afade=t=out:st={TOTAL - 2.5}:d=2.5", trilha], check=True)
    aud.append(f'      <audio id="trilha" src="assets/bgm/trilha-lista.wav" data-start="0" data-duration="{TOTAL}" data-volume="0.2" data-track-index="3"></audio>')
    fx = [("click-soft", round(0.1 + k * 0.2, 2), 0.35) for k in range(10)] + [("click-soft", 0.8, 0.6), ("click-soft", 1.05, 0.6), ("click-soft", 1.95, 0.6), ("impact-bass-1", 2.25, 0.9), ("click", 4.45, 0.7), ("impact-bass-1", 4.6, 0.7)]
    for c in CENAS[1:]:
        fx.append(("whoosh", round(c["ini"] - 0.25, 2), 0.45))
    for c in CENAS:
        for (html, t, tipo, t1) in c["el"]:
            som = "pop"
            if 'class="sep ruim"' in html:
                som = "click"
            if tipo == "set":
                continue
            if 'class="bolha eu"' in html and "Áudio" in html:
                som = "whoosh-short"
            if "Já está na Agenda" in html or "Lembrete marcado" in html or 'class="feito"' in html:
                som = "chime"
            if "Novo lead" in html or 'class="sep bom"' in html:
                som = "chime"
            fx.append((som, round(c["ini"] + t, 2), 0.5))
    fx += [("whoosh", FECHO_INI - 0.25, 0.45), ("impact-bass-1", FECHO_INI + 2.85, 0.6), ("click-soft", FECHO_INI + 3.4, 0.6),
           ("click-soft", FECHO_INI + 3.63, 0.6), ("pop", FECHO_INI + 3.86, 0.7), ("whoosh-short", FECHO_INI + 4.25, 0.5)]
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
    pastas = {"filme": AQUI, "classico": os.path.join(AQUI, "../astro-lista-classico"), "3d": os.path.join(AQUI, "../astro-lista-3d")}
    for m in modos:
        gerar(m, pastas[m])
