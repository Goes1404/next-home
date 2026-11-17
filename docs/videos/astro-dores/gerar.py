"""Gera o vídeo "as dores do corretor" (60 s) nos dois estilos.

    python3 gerar.py            -> astro-dores/ (bonecos 3D, imagens do Figma)
                                   ../astro-dores-classico/ (fundo Astro, celular)

As duas versões dividem a mesma linha do tempo, narração (Thaís, p01–p07),
trilha, efeitos e tudo o que é do CRM (mensagens do número central, quadro do
funil, nota do lead, resumo, prints do site). Só o fundo muda: no 3D, o
Rafael (sem Astro) e a Ana (com Astro); no clássico, o céu da Astro e um
celular, com a faixa SEM ASTRO / COM ASTRO.
"""
import os
import subprocess

W, H = 1080, 1920
AQUI = os.path.dirname(os.path.abspath(__file__))
SIM = "Responda <b>sim</b> para confirmar ou <b>não</b> para cancelar."


def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())


FACE = "".join(
    f'''    @font-face {{ font-family: "Figtree"; src: url("assets/fonts/Figtree-{w}.woff2") format("woff2"); font-weight: {w}; }}\n'''
    for w in (400, 600, 700)
) + '''    @font-face { font-family: "Anton"; src: url("assets/fonts/Anton-Regular.woff2") format("woff2"); }\n'''

CSS = '''    #root { position: absolute; inset: 0; overflow: hidden; }
    .fundo { position: absolute; inset: -40px; background-size: cover; background-position: center; }
    .ceu-sem { position: absolute; inset: 0; background: radial-gradient(circle at 50% 0%, #5a2a33 0%, #2a1520 22%, #0d0a12 55%); }
    .ceu-com { position: absolute; inset: 0; background: radial-gradient(circle at 50% 0%, #1f4a96 0%, #12306a 12%, #0a1a3c 28%, #060a16 50%); }
    .sombra { position: absolute; left: 0; right: 0; top: 0; height: 780px;
      background: linear-gradient(180deg, rgba(5, 11, 24, 0.85) 0%, rgba(5, 11, 24, 0.55) 45%, rgba(5, 11, 24, 0) 100%); }
    .sombra-baixo { position: absolute; left: 0; right: 0; bottom: 0; height: 900px;
      background: linear-gradient(0deg, rgba(5, 11, 24, 0.6) 0%, rgba(5, 11, 24, 0) 100%); }
    .faixa { position: absolute; left: 90px; top: 150px; padding: 10px 26px 12px; border-radius: 999px; font: 700 30px "Figtree", sans-serif;
      letter-spacing: 0.08em; color: #fff; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35); }
    .faixa.sem { background: #e0484d; }
    .faixa.com { background: #4d84e0; }
    .titulo { position: absolute; left: 90px; right: 90px; top: 236px; font-family: "Anton", sans-serif; font-size: 104px;
      line-height: 1.12; color: #f5f7fb; text-transform: uppercase; text-shadow: 0 6px 24px rgba(0, 0, 0, 0.45); }
    .titulo .p { display: inline-block; margin-right: 0.22em; }
    .titulo .d { color: #ffffff; background: #4d84e0; padding: 0 0.12em; text-shadow: none; }
    .titulo .r { color: #ffffff; background: #e0484d; padding: 0 0.12em; text-shadow: none; }
    .bolha { position: absolute; max-width: 800px; padding: 22px 30px 24px; border-radius: 32px; font: 400 33px/1.34 "Figtree", sans-serif;
      color: #0d1b33; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35); }
    .bolha b { font-weight: 700; }
    .eu { right: 60px; background: #d9fdd3; border-top-right-radius: 8px; }
    .ele { left: 60px; background: #ffffff; border-top-left-radius: 8px; }
    .ia { right: 60px; background: #b1268f; color: #ffffff; border-top-right-radius: 8px; }
    .visto { display: block; text-align: right; font-size: 24px; color: #6b7790; margin-top: 4px; }
    .rotulo { display: block; font: 700 24px "Figtree", sans-serif; color: #6b7790; margin-bottom: 6px; }
    .ia .rotulo { color: #f6d3ec; }
    .ele .rotulo-c { display: flex; align-items: center; gap: 10px; font: 700 24px "Figtree", sans-serif; color: #0f2547; margin-bottom: 8px; }
    .aviso { position: absolute; left: 70px; right: 70px; padding: 28px 34px 30px; border-radius: 40px; background: rgba(245, 247, 251, 0.97);
      color: #0d1b33; box-shadow: 0 20px 44px rgba(0, 0, 0, 0.4); font-family: "Figtree", sans-serif; }
    .aviso .topo { display: flex; align-items: center; gap: 14px; font-size: 24px; color: #6b7790; }
    .aviso b { display: block; margin-top: 14px; font-size: 32px; }
    .aviso p { margin-top: 8px; font-size: 29px; line-height: 1.35; color: #3b4a63; }
    .sep { position: absolute; left: 50%; padding: 12px 28px; border-radius: 22px; background: rgba(223, 230, 241, 0.96); white-space: nowrap;
      font: 700 28px "Figtree", sans-serif; color: #3b4a63; transform: translateX(-50%); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3); }
    .sep.ruim { background: #e0484d; color: #fff; }
    .sep.bom { background: #1f9d6b; color: #fff; }
    .mini { position: absolute; width: 380px; height: 780px; border-radius: 56px; background: #0b0f1a; box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5),
      inset 0 0 0 3px #2a3347; }
    .mini .tela { position: absolute; inset: 10px; border-radius: 46px; overflow: hidden; background: #e9edf3; }
    .mini .tela > div { position: absolute; left: 0; top: 0; width: 360px; background-size: 360px auto; background-repeat: no-repeat; }
    .papel { position: absolute; padding: 22px 26px; font: 700 30px/1.3 "Figtree", sans-serif; color: #0d1b33; box-shadow: 0 16px 34px rgba(0, 0, 0, 0.4); }
    .postit { background: #ffe066; width: 300px; font-family: "Figtree", sans-serif; }
    .planilha { background: #fff; width: 440px; padding: 0; font-weight: 400; font-size: 24px; }
    .planilha div { display: flex; border-bottom: 2px solid #cfd8e3; }
    .planilha span { flex: 1; padding: 10px 14px; border-right: 2px solid #cfd8e3; }
    .planilha div:first-child { background: #1f9d6b; color: #fff; font-weight: 700; }
    .print { background: #fff; width: 360px; border-radius: 18px; font-weight: 400; font-size: 26px; }
    .print small { display: block; color: #6b7790; font-size: 22px; }
    /* o quadro do funil, redesenhado com as etapas reais */
    .quadro { position: absolute; left: 60px; right: 60px; height: 470px; border-radius: 40px; background: rgba(245, 247, 251, 0.97);
      box-shadow: 0 24px 50px rgba(0, 0, 0, 0.45); font-family: "Figtree", sans-serif; }
    .quadro .col { position: absolute; top: 24px; width: 296px; height: 422px; border-radius: 26px; background: #e6ebf2; }
    .quadro .col-t { margin: 18px 20px 0; padding-top: 12px; border-top: 6px solid; font: 700 26px "Figtree", sans-serif; color: #3b4a63; }
    .quadro .cinza { position: absolute; left: 16px; right: 16px; height: 96px; border-radius: 20px; background: #f7f9fc; border: 2px solid #d5dde8; }
    .quadro .cinza i { position: absolute; left: 20px; top: 22px; width: 150px; height: 18px; border-radius: 9px; background: #c8d2df; }
    .quadro .cinza i + i { top: 54px; width: 100px; }
    .cartao { position: absolute; left: 36px; top: 120px; width: 264px; height: 150px; padding: 18px 20px; border-radius: 22px; background: #fff;
      border: 3px solid #4d84e0; box-shadow: 0 12px 26px rgba(15, 37, 71, 0.25); }
    .cartao b { display: block; font: 700 29px "Figtree", sans-serif; color: #0d1b33; }
    .nota { position: absolute; left: 20px; top: 74px; padding: 6px 16px; border-radius: 999px; font: 700 24px "Figtree", sans-serif; }
    .nota.frio { background: #e3e8ef; color: #55627a; }
    .nota.quente { background: #ffe1d6; color: #c2410c; }
    .faisca { position: absolute; right: -18px; top: -22px; padding: 6px 14px; border-radius: 999px; background: #b1268f; color: #fff; font: 700 22px "Figtree", sans-serif; }
    .mao { position: absolute; font-size: 96px; filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.4)); }
    /* o celular do clássico */
    .fone { position: absolute; left: 110px; top: 640px; width: 860px; height: 1400px; border-radius: 96px; background: #0b0f1a;
      box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5), inset 0 0 0 3px #2a3347; }
    .fone .tela { position: absolute; inset: 16px; border-radius: 82px; overflow: hidden; background: #efe7de; }
    .fone .cab { position: absolute; left: 0; right: 0; top: 0; height: 200px; padding: 88px 48px 0; display: flex; align-items: center; gap: 20px;
      font: 700 32px "Figtree", sans-serif; color: #f5f7fb; }
    .fone .cab small { display: block; font: 400 24px "Figtree", sans-serif; opacity: 0.8; margin-top: 2px; }
    .fone .cab .bola { width: 68px; height: 68px; border-radius: 50%; background: #c9d3e0; color: #3b4a63; display: grid; place-items: center; font-size: 28px; flex: none; }
    .fone .cab.sem { background: #3b4352; }
    .fone .cab.com { background: #0f2547; }
'''
# no clássico, tudo o que flutua cabe dentro do celular
CSS_CLASSICO = '''    .eu, .ia { right: 150px; }
    .ele { left: 150px; }
    .bolha { max-width: 700px; }
    .aviso { left: 150px; right: 150px; }
    .quadro { left: 140px; right: auto; width: 960px; scale: 0.834; transform-origin: 0 0; }
    #a-fone { top: 900px; }
    #a-s { top: 1760px !important; }
'''

SELO = '''<svg viewBox="0 0 64 64" width="{s}" height="{s}" aria-hidden="true" style="border-radius: {r}px; flex: none">
  <defs><linearGradient id="{g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3a6b" /><stop offset="1" stop-color="#0a1830" /></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="url(#{g})" />
  <path d="M18 48 L32 15 L46 48" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" />
  <ellipse cx="32" cy="37" rx="24" ry="7.5" transform="rotate(-18 32 37)" fill="none" stroke="#a9c1e0" stroke-width="2.6" />
  <path d="M49 15 L50.6 19.4 L55 21 L50.6 22.6 L49 27 L47.4 22.6 L43 21 L47.4 19.4 Z" fill="#fff" /></svg>'''

_n = [0]


def selo(s=44, r=10):
    _n[0] += 1
    return SELO.format(s=s, r=r, g=f"sg-{_n[0]}")


def titulo(i, a, b, cor="d"):
    pa = "".join(f'<span class="p {i}-w">{w}</span>' for w in a.split())
    ws = b.split()
    pb = "".join(f'<span class="p {i}-w">{w}</span>' for w in ws[:-1]) + f'<span class="p {i}-w {cor}">{ws[-1]}</span>'
    return f'<h1 id="{i}" class="titulo">{pa}<br />{pb}</h1>'


def bolha(i, quem, html, top):
    return f'<div id="{i}" class="bolha {quem}" style="top: {top}px">{html}</div>'


def central(html):
    return f'<span class="rotulo-c">{selo(34, 8)}Astro CRM · número central</span>{html}'


def ia(html):
    return f'<span class="rotulo">✨ IA da Astro · agora</span>{html}'


def mini(i, left, top, conteudo):
    return f'<div id="{i}" class="mini" style="left: {left}px; top: {top}px"><div class="tela">{conteudo}</div></div>'


def sep(i, txt, top, tipo=""):
    return f'<div id="{i}" class="sep {tipo}" style="top: {top}px">{txt}</div>'


def quadro(i, top):
    cols = [("Novo", "#4d84e0"), ("Em conversa", "#14b8a6"), ("Qualificado", "#14b8a6")]
    h = f'<div id="{i}" class="quadro" style="top: {top}px">'
    for k, (nome, cor) in enumerate(cols):
        cinzas = "".join(f'<div class="cinza" style="top: {y}px"><i></i><i></i></div>' for y in ([290] if k == 0 else [96, 210, 324] if k == 1 else [96, 210]))
        h += f'<div class="col" style="left: {20 + k * 310}px"><div class="col-t" style="border-color: {cor}">{nome}</div>{cinzas}</div>'
    h += (f'<div id="{i}-c" class="cartao"><b>Carla Mendes</b><span id="{i}-n1" class="nota frio">Frio · 25</span>'
          f'<span id="{i}-n2" class="nota quente">🔥 Quente · 86</span><span id="{i}-ia" class="faisca">✨ IA</span></div>')
    return h + "</div>"


# ---------------- as cenas ----------------
# fundos: (imagem 3D, início, fase "sem"/"com", movimento (x, y), zoom inicial)
# titulos: (id, linha 1, linha 2, entra, sai, cor)
# el: (html, entra, tipo, sai)
CENAS = [
    dict(id="a", ini=0.0, dur=4.4, cab=("Clientes", "12 conversas sem resposta"),
         fundos=[("d01-gancho.png", 0, "sem", (0, -30), 1.0)],
         faixas=[], titulos=[],
         el=[(sep("a-s", "🔴 12 conversas sem resposta", 1330, "ruim"), 2.6, "pop", None)]),
    dict(id="b", ini=4.4, dur=9.0, cab=("Carla Mendes", "visto por último às 23:12"),
         fundos=[("d02-dormindo.png", 0, "sem", (10, -20), 1.0), ("c07-noite.png", 4.7, "com", (0, -30), 1.0)],
         faixas=[("sem", 0.2, 4.7), ("com", 4.7, None)],
         titulos=[("b-t", "23h. O cliente", "chamou.", 0.3, 4.6, "r"), ("b-t2", "A IA responde", "na hora.", 4.8, None, "d")],
         el=[(bolha("b-b1", "ele", 'Oi! O apê de Barueri ainda tem? Queria visitar amanhã.<span class="visto">23:12</span>', 1060), 0.7, "pop", 4.6),
             (sep("b-s1", "⏰ Respondeu 9 horas depois", 1330, "ruim"), 2.3, "pop", 4.6),
             (sep("b-s2", "Ela já fechou com outro corretor", 1430, "ruim"), 3.4, "pop", 4.6),
             (bolha("b-b2", "ele", 'Oi! O apê de Barueri ainda tem? Queria visitar amanhã.<span class="visto">23:12</span>', 1040), 5.0, "pop", None),
             (bolha("b-b3", "ia", ia("Tem sim, Carla! São 2 quartos. Qual o melhor horário para a visita?"), 1260), 5.6, "pop", None),
             (bolha("b-b4", "ele", "Amanhã às 10h!", 1500), 6.9, "pop", None),
             (bolha("b-b5", "ia", ia("Combinado! Visita amanhã às 10h. 😊"), 1610), 7.6, "pop", None)]),
    dict(id="c", ini=13.4, dur=6.3, cab=("Carla Mendes", "visto há 3 dias"),
         fundos=[("d03-cafe.png", 0, "sem", (-10, -20), 1.0), ("c07b-followup.png", 1.85, "com", (-10, -25), 1.0)],
         faixas=[("sem", 0.2, 1.85), ("com", 1.85, None)],
         titulos=[("c-t", "O cliente", "sumiu?", 0.3, 1.75, "r"), ("c-t2", "O follow-up", "chama sozinho.", 1.95, None, "d")],
         el=[(bolha("c-b1", "eu", 'Oi Carla, tudo bem? Conseguiu pensar?<span class="visto">✓✓ há 3 dias</span>', 1180), 0.5, "pop", 1.8),
             (sep("c-s1", "24 horas depois", 1120), 2.1, "pop", None),
             (bolha("c-b2", "ia", ia("Oi, Carla! Conseguiu falar com seu marido? Posso te mandar a planta do apê de Barueri?"), 1210), 2.5, "pop", None),
             (bolha("c-b3", "ele", "Pode mandar! 😊", 1500), 3.9, "pop", None),
             (sep("c-s2", "✓ Ela respondeu: o follow-up para", 1630, "bom"), 4.6, "pop", None)]),
    dict(id="d", ini=19.7, dur=11.0, cab=("Funil", "47 leads"),
         fundos=[("d04-arrasta.png", 0, "sem", (15, -20), 1.0), ("d05-ana-ia.png", 4.15, "com", (-10, -25), 1.0)],
         faixas=[("sem", 0.2, 4.15), ("com", 4.15, None)],
         titulos=[("d-t", "CRM comum:", "você arrasta.", 0.3, 4.05, "r"), ("d-t2", "Na Astro,", "a IA atualiza.", 4.25, 9.4, "d"),
                  ("d-t3", "Sem você", "perceber.", 9.55, None, "d")],
         el=[(quadro("d-q", 1140), 0.4, "sobe", None),
             ('<div id="d-mao" class="mao" style="left: 250px; top: 1300px">✋</div>', 0.9, "pop", 3.9),
             (sep("d-s1", "47 leads para arrastar hoje", 1650, "ruim"), 2.3, "pop", 4.0),
             ('<div id="d-res" class="aviso" style="top: 1640px"><div class="topo">' + selo() + '<span>Astro CRM · resumo da conversa</span></div><p>Carla procura 2 quartos em Barueri, vai financiar. Visita amanhã às 10h.</p></div>', 8.4, "desce", None)]),
    dict(id="e", ini=30.7, dur=8.3, cab=("Contatos", "print, papel e planilha"),
         fundos=[("d04-arrasta.png", 0, "sem", (0, -60), 1.55), ("c03-cartao.png", 2.95, "com", (-20, -20), 1.0), ("c04-carro.png", 5.1, "com", (10, -25), 1.0)],
         faixas=[("sem", 0.2, 2.95), ("com", 2.95, None)],
         titulos=[("e-t", "Print, papel", "e planilha?", 0.3, 2.85, "r"), ("e-t2", "Mande a foto.", "Virou lead.", 3.05, 5.0, "d"),
                  ("e-t3", "Quem ligar hoje?", "Ele responde.", 5.15, None, "d")],
         el=[('<div id="e-p1" class="papel print" style="left: 90px; top: 1000px; rotate: -6deg">Roberto Lima<small>print de 12/10 · “me chama sexta”</small></div>', 0.4, "pop", 2.85),
             ('<div id="e-p2" class="papel postit" style="left: 620px; top: 1120px; rotate: 7deg">Bruno?? 9 8765-43…</div>', 0.8, "pop", 2.85),
             ('<div id="e-p3" class="papel planilha" style="left: 200px; top: 1380px; rotate: -3deg"><div><span>Nome</span><span>Status</span></div><div><span>Paula R.</span><span>???</span></div><div><span>Carla M.</span><span>ligar</span></div></div>', 1.2, "pop", 2.85),
             (bolha("e-b1", "eu", '<span class="rotulo">📷 Foto</span>cartão do Roberto', 1150), 3.2, "pop", 5.0),
             (bolha("e-b2", "ele", central("Roberto Lima cadastrado na sua carteira."), 1330), 3.8, "pop", 5.0),
             (bolha("e-b3", "eu", "quem eu ligo hoje?", 1150), 5.4, "pop", None),
             (bolha("e-b4", "ele", central("Hoje você tem:<br>📅 Visita às 10h com a Carla Mendes<br>🔥 Mais quentes: Roberto Lima (92) e Paula Reis (88)<br>⏳ Sem resposta há 2 dias: Bruno Alves"), 1290), 6.0, "pop", None)]),
    dict(id="f", ini=39.0, dur=7.2, cab=("Instagram", "último post há 23 dias"),
         fundos=[("d01-gancho.png", 0, "sem", (0, 30), 1.35), ("c08-link.png", 2.1, "com", (15, -25), 1.0), ("c09-site.png", 4.0, "com", (-15, -25), 1.0)],
         faixas=[("sem", 0.2, 2.1), ("com", 2.1, None)],
         titulos=[("f-t", "Sem tempo", "pra divulgar?", 0.3, 2.0, "r"), ("f-t2", "Cole o link.", "Pronto.", 2.2, 3.9, "d"),
                  ("f-t3", "No seu site", "e portfólio.", 4.05, None, "d")],
         el=[(sep("f-s1", "📅 Último post: há 23 dias", 1300, "ruim"), 0.7, "pop", 2.0),
             (mini("f-m1", 640, 1000, '<div id="f-p1" style="height: 443px; background-image: url(\'assets/telas/importar.jpg\')"></div><div id="f-p2" style="height: 719px; background-image: url(\'assets/telas/imoveis.jpg\')"></div>'), 2.3, "sobe", 3.95),
             (mini("f-m2", 60, 1000, '<div id="f-p3" style="height: 779px; background-image: url(\'assets/telas/site-home.jpg\')"></div><div id="f-p4" style="height: 2154px; background-image: url(\'assets/telas/site-corretora.jpg\')"></div>'), 4.15, "sobe", None)]),
]
FECHO_INI, FECHO_DUR = 46.2, 11.3
TOTAL = round(FECHO_INI + FECHO_DUR, 2)


def cena_html(c, modo):
    i = c["id"]
    js = []
    camadas = []
    for k, (img, t, fase, (px, py), z) in enumerate(c["fundos"]):
        fid = f"{i}-f{k}"
        fim = c["fundos"][k + 1][1] if k + 1 < len(c["fundos"]) else c["dur"]
        if modo == "3d":
            camadas.append(f'<div id="{fid}" class="fundo" style="background-image: url(\'assets/cenas/{img}\')"></div>')
            js.append(f'tl.fromTo("#{fid}", {{ opacity: {0 if k else 1}, scale: {z * 1.12}, x: 0, y: 0, filter: "blur(10px)" }}, {{ opacity: 1, scale: {z * 1.03}, filter: "blur(0px)", duration: 0.4, ease: "power3.out" }}, {t});')
            js.append(f'tl.to("#{fid}", {{ scale: {z * 1.09}, x: {px}, y: {py}, duration: {round(fim - t - 0.4, 2)}, ease: "none" }}, {t + 0.4});')
        else:
            # no clássico só muda o céu quando muda a fase
            if k == 0 or fase != c["fundos"][k - 1][2]:
                camadas.append(f'<div id="{fid}" class="ceu-{fase}"></div>')
                if k:
                    js.append(f'tl.fromTo("#{fid}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.35, ease: "power2.out" }}, {t});')
    if modo == "classico":
        sem, com = c["cab"]
        ini_cab = sem[:1]
        fone = (f'<div id="{i}-fone" class="fone"><div class="tela">'
                f'<div id="{i}-cab1" class="cab sem"><span class="bola">{ini_cab}</span><div>{sem}<small>{com}</small></div></div>')
        if any(f[2] == "com" for f in c["fundos"]):
            fone += f'<div id="{i}-cab2" class="cab com">{selo(68, 34)}<div>Astro CRM<small>a IA está atendendo</small></div></div>'
            t_com = next(f[1] for f in c["fundos"] if f[2] == "com")
            js.append(f'tl.fromTo("#{i}-cab2", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3 }}, {t_com});')
        fone += '</div></div>'
        camadas.append(fone)
        js.append(f'tl.fromTo("#{i}-fone", {{ y: 160, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }}, 0);' if i == "a" else
                  f'tl.fromTo("#{i}-fone", {{ scale: 0.97 }}, {{ scale: 1, duration: 0.4, ease: "power2.out" }}, 0);')
    else:
        camadas += ['<div class="sombra"></div>', '<div class="sombra-baixo"></div>']

    # faixa SEM ASTRO / COM ASTRO
    for k, (fase, t0, t1) in enumerate(c["faixas"]):
        fid = f"{i}-fx{k}"
        camadas.append(f'<div id="{fid}" class="faixa {fase}">{"SEM ASTRO" if fase == "sem" else "COM ASTRO"}</div>')
        js.append(f'tl.fromTo("#{fid}", {{ opacity: 0, x: -60 }}, {{ opacity: 1, x: 0, duration: 0.3, ease: "back.out(2)" }}, {t0});')
        if t1:
            js.append(f'tl.to("#{fid}", {{ opacity: 0, duration: 0.12 }}, {t1 - 0.12});')

    # o gancho: palavra por palavra, "perdeu" em vermelho
    if i == "a":
        palavras = [("Quantos", 0.55), ("clientes", 0.85), ("você", 1.3), ("perdeu", 1.6), ("essa", 2.15), ("semana?", 2.4)]
        camadas.append('<div id="a-g" class="titulo" style="font-size: 150px; text-align: center; left: 50px; right: 50px; top: 220px; line-height: 1.04">' + "".join(
            f'<span class="p{" r" if w == "perdeu" else ""}" id="a-g{k}">{w}</span>' for k, (w, t) in enumerate(palavras)) + "</div>")
        for k, (w, t) in enumerate(palavras):
            js.append(f'tl.fromTo("#a-g{k}", {{ opacity: 0, scale: 1.9 }}, {{ opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.4)" }}, {t});')
        js.append('tl.to("#a-g3", { x: 8, duration: 0.05, repeat: 5, yoyo: true, ease: "none" }, 1.85);')
        if modo == "classico":
            avisos = [("Carla Mendes", "Oi! O apê ainda tem?", "23:12"), ("Roberto Lima", "Consegue me mandar as fotos?", "ontem"),
                      ("Paula Reis", "Aceita financiamento?", "seg"), ("Bruno Alves", "Ainda disponível?", "dom")]
            for k, (n, m, h) in enumerate(avisos):
                camadas.append(f'<div id="a-n{k}" class="aviso" style="top: {1130 + k * 150}px; padding: 20px 30px"><div class="topo"><b style="margin: 0; font-size: 30px; color: #0d1b33">{n}</b><span style="margin-left: auto">{h}</span></div><p style="margin-top: 4px">{m}</p></div>')
                js.append(f'tl.fromTo("#a-n{k}", {{ opacity: 0, y: -80 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }}, {0.4 + k * 0.35});')

    for (tid, a, b, t0, t1, cor) in c["titulos"]:
        camadas.append(titulo(tid, a, b, cor))
        js.append(f'tl.fromTo(".{tid}-w", {{ opacity: 0, scale: 1.5, filter: "blur(6px)" }}, {{ opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.3, stagger: 0.07, ease: "back.out(2.2)" }}, {t0});')
        if t1:
            js.append(f'tl.to("#{tid}", {{ opacity: 0, filter: "blur(8px)", duration: 0.14, ease: "power2.in" }}, {t1});')

    for (html, t, tipo, t1) in c["el"]:
        camadas.append(html)
        eid = html.split('id="')[1].split('"')[0]
        if tipo == "pop":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }}, {t});')
        elif tipo == "desce":
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, y: -160 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }}, {t});')
        elif tipo == "sobe":
            rot = "rotation: -3, " if eid.startswith("f-m") else ""
            js.append(f'tl.fromTo("#{eid}", {{ opacity: 0, y: 900 }}, {{ opacity: 1, y: 0, {rot}duration: 0.55, ease: "power3.out" }}, {t});')
        if t1:
            js.append(f'tl.to("#{eid}", {{ opacity: 0, scale: 0.9, duration: 0.15, ease: "power2.in" }}, {t1});')

    # o quadro do funil: o Rafael arrasta, na Astro o cartão anda sozinho
    if i == "d":
        js += ['tl.set(["#d-q-n2", "#d-q-ia"], { opacity: 0 }, 0);',
               'tl.to("#d-mao", { x: 0, y: 0, duration: 0.01 }, 1.3);',
               'tl.to(["#d-q-c", "#d-mao"], { x: 150, y: -14, rotation: 4, duration: 1.2, ease: "power1.inOut" }, 1.4);',
               'tl.to(["#d-q-c", "#d-mao"], { x: 120, y: 10, rotation: -2, duration: 0.5, ease: "power1.inOut" }, 2.6);',
               'tl.to(["#d-q-c", "#d-mao"], { x: 310, y: 0, rotation: 0, duration: 0.8, ease: "power2.inOut" }, 3.1);',
               'tl.set("#d-q-c", { x: 0, y: 0, rotation: 0 }, 4.15);',
               'tl.to("#d-q-ia", { opacity: 1, duration: 0.2 }, 4.9);',
               'tl.to("#d-q-c", { x: 310, duration: 0.5, ease: "back.inOut(1.4)" }, 5.0);',
               'tl.to("#d-q-c", { x: 620, duration: 0.5, ease: "back.inOut(1.4)" }, 6.3);',
               'tl.to("#d-q-n1", { opacity: 0, duration: 0.15 }, 7.6);',
               'tl.fromTo("#d-q-n2", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.4)" }, 7.65);',
               'tl.to("#d-q-c", { boxShadow: "0 0 0 10px rgba(177, 38, 143, 0.35)", duration: 0.25, yoyo: true, repeat: 1 }, 7.65);']
    if i == "f":
        js += ['tl.set("#f-p2", { opacity: 0 }, 0);', 'tl.to("#f-p1", { opacity: 0, duration: 0.2 }, 3.0);',
               'tl.fromTo("#f-p2", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 3.05);',
               'tl.set("#f-p4", { opacity: 0 }, 0);', 'tl.to("#f-p3", { opacity: 0, duration: 0.2 }, 5.2);',
               'tl.fromTo("#f-p4", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 5.25);',
               'tl.fromTo("#f-p4", { y: 0 }, { y: -700, duration: 1.7, ease: "power2.inOut" }, 5.4);']
    js.append(f'tl.to("#{i}-cena", {{ opacity: 0, duration: 0.18, ease: "power2.in" }}, {round(c["dur"] - 0.18, 2)});')
    css = CSS + (CSS_CLASSICO if modo == "classico" else "")
    corpo = "\n    ".join(js)
    miolo = "\n    ".join(camadas)
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


def fecho_html(modo):
    """A frase que dói e a chamada (a mesma do vídeo completo, com a logo)."""
    fx = open(os.path.join(AQUI, "../astro-completo/compositions/fecho.html")).read()
    a = fx.index('    <div id="e-celular"')
    b = fx.index('    <h1 id="e-frase"')
    if modo == "3d":
        fundo = ('''    <div id="e-chaves" style="position: absolute; inset: -40px; background-size: cover; background-position: center; background-image: url('assets/cenas/c14-chaves.png')"></div>
    <div id="e-escuro" style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,11,24,0.88) 0%, rgba(5,11,24,0.55) 55%, rgba(5,11,24,0.2) 100%)"></div>
''')
        anima = ('tl.fromTo("#e-chaves", { scale: 1.12, filter: "blur(10px)" }, { scale: 1.03, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, 0);\n'
                 '    tl.to("#e-chaves", { scale: 1.09, duration: 3.6, ease: "none" }, 0.5);\n'
                 '    tl.to("#e-chaves", { opacity: 0, filter: "blur(12px)", duration: 0.45, ease: "power2.in" }, 4.0);\n'
                 '    tl.to("#e-escuro", { opacity: 0, duration: 0.45 }, 4.0);')
    else:
        fundo = '''    <div id="e-relogio" style="position: absolute; left: 0; right: 0; top: 1180px; text-align: center; font: 700 220px 'Figtree', sans-serif; color: #e0484d">00:07</div>
'''
        anima = ('tl.fromTo("#e-relogio", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, 0.3);\n'
                 '    tl.to("#e-relogio", { opacity: 0, filter: "blur(10px)", duration: 0.3 }, 4.0);')
    fx = fx[:a] + fundo + fx[b:]
    palavras = ["Enquanto", "você", "assiste", "isso,", "alguém", "já", "respondeu", "o", "seu", "cliente."]
    frase = "".join(f'<span class="p e-w{" r" if w == "respondeu" else ""}">{w}</span>' for w in palavras)
    i0 = fx.index('<h1 id="e-frase"')
    i1 = fx.index("</h1>", i0) + 5
    fx = fx[:i0] + f'<h1 id="e-frase" class="titulo clip" data-start="0.2" data-duration="4.1">{frase}</h1>' + fx[i1:]
    fx = fx.replace('data-start="6.4" data-duration="5.4"', f'data-start="4.2" data-duration="{FECHO_DUR - 4.2}"')
    fx = fx.replace("    #e-frase {\n      font-size: 100px;\n    }", "    #e-frase {\n      font-size: 112px;\n    }\n    .titulo .r {\n      background: #e0484d;\n      padding: 0 0.12em;\n    }")
    # o roteiro do fecho: as falas mudaram de lugar, então os tempos também
    s0 = fx.index("<script>")
    script = fx[s0:]
    linhas = []
    for ln in script.split("\n"):
        if "#e-celular" in ln:
            continue
        if "tl.set(\".e-w.d\"" in ln:
            continue
        if ln.strip().startswith("tl.") and ln.rstrip().endswith(");"):
            corpo, t = ln.rstrip()[:-2].rsplit(",", 1)
            t = float(t)
            if t >= 6.2:
                t = round(t - 2.1, 2)
            elif ".e-w" in ln:
                t = 0.3
            ln = f"{corpo}, {t});"
        linhas.append(ln)
    script = "\n".join(linhas).replace('tl.fromTo(".e-w", { opacity: 0, color: "#4a5a78" }, { opacity: 1, color: "#f5f7fb", duration: 0.18, stagger: 0.07',
                                       'tl.fromTo(".e-w", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.24, stagger: 0.25, ease: "back.out(2)"')
    script = script.replace("const tl = gsap.timeline({ paused: true });", "const tl = gsap.timeline({ paused: true });\n    " + anima)
    return fx[:s0] + script


def gerar(modo, pasta):
    os.makedirs(os.path.join(pasta, "compositions"), exist_ok=True)
    for c in CENAS:
        open(os.path.join(pasta, f"compositions/{c['id']}.html"), "w").write(cena_html(c, modo))
    open(os.path.join(pasta, "compositions/fecho.html"), "w").write(fecho_html(modo))

    cenas = [(c["id"], c["ini"], c["dur"]) for c in CENAS] + [("fecho", FECHO_INI, FECHO_DUR)]
    hosts = "\n".join(
        f'''      <div id="{n}" data-composition-id="{n}" data-composition-src="compositions/{n}.html"
        data-start="{a}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>'''
        for n, a, d in cenas)
    falas = {"p01": 0.3, "p02": 4.6, "p03": 13.6, "p04": 19.9, "p05": 30.9, "p06": 39.2, "p07": FECHO_INI + 0.2}
    v = lambda k: os.path.join(AQUI, f"assets/voice/{k}.wav")
    aud = [f'      <audio id="voz-{k}" src="assets/voice/{k}.wav" data-start="{t}" data-duration="{dur(v(k)):.2f}" data-volume="1" data-track-index="2"></audio>' for k, t in falas.items()]
    trilha = os.path.join(pasta, "assets/bgm/trilha-dores.wav")
    if not os.path.exists(trilha):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(pasta, "assets/bgm/trilha.wav"), "-t", str(TOTAL),
                        "-af", f"afade=t=out:st={TOTAL - 2.5}:d=2.5", trilha], check=True)
    aud.append(f'      <audio id="trilha" src="assets/bgm/trilha-dores.wav" data-start="0" data-duration="{TOTAL}" data-volume="0.2" data-track-index="3"></audio>')
    fx = [("click-soft", t, 0.5) for t in (0.55, 0.85, 1.3)] + [("impact-bass-1", 1.6, 0.7), ("click-soft", 2.15, 0.5), ("pop", 2.4, 0.6)]
    for c in CENAS[1:]:
        fx.append(("whoosh", round(c["ini"] - 0.25, 2), 0.45))
    for c in CENAS:
        for k, f in enumerate(c["fundos"]):
            if k and f[2] == "com" and c["fundos"][k - 1][2] == "sem":
                fx.append(("whoosh-short", round(c["ini"] + f[1] - 0.1, 2), 0.6))
        for (html, t, tipo, t1) in c["el"]:
            som = {"pop": "pop", "desce": "chime", "sobe": "whoosh-short"}[tipo]
            if 'class="sep ruim"' in html:
                som = "click"
            if "cadastrado na sua carteira" in html or 'class="sep bom"' in html:
                som = "chime"
            fx.append((som, round(c["ini"] + t, 2), 0.5))
    d = CENAS[3]["ini"]
    fx += [("pop", d + 5.0, 0.5), ("pop", d + 6.3, 0.5), ("chime", d + 7.65, 0.55)]
    fx += [("whoosh", FECHO_INI - 0.25, 0.45), ("impact-bass-1", FECHO_INI + 4.35, 0.6), ("click-soft", FECHO_INI + 4.9, 0.6),
           ("click-soft", FECHO_INI + 5.13, 0.6), ("pop", FECHO_INI + 5.36, 0.7), ("whoosh-short", FECHO_INI + 5.75, 0.5)]
    for k, (f, t, vol) in enumerate(sorted(fx, key=lambda x: x[1])):
        dd = min(dur(os.path.join(pasta, f"assets/sfx/{f}.mp3")), TOTAL - t)
        aud.append(f'      <audio id="sfx-{k:02d}" src="assets/sfx/{f}.mp3" data-start="{t}" data-duration="{dd:.2f}" data-volume="{vol}" data-track-index="{4 + k % 4}"></audio>')
    idx = open(os.path.join(AQUI, "../astro-completo/index.html")).read()
    a = idx.index("    <div id=\"root\"")
    b = idx.index("    <script>\n      const tl")
    corpo = f'''    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      <div id="ceu" class="clip" data-start="0" data-duration="{TOTAL}" data-track-index="0"></div>
{hosts}
{chr(10).join(aud)}
    </div>
'''
    open(os.path.join(pasta, "index.html"), "w").write(idx[:a] + corpo + idx[b:])
    print(modo, len(cenas), "cenas,", len(aud), "faixas de áudio,", TOTAL, "s")


if __name__ == "__main__":
    gerar("3d", AQUI)
    gerar("classico", os.path.join(AQUI, "../astro-dores-classico"))
