"""Gera o vídeo "o dia da Ana em 3D": index.html e compositions/*.html.

Cada cena: imagem 3D (gerada no Figma, assets/cenas/) em tela cheia com
movimento lento de câmera, título no estilo da Astro e, por cima, o que é
real do CRM (mensagens do número central no texto do código, avisos, prints
do site e do painel). Narração, trilha e efeitos são os do vídeo completo.
"""
import json
import subprocess

W, H = 1080, 1920
SIM = "Responda <b>sim</b> para confirmar ou <b>não</b> para cancelar."


def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())


FACE = "".join(
    f'''    @font-face {{ font-family: "Figtree"; src: url("assets/fonts/Figtree-{w}.woff2") format("woff2"); font-weight: {w}; }}\n'''
    for w in (400, 600, 700)
) + '''    @font-face { font-family: "Anton"; src: url("assets/fonts/Anton-Regular.woff2") format("woff2"); }\n'''

CSS = '''    #root { position: absolute; inset: 0; overflow: hidden; }
    .fundo { position: absolute; inset: -40px; background-size: cover; background-position: center; }
    .sombra { position: absolute; left: 0; right: 0; top: 0; height: 760px;
      background: linear-gradient(180deg, rgba(5, 11, 24, 0.82) 0%, rgba(5, 11, 24, 0.55) 45%, rgba(5, 11, 24, 0) 100%); }
    .sombra-baixo { position: absolute; left: 0; right: 0; bottom: 0; height: 900px;
      background: linear-gradient(0deg, rgba(5, 11, 24, 0.6) 0%, rgba(5, 11, 24, 0) 100%); }
    .titulo { position: absolute; left: 90px; right: 90px; top: 236px; font-family: "Anton", sans-serif; font-size: 100px;
      line-height: 1.12; color: #f5f7fb; text-transform: uppercase; text-shadow: 0 6px 24px rgba(0, 0, 0, 0.45); }
    .titulo .p { display: inline-block; margin-right: 0.22em; }
    .titulo .d { color: #ffffff; background: #4d84e0; padding: 0 0.12em; text-shadow: none; }
    .bolha { position: absolute; max-width: 800px; padding: 22px 30px 24px; border-radius: 32px; font: 400 32px/1.34 "Figtree", sans-serif;
      color: #0d1b33; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35); }
    .bolha b { font-weight: 700; }
    .eu { right: 60px; background: #d9fdd3; border-top-right-radius: 8px; }
    .ele { left: 60px; background: #ffffff; border-top-left-radius: 8px; }
    .ia { right: 60px; background: #b1268f; color: #ffffff; border-top-right-radius: 8px; }
    .rotulo { display: block; font: 700 24px "Figtree", sans-serif; color: #6b7790; margin-bottom: 6px; }
    .ele .rotulo-c { display: flex; align-items: center; gap: 10px; font: 700 24px "Figtree", sans-serif; color: #0f2547; margin-bottom: 8px; }
    .aviso { position: absolute; left: 70px; right: 70px; padding: 28px 34px 30px; border-radius: 40px; background: rgba(245, 247, 251, 0.97);
      color: #0d1b33; box-shadow: 0 20px 44px rgba(0, 0, 0, 0.4); font-family: "Figtree", sans-serif; }
    .aviso .topo { display: flex; align-items: center; gap: 14px; font-size: 24px; color: #6b7790; }
    .aviso b { display: block; margin-top: 14px; font-size: 32px; }
    .aviso p { margin-top: 8px; font-size: 29px; line-height: 1.35; color: #3b4a63; }
    .sep { position: absolute; left: 50%; padding: 10px 26px; border-radius: 22px; background: rgba(223, 230, 241, 0.95);
      font: 700 26px "Figtree", sans-serif; color: #3b4a63; transform: translateX(-50%); }
    .mini { position: absolute; width: 380px; height: 780px; border-radius: 56px; background: #0b0f1a; box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5),
      inset 0 0 0 3px #2a3347; }
    .mini .tela { position: absolute; inset: 10px; border-radius: 46px; overflow: hidden; background: #e9edf3; }
    .mini .tela > div { position: absolute; left: 0; top: 0; width: 360px; background-size: 360px auto; background-repeat: no-repeat; }
    .mini video { position: absolute; left: 0; top: 0; width: 360px; height: 760px; object-fit: cover; }
'''

SELO = '''<svg viewBox="0 0 64 64" width="{s}" height="{s}" aria-hidden="true" style="border-radius: {r}px; flex: none">
  <defs><linearGradient id="{g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3a6b" /><stop offset="1" stop-color="#0a1830" /></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#{g})" />
  <path d="M18 48 L32 15 L46 48" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" />
  <ellipse cx="32" cy="37" rx="24" ry="7.5" transform="rotate(-18 32 37)" fill="none" stroke="#a9c1e0" stroke-width="2.6" />
  <path d="M49 15 L50.6 19.4 L55 21 L50.6 22.6 L49 27 L47.4 22.6 L43 21 L47.4 19.4 Z" fill="#fff" /></svg>'''


def selo(n, s=44, r=10):
    return SELO.format(s=s, r=r, g=f"sg-{n}")


def titulo(i, a, b):
    pa = "".join(f'<span class="p {i}-w">{w}</span>' for w in a.split())
    ws = b.split()
    pb = "".join(f'<span class="p {i}-w">{w}</span>' for w in ws[:-1]) + f'<span class="p {i}-w d">{ws[-1]}</span>'
    return f'<h1 id="{i}" class="titulo">{pa}<br />{pb}</h1>'


def bolha(i, quem, html, top):
    return f'<div id="{i}" class="bolha {quem}" style="top: {top}px">{html}</div>'


def central(html):
    return f'<span class="rotulo-c">{selo("x" + str(abs(hash(html)) % 9999), 34, 8)}Astro CRM · número central</span>{html}'


def mini(i, left, top, conteudo):
    return f'<div id="{i}" class="mini" style="left: {left}px; top: {top}px"><div class="tela">{conteudo}</div></div>'


# ---------------- as cenas ----------------
# cada cena: id, imagem, início, duração, títulos [(id, l1, l2, t_in, t_out)], elementos [(html, t_in, tipo)]
CENAS = [
    dict(id="c01", img="c01-cozinha.png", ini=0.0, dur=4.9, pan=(0, -30),
         titulos=[], gancho=True,
         el=[('<div id="c01-av" class="aviso" style="top: 1060px"><div class="topo">' + selo("c01") + '<span>Astro CRM · agora</span></div><b>Novo lead · Next Home</b><p>Carla Mendes chegou pelo anúncio "Apê 2 quartos Barueri". Responda agora: o primeiro contato rápido é o que mais converte.</p></div>', 1.6, "desce")]),
    dict(id="c02", img="c02-audio.png", ini=4.9, dur=7.1, pan=(20, -20),
         titulos=[("c02-t", "Mande no CRM", "pelo WhatsApp.", 0.25, None)],
         el=[(bolha("c02-b1", "eu", '<span class="rotulo">🎙 Áudio</span>marca visita com a Carla sábado às 10h', 960), 0.5, "pop"),
             (bolha("c02-b2", "ele", central("Vou fazer isto:<br>Marcar visita com Carla Mendes, sábado 21/11 às 10h<br><br>" + SIM), 1130), 1.9, "pop"),
             (bolha("c02-b3", "eu", "sim", 1530), 4.3, "pop"),
             (bolha("c02-b4", "ele", central("Visita com Carla Mendes marcada para sábado 21/11 às 10h. Já está na Agenda."), 1640), 5.0, "pop")]),
    dict(id="c03", img="c03-cartao.png", ini=12.0, dur=5.1, pan=(-20, -20),
         titulos=[("c03-t", "Foto do cartão?", "Virou lead.", 0.25, None)],
         el=[(bolha("c03-b1", "ele", central("Vou fazer isto:<br>Cadastrar Roberto Lima, (11) 98765-4321<br><br>" + SIM), 1300), 0.9, "pop"),
             (bolha("c03-b2", "eu", "sim", 1640), 2.6, "pop"),
             (bolha("c03-b3", "ele", central("Roberto Lima cadastrado na sua carteira."), 1740), 3.1, "pop")]),
    dict(id="c04", img="c04-carro.png", ini=17.1, dur=6.9, pan=(10, -25),
         titulos=[("c04-t", "Quem eu ligo hoje?", "Ele responde.", 0.25, None)],
         el=[(bolha("c04-b1", "eu", "quem eu ligo hoje?", 1180), 0.6, "pop"),
             (bolha("c04-b2", "ele", central("Hoje você tem:<br>📅 Visita às 10h com a Carla Mendes<br>🔥 Mais quentes: Roberto Lima (92) e Paula Reis (88)<br>⏳ Sem resposta há 2 dias: Bruno Alves"), 1300), 1.6, "pop")]),
    dict(id="c05", img="c05-casal.png", ini=24.0, dur=6.9, pan=(-15, -25),
         titulos=[("c05-t", "Material e vídeo", "pelo WhatsApp.", 0.25, None)],
         el=[(bolha("c05-b1", "eu", "manda as fotos e a planta do Vitra pra Carla", 1150), 0.6, "pop"),
             (bolha("c05-b2", "ele", central("Vou fazer isto:<br>Mandar a Carla Mendes, pelo seu WhatsApp, as fotos e a planta do Vitra"), 1300), 1.5, "pop"),
             (bolha("c05-b3", "eu", "e cria um vídeo do Vitra pro Instagram", 1540), 3.6, "pop"),
             (bolha("c05-b4", "ele", central("Vou fazer isto:<br>Criar um vídeo vertical do Vitra com as fotos do cadastro. Fica pronto em alguns minutos e eu te mando aqui."), 1650), 4.4, "pop")]),
    dict(id="c06", img="c06-lista.png", ini=30.9, dur=5.0, pan=(15, -20),
         titulos=[("c06-t", "Pede a lista.", "Ele protege.", 0.25, None)],
         el=[(bolha("c06-b1", "eu", "manda o Vitra pra quem quer Barueri até 600 mil", 1170), 0.4, "pop"),
             (bolha("c06-b2", "ele", central("Lista de transmissão pelo SEU WhatsApp.<br>Filtros: Barueri, até R$ 600 mil.<br>23 pessoas; 9 nunca falaram com você.<br>Hoje devem sair cerca de 18; o resto fica na fila, no ritmo seguro do número."), 1310), 1.3, "pop")]),
    dict(id="c07", img="c07-noite.png", ini=35.9, dur=9.4, pan=(0, -30),
         titulos=[("c07-t", "Enquanto você dorme,", "a IA atende.", 0.25, 5.9), ("c07-t2", "Preço?", "Quem fala é você.", 6.1, None)],
         el=[(bolha("c07-b1", "ele", '<span class="rotulo">🎙 Áudio · transcrição</span>Oi! O apê de Barueri ainda tem?', 1250), 1.0, "pop"),
             (bolha("c07-b2", "ia", "Tem sim, Carla! Você procura 2 quartos? Vai financiar?", 1420), 2.4, "pop"),
             (bolha("c07-b3", "ele", "Isso, 2 quartos e financiado.", 1580), 4.0, "pop"),
             (bolha("c07-b4", "ia", "Perfeito! A Ana vai te chamar para marcar a visita.", 1690), 5.4, "pop")]),
    dict(id="c07b", img="c07b-followup.png", ini=45.3, dur=6.6, pan=(-10, -25),
         titulos=[("c07b-t", "Cliente sumiu?", "Ele chama de novo.", 0.25, None)],
         el=[('<div id="c07b-s" class="sep" style="top: 1180px">24 horas depois</div>', 0.8, "pop"),
             (bolha("c07b-b1", "ia", "Oi, Carla! Conseguiu falar com seu marido? Posso te mandar a planta do apê de Barueri?", 1260), 1.6, "pop"),
             (bolha("c07b-b2", "ele", "Pode mandar! 😊", 1500), 3.9, "pop")]),
    dict(id="c08", img="c08-link.png", ini=51.9, dur=9.1, pan=(15, -25),
         titulos=[("c08-t", "Cadastrar imóvel?", "Cole o link.", 0.25, 4.6), ("c08-t2", "O Astro lê", "a página.", 4.8, None)],
         el=[(mini("c08-m", 640, 1000, '<div id="c08-p1" style="height: 443px; background-image: url(\'assets/telas/importar.jpg\')"></div><div id="c08-p2" style="height: 719px; top: 0; background-image: url(\'assets/telas/imoveis.jpg\')"></div>'), 0.8, "sobe"),
             ('<div id="c08-av" class="aviso" style="top: 1080px; right: 470px; left: 60px"><div class="topo">' + selo("c08") + '<span>Astro CRM · agora</span></div><b>2 leads seus combinam com Art Design</b></div>', 6.6, "desce")]),
    dict(id="c09", img="c09-site.png", ini=61.0, dur=8.4, pan=(-15, -25),
         titulos=[("c09-t", "Seu site", "pronto.", 0.25, 3.9), ("c09-t2", "E cada corretor", "com seu portfólio.", 4.1, None)],
         el=[(mini("c09-m", 60, 1000, '<div id="c09-p1" style="height: 779px; background-image: url(\'assets/telas/site-home.jpg\')"></div><div id="c09-p2" style="height: 779px; background-image: url(\'assets/telas/site-destaques.jpg\')"></div><div id="c09-p3" style="height: 2154px; background-image: url(\'assets/telas/site-corretora.jpg\')"></div>'), 0.6, "sobe")]),
    dict(id="c10", img="c10-tour.png", ini=69.4, dur=6.8, pan=(0, -20),
         titulos=[("c10-t", "Tour", "360° no site.", 0.25, None)],
         el=[(mini("c10-m", 640, 980, '<video id="c10-v" class="clip" src="assets/telas/tour360.mp4" data-start="0.9" data-duration="5.9" data-playback-rate="0.85" muted playsinline></video>'), 0.7, "sobe")]),
    dict(id="c12", img="c12-roleta.png", ini=76.2, dur=6.0, pan=(10, -25),
         titulos=[("c12-t", "O próximo da fila.", "Chama na hora.", 0.25, None)],
         el=[('<div id="c12-av" class="aviso" style="top: 1180px"><div class="topo">' + selo("c12") + '<span>Astro CRM · agora</span></div><b>Novo lead · Next Home</b><p>Carla Mendes chegou pelo anúncio "Apê 2 quartos Barueri". Responda agora: o primeiro contato rápido é o que mais converte.</p></div>', 0.9, "desce")]),
    dict(id="c13", img="c13-gestor.png", ini=82.2, dur=6.0, pan=(-15, -20),
         titulos=[("c13-t", "Custo por visita.", "Não por clique.", 0.25, None)],
         el=[(mini("c13-m", 60, 1000, '<div id="c13-p1" style="height: 719px; background-image: url(\'assets/telas/vendas.jpg\')"></div><div id="c13-p2" style="height: 719px; background-image: url(\'assets/telas/anuncios.jpg\')"></div>'), 0.6, "sobe")]),
    dict(id="c11", img="c11-lembrete.png", ini=88.2, dur=6.1, pan=(15, -25),
         titulos=[("c11-t", "Nada fica", "para trás.", 0.25, None)],
         el=[(bolha("c11-b1", "ele", central("<b>⏰ Lembrete</b><br><br>Ligar para o Roberto e mandar as fotos do Vitra.<br><br>👤 Roberto Lima"), 1180), 1.0, "pop")]),
]


def cena_html(c):
    i = c["id"]
    ts = "\n    ".join(titulo(*t[:3]) for t in c["titulos"])
    els = "\n    ".join(e[0] for e in c["el"])
    gancho = ""
    js = []
    px, py = c["pan"]
    js.append(f'tl.fromTo("#{i}-f", {{ scale: 1.14, x: 0, y: 0, filter: "blur(10px)" }}, {{ scale: 1.04, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }}, 0);')
    js.append(f'tl.to("#{i}-f", {{ scale: 1.1, x: {px}, y: {py}, duration: {c["dur"] - 0.45}, ease: "none" }}, 0.45);')
    if c.get("gancho"):
        palavras = [("Um", 0), ("CRM", 0), ("que", 0.47), ("trabalha", 0.47), ("por", 0.93), ("você", 0.93), ("no", 1.4), ("seu", 1.4), ("WhatsApp", 1.86)]
        gancho = '<div id="c01-g" class="titulo" style="font-size: 132px; text-align: center; left: 60px; right: 60px; top: 230px">' + "".join(
            f'<span class="p{" d" if w == "WhatsApp" else ""}" id="c01-g{k}">{w}</span>' for k, (w, t) in enumerate(palavras)) + "</div>"
        for k, (w, t) in enumerate(palavras):
            if t > 0:
                js.append(f'tl.fromTo("#c01-g{k}", {{ opacity: 0, scale: 1.8 }}, {{ opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.4)" }}, {t});')
    for (tid, a, b, t0, t1) in c["titulos"]:
        js.append(f'tl.fromTo(".{tid}-w", {{ opacity: 0, scale: 1.5, filter: "blur(6px)" }}, {{ opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.32, stagger: 0.07, ease: "back.out(2.2)" }}, {t0});')
        if t1:
            js.append(f'tl.to("#{tid}", {{ opacity: 0, filter: "blur(8px)", duration: 0.16, ease: "power2.in" }}, {t1});')
    for (html, t, tipo) in c["el"]:
        eid = html.split('id="')[1].split('"')[0]
        if tipo == "pop":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.42, ease: "back.out(2)" }}, {t});')
        elif tipo == "desce":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, y: -160 }}, {{ opacity: 1, y: 0, duration: 0.55, ease: "back.out(1.6)" }}, {t});')
        elif tipo == "sobe":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, y: 900, rotation: 6 }}, {{ opacity: 1, y: 0, rotation: -3, duration: 0.6, ease: "power3.out" }}, {t});')
    # o que acontece dentro dos celulares pequenos
    if i == "c08":
        js += ['tl.set("#c08-p2", { opacity: 0 }, 0);', 'tl.to("#c08-p1", { opacity: 0, duration: 0.2 }, 4.7);',
               'tl.fromTo("#c08-p2", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 4.8);', 'tl.fromTo("#c08-p2", { y: 0 }, { y: -40, duration: 3, ease: "power1.inOut" }, 5.2);']
    if i == "c09":
        js += ['tl.set(["#c09-p2", "#c09-p3"], { opacity: 0 }, 0);', 'tl.to("#c09-p1", { opacity: 0, duration: 0.2 }, 2.1);',
               'tl.fromTo("#c09-p2", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 2.2);', 'tl.to("#c09-p2", { opacity: 0, duration: 0.2 }, 4.1);',
               'tl.fromTo("#c09-p3", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 4.2);', 'tl.fromTo("#c09-p3", { y: 0 }, { y: -800, duration: 3.6, ease: "power2.inOut" }, 4.5);']
    if i == "c13":
        js += ['tl.set("#c13-p2", { opacity: 0 }, 0);', 'tl.fromTo("#c13-p1", { y: 0 }, { y: -120, duration: 2, ease: "power2.inOut" }, 1.0);',
               'tl.to("#c13-p1", { opacity: 0, duration: 0.2 }, 3.2);', 'tl.fromTo("#c13-p2", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 3.3);',
               'tl.fromTo("#c13-p2", { y: 0 }, { y: -110, duration: 2, ease: "power2.inOut" }, 3.5);']
    js.append(f'tl.to("#{i}-cena", {{ opacity: 0, duration: 0.2, ease: "power2.in" }}, {round(c["dur"] - 0.2, 2)});')
    corpo = "\n    ".join(js)
    return f'''<template>
  <style>
{FACE}{CSS}  </style>
  <div id="root" data-composition-id="{i}" data-width="{W}" data-height="{H}">
    <div id="{i}-cena" style="position: absolute; inset: 0">
    <div id="{i}-f" class="fundo" style="background-image: url('assets/cenas/{c["img"]}')"></div>
    <div class="sombra"></div>
    <div class="sombra-baixo"></div>
    {gancho}
    {ts}
    {els}
    </div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {corpo}
    window.__timelines["{i}"] = tl;
  </script>
</template>
'''


for c in CENAS:
    open(f"compositions/{c['id']}.html", "w").write(cena_html(c))

# ---------------- o fecho: as chaves e a chamada ----------------
fecho = open("../astro-completo/compositions/fecho.html").read()
fecho = fecho.replace('<div id="e-celular" class="celular">', '<div id="e-chaves" style="position: absolute; inset: -40px; background-size: cover; background-position: center; background-image: url(\'assets/cenas/c14-chaves.png\')"></div>\n    <div style="position: absolute; left: 0; right: 0; top: 0; height: 900px; background: linear-gradient(180deg, rgba(5,11,24,0.85) 0%, rgba(5,11,24,0.5) 55%, rgba(5,11,24,0) 100%)"></div>\n    <div id="e-celular" class="celular" style="display: none">')
fecho = fecho.replace('tl.fromTo("#e-celular", { scale: 1, y: 0, transformOrigin: "50% 0%" }, { scale: 0.62, y: 260, duration: 0.8, ease: "power2.inOut" }, 0.05);',
                      'tl.fromTo("#e-chaves", { scale: 1.12, filter: "blur(10px)" }, { scale: 1.03, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, 0);\n    tl.to("#e-chaves", { scale: 1.09, duration: 5.6, ease: "none" }, 0.5);')
fecho = fecho.replace('tl.to("#e-celular", { y: 1500, duration: 0.45, ease: "power3.in" }, 6.2);',
                      'tl.to("#e-chaves", { opacity: 0, filter: "blur(12px)", duration: 0.45, ease: "power2.in" }, 6.0);')
open("compositions/fecho.html", "w").write(fecho)

# ---------------- índice ----------------
cenas = [(c["id"], c["ini"], c["dur"]) for c in CENAS] + [("fecho", 94.3, 11.8)]
TOTAL = 106.1
hosts = "\n".join(
    f'''      <div id="{n}" data-composition-id="{n}" data-composition-src="compositions/{n}.html"
        data-start="{a}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>'''
    for n, a, d in cenas)
falas = {"n01": 0.3, "n02": 5.2, "n03": 12.3, "n04": 17.4, "n05": 24.3, "n06": 31.2, "n07": 36.4, "n07b": 45.6, "n08": 52.3,
         "n08b": 61.3, "n08c": 69.7, "n09": 76.5, "n10": 82.5, "n11": 88.5, "n12": 94.6}
aud = [f'      <audio id="voz-{k}" src="assets/voice/{k}.wav" data-start="{t}" data-duration="{dur(f"assets/voice/{k}.wav"):.2f}" data-volume="1" data-track-index="2"></audio>' for k, t in falas.items()]
aud.append(f'      <audio id="trilha" src="assets/bgm/trilha.wav" data-start="0" data-duration="{TOTAL}" data-volume="0.2" data-track-index="3"></audio>')
fx = [("click-soft", t, 0.5) for t in (0.47, 0.93, 1.4)] + [("pop", 1.86, 0.7), ("chime", 1.6, 0.6)]
for c in CENAS[1:]:
    fx.append(("whoosh", round(c["ini"] - 0.25, 2), 0.45))
for c in CENAS:
    for (html, t, tipo) in c["el"]:
        som = {"pop": "pop", "desce": "chime", "sobe": "whoosh-short"}[tipo]
        if 'class="bolha eu"' in html:
            som = "whoosh-short"
        if "Já está na Agenda" in html or "cadastrado na sua carteira" in html:
            som = "chime"
        fx.append((som, round(c["ini"] + t, 2), 0.55))
fx += [("whoosh", 94.05, 0.45), ("impact-bass-1", 94.3 + 6.45, 0.6), ("click-soft", 94.3 + 7.0, 0.6), ("click-soft", 94.3 + 7.23, 0.6), ("pop", 94.3 + 7.46, 0.7), ("whoosh-short", 94.3 + 7.85, 0.5)]
for k, (f, t, v) in enumerate(sorted(fx, key=lambda x: x[1])):
    d = min(dur(f"assets/sfx/{f}.mp3"), TOTAL - t)
    aud.append(f'      <audio id="sfx-{k:02d}" src="assets/sfx/{f}.mp3" data-start="{t}" data-duration="{d:.2f}" data-volume="{v}" data-track-index="{4 + k % 2}"></audio>')
idx = open("../astro-completo/index.html").read()
a = idx.index("    <div id=\"root\"")
b = idx.index("    <script>\n      const tl")
corpo = f'''    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      <div id="ceu" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="0"></div>
{hosts}
{chr(10).join(aud)}
    </div>
'''
open("index.html", "w").write(idx[:a] + corpo + idx[b:])
print(len(CENAS) + 1, "cenas,", len(aud), "faixas de áudio")
