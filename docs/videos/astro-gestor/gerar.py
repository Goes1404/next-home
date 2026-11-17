"""Gera "gestor: equipe e anúncios" (dono de imobiliária, ~67 s) nos três estilos.

    python3 gerar.py  ->  astro-gestor/          (animação de cinema, imagens já geradas)
                          ../astro-gestor-3d/       (bonecos 3D em código, Three.js)
                          ../astro-gestor-classico/ (céu da Astro e celular)

Textos reais do código: aviso de lead novo (src/lib/notificacoes/leadNovo.ts),
saída do corretor (admin/contas/SaidaDoCorretor.tsx, central redistribuir_leads),
cartões do painel de anúncios (PainelDeIndicadores.tsx). Números são exemplo.
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


CSS_GESTOR = """    .chip { position: absolute; padding: 14px 26px; border-radius: 999px; background: rgba(245, 247, 251, 0.97); color: #0d1b33;
      font: 700 32px "Figtree", sans-serif; box-shadow: 0 12px 26px rgba(0, 0, 0, 0.35); white-space: nowrap; }
    .fila { position: absolute; width: 270px; padding: 22px 0; border-radius: 30px; background: rgba(15, 37, 71, 0.94); border: 3px solid #4d84e0;
      color: #f5f7fb; font: 700 34px "Figtree", sans-serif; text-align: center; box-shadow: 0 14px 30px rgba(0, 0, 0, 0.4); }
    .fila small { display: block; font: 400 24px "Figtree", sans-serif; color: #a9c1e0; margin-top: 4px; }
    .lead { position: absolute; left: 340px; width: 400px; padding: 20px 26px; border-radius: 28px; background: #ffffff; color: #0d1b33;
      font: 700 32px "Figtree", sans-serif; box-shadow: 0 16px 34px rgba(0, 0, 0, 0.45); border: 4px solid #1f9d6b; }
    .lead small { display: block; font: 400 25px "Figtree", sans-serif; color: #3b4a63; margin-top: 4px; }
    .opcao { margin-top: 14px; padding: 16px 20px; border-radius: 18px; border: 2px solid #cfd8e3; font-size: 29px; color: #0d1b33; }
    .opcao.on { border-color: #4d84e0; background: #eaf1fd; font-weight: 700; }
    .btn { margin-top: 18px; padding: 18px; border-radius: 999px; background: #0f2547; color: #fff; font: 700 30px "Figtree", sans-serif; text-align: center; }
    .kpi { position: absolute; width: 440px; height: 200px; padding: 24px 28px; border-radius: 30px; background: rgba(245, 247, 251, 0.97);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35); font-family: "Figtree", sans-serif; }
    .kpi span { display: block; font-size: 28px; color: #6b7790; }
    .kpi b { display: block; margin-top: 10px; font-size: 64px; color: #0d1b33; }
    .kpi.destaque { background: #4d84e0; }
    .kpi.destaque span, .kpi.destaque b { color: #ffffff; }
"""
CSS_AUDIOS = CSS_AUDIOS + CSS_GESTOR


def kpi(i, rotulo, valor, left, top):
    return f'<div id="{i}" class="kpi" style="left: {left}px; top: {top}px"><span>{rotulo}</span><b>{valor}</b></div>'


# cada cena: id, início, duração, imagem (cinema), títulos, elementos, js extra
CENAS = [
    dict(id="a", ini=0.0, dur=4.8, img="c13-gestor.png", pan=(-10, -25),
         titulos=[], slam=[("Quanto", 0.6), ("custou", 0.95), ("cada", 1.4), ("visita?", 1.75)],
         el=[(sep("a-s", "📊 custo por visita deste mês: ?", 1420), 2.7, "pop", None)]),
    dict(id="b", ini=4.8, dur=10.4, sem_fone=True, img="c12-roleta.png", pan=(10, -25),
         titulos=[("b-t", "Lead novo?", "Vai na hora.", 0.3, None, "d")],
         el=[('<div id="b-o1" class="chip" style="left: 70px; top: 880px">🌐 Site</div>', 1.0, "pop", None),
             ('<div id="b-o2" class="chip" style="left: 300px; top: 880px">📋 Formulário do anúncio</div>', 1.9, "pop", None),
             ('<div id="b-o3" class="chip" style="left: 770px; top: 880px">🏢 Portal</div>', 2.7, "pop", None),
             ('<div id="b-l" class="lead" style="top: 1020px">Carla Mendes<small>chegou pelo site</small></div>', 3.4, "pop", None),
             ('<div id="b-f0" class="fila" style="left: 60px; top: 1420px">Ana<small>atendeu agora</small></div>', 3.6, "pop", None),
             ('<div id="b-f1" class="fila" style="left: 405px; top: 1420px">Bruno<small>próximo da fila</small></div>', 3.8, "pop", None),
             ('<div id="b-f2" class="fila" style="left: 750px; top: 1420px">Paula<small>depois</small></div>', 4.0, "pop", None)],
         js=['tl.to("#b-l", { y: 520, scale: 0.6, opacity: 0, duration: 0.7, ease: "power2.in" }, 6.6);',
             'tl.to("#b-f1", { borderColor: "#1f9d6b", backgroundColor: "rgba(31, 157, 107, 0.95)", scale: 1.08, duration: 0.25, ease: "back.out(2)" }, 7.25);',
             'tl.to("#b-f1", { scale: 1, duration: 0.3 }, 7.6);']),
    dict(id="c", ini=15.2, dur=7.6, img="c11-lembrete.png", pan=(15, -25),
         titulos=[("c-t", "O corretor", "é avisado.", 0.3, None, "d")],
         el=[('<div id="c-av" class="aviso" style="top: 1040px"><div class="topo">' + selo() + '<span>Astro CRM · agora</span></div><b>Novo lead · Next Home</b>'
              '<p>Carla Mendes chegou pelo site. Responda agora: o primeiro contato rápido é o que mais converte.</p></div>', 1.0, "pop", None)]),
    dict(id="d", ini=22.8, dur=8.2, img="c06-lista.png", pan=(-10, -25),
         titulos=[("d-t", "Corretor saiu?", "A carteira fica.", 0.3, None, "d")],
         el=[('<div id="d-p" class="aviso" style="top: 900px"><div class="topo">' + selo() + '<span>Painel do gestor · Equipe</span></div><b>Antes de desativar Bruno Reis</b>'
              '<p>Ele tem 23 leads na carteira. Para quem eles vão:</p><div id="d-o1" class="opcao">Dividir entre a equipe, pela roleta</div>'
              '<div id="d-o2" class="opcao">Ana Lima</div><div class="btn">Passar os leads e desativar</div></div>', 1.2, "pop", None),
             (sep("d-s", "✓ 23 leads passaram de Bruno Reis para Ana Lima.", 1700, "bom"), 5.4, "pop", None)],
         js=['tl.to("#d-o2", { borderColor: "#4d84e0", backgroundColor: "#eaf1fd", duration: 0.2 }, 3.4);', 'tl.fromTo("#d-o2", { scale: 1 }, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 }, 3.4);']),
    dict(id="e", ini=31.0, dur=11.2, sem_fone=True, img="d05-ana-ia.png", pan=(-10, -25),
         titulos=[("e-t", "Do clique", "à venda.", 0.3, None, "d")],
         el=[(kpi("e-k1", "Investimento", "R$ 3.000", 70, 900), 2.6, "pop", None), (kpi("e-k2", "Clientes", "60", 570, 900), 2.85, "pop", None),
             (kpi("e-k3", "Custo por cliente", "R$ 50", 70, 1130), 7.4, "pop", None), (kpi("e-k4", "Visitas", "12", 570, 1130), 3.1, "pop", None),
             (kpi("e-k5", "Custo por visita", "R$ 250", 70, 1360), 8.6, "pop", None), (kpi("e-k6", "Fechados", "2", 570, 1360), 3.35, "pop", None),
             ('<div id="e-m" class="chip" style="left: 70px; top: 1610px">🔄 Gasto sincronizado com o Meta · valores de exemplo</div>', 4.4, "pop", None)],
         js=['tl.to("#e-k5", { backgroundColor: "#4d84e0", duration: 0.2 }, 9.3);', 'tl.to(["#e-k5 span", "#e-k5 b"], { color: "#ffffff", duration: 0.2 }, 9.3);', 'tl.fromTo("#e-k5", { scale: 1 }, { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1 }, 9.3);']),
    dict(id="f", ini=42.2, dur=9.8, img="c04-carro.png", pan=(10, -25),
         titulos=[("f-t", "Pergunte", "no WhatsApp.", 0.3, None, "d")],
         el=[(audio("f-b1", "como foi a equipe este mês?", 960, "0:03"), 1.0, "pop", None),
             (bolha("f-b2", "ele", central("Equipe em novembro (exemplo):<br>🥇 Ana Lima — 3 vendas, 9 visitas<br>🥈 Paula Souza — 2 vendas, 7 visitas<br>🥉 Bruno Reis — 1 venda, 5 visitas<br><br>⏳ Lead parado: Rafael Costa, sem resposta há 3 dias (Bruno)"), 1200), 3.4, "pop", None)]),
    dict(id="g", ini=52.0, dur=5.8, img="c09-site.png", pan=(-10, -25),
         titulos=[("g-t", "Equipe organizada.", "Dinheiro rendendo.", 0.3, None, "d")],
         el=[('<div id="g-f1" class="feito" style="top: 900px"><b>✓</b> Roleta na hora</div>', 0.9, "pop", None),
             ('<div id="g-f2" class="feito" style="top: 1040px"><b>✓</b> Carteira da imobiliária</div>', 1.3, "pop", None),
             ('<div id="g-f3" class="feito" style="top: 1180px"><b>✓</b> Custo por visita e por venda</div>', 1.7, "pop", None),
             ('<div id="g-f4" class="feito" style="top: 1320px"><b>✓</b> Relatório no WhatsApp</div>', 2.1, "pop", None)]),
]
FECHO_INI, FECHO_DUR = 57.8, 9.5
TOTAL = round(FECHO_INI + FECHO_DUR, 2)
FALAS = {"g01": 0.3, "g02": 5.1, "g03": 15.5, "g04": 23.1, "g05": 31.3, "g06": 42.5, "g07": 52.3, "g08": FECHO_INI + 0.3}


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
        cam.append('<div id="a-g" class="slam">' + "".join(f'<span class="p{" d" if w == "visita?" else ""}" id="a-g{k}">{w}</span>' for k, (w, t) in enumerate(c["slam"])) + "</div>")
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
            shutil.copy(os.path.join(AQUI, "../astro-dores/assets/cenas" if c.startswith("d0") else "../astro-bonecos/assets/cenas", c), os.path.join(pasta, "assets/cenas", c))
    if modo == "3d":
        shutil.copy(os.path.join(AQUI, "../astro-site/assets/three.min.js"), os.path.join(pasta, "assets/three.min.js"))
        shutil.copy(os.path.join(AQUI, "mundo-gestor.js"), os.path.join(pasta, "assets/mundo.js"))
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
    trilha = os.path.join(pasta, "assets/bgm/trilha-gestor.wav")
    if not os.path.exists(trilha):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(pasta, "assets/bgm/trilha.wav"), "-t", str(TOTAL),
                        "-af", f"afade=t=out:st={TOTAL - 2.5}:d=2.5", trilha], check=True)
    aud.append(f'      <audio id="trilha" src="assets/bgm/trilha-gestor.wav" data-start="0" data-duration="{TOTAL}" data-volume="0.2" data-track-index="3"></audio>')
    fx = [("click-soft", t, 0.5) for t in (0.6, 0.95, 1.4)] + [("impact-bass-1", 1.75, 0.7), ("whoosh-short", 4.8 + 6.6, 0.5), ("chime", 4.8 + 7.25, 0.55), ("pop", 31.0 + 9.3, 0.5)]
    for c in CENAS[1:]:
        fx.append(("whoosh", round(c["ini"] - 0.25, 2), 0.45))
    for c in CENAS:
        for (html, t, tipo, t1) in c["el"]:
            som = "pop"
            if 'class="bolha eu"' in html and "Áudio" in html:
                som = "whoosh-short"
            if "Já está na Agenda" in html or "Lembrete marcado" in html or 'class="feito"' in html:
                som = "chime"
            if "Novo lead" in html or 'class="sep bom"' in html:
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
    pastas = {"filme": AQUI, "classico": os.path.join(AQUI, "../astro-gestor-classico"), "3d": os.path.join(AQUI, "../astro-gestor-3d")}
    for m in modos:
        gerar(m, pastas[m])
