"""Gera os anúncios de venda (corretor autônomo, fecho "Chama a gente no WhatsApp").

    python3 gerar.py [conta|motivos|demo ...]

Cada anúncio sai em três estilos, em pastas irmãs:
    ../astro-vendas-<id>/            animação de cinema (imagens já geradas)
    ../astro-vendas-<id>-classico/   céu da Astro e celular
    ../astro-vendas-<id>-3d/         bonecos 3D em código (mundo-vendas.js)

Reaproveita o gerador da lista (../astro-lista/gerar.py) como base: cenas,
bolhas, títulos e áudio. Preço real: Autônomo Essencial, R$ 97 por mês
(src/lib/plataforma/tiposDeConta.ts, PRECO_ESSENCIAL). A comissão de
R$ 5.000 é exemplo e aparece marcada assim na tela.
"""
import importlib.util
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("base_lista", os.path.join(AQUI, "../astro-lista/gerar.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.AQUI = AQUI
base.MUNDO = "mundo-vendas.js"
base.CSS_AUDIOS += """    .contador { left: 110px; right: 110px; padding: 24px 0 34px; border-radius: 48px; background: rgba(5, 11, 24, 0.72); font-size: 170px; }
"""
bolha, central, audio, sep, hora, SIM = base.bolha, base.central, base.audio, base.sep, base.hora, base.SIM


def contador(i, valor, legenda, top=820):
    return f'<div id="{i}" class="contador" style="top: {top}px">{valor}<small>{legenda}</small></div>'


def feito(i, txt, top):
    return f'<div id="{i}" class="feito" style="top: {top}px">{txt}</div>'


VIDEOS = {
    "conta": dict(
        falas={"c1": 0.2, "c2": 3.1, "c3": 8.2, "c4": 15.8, "c5": 21.6, "c6": 25.85},
        fecho=(25.6, 7.2, ["Chama", "a", "gente", "no", "WhatsApp."]),
        gancho=[("click-soft", 0.45, 0.6), ("click-soft", 0.75, 0.6), ("impact-bass-1", 1.1, 0.8), ("click-soft", 1.5, 0.6), ("click-soft", 1.7, 0.6)],
        fala3d=[], ondas=[], cafe=8.2 + 6.0,
        cenas=[
            dict(id="a", ini=0.0, dur=2.9, img="d01-gancho.png", pan=(0, -30), sem_fone=True, destaque="perder",
                 titulos=[], slam=[("Quanto", 0.45), ("custa", 0.75), ("perder", 1.1), ("um", 1.5), ("cliente?", 1.7)], el=[],
                 js=['tl.to("#a-g2", { backgroundColor: "#e0484d", duration: 0.05 }, 1.1);']),
            dict(id="b", ini=2.9, dur=5.1, img="d03-cafe.png", pan=(-10, -25), sem_fone=True,
                 titulos=[("b-t", "Uma comissão", "que esfriou.", 0.3, None, "r")],
                 el=[(contador("b-n", "R$ 5.000", "comissão de exemplo", 900), 0.6, "pop", None),
                     (sep("b-s", "⏰ você respondeu tarde", 1300, "ruim"), 2.8, "pop", None)],
                 js=['tl.to("#b-n", { color: "#e0484d", textDecoration: "line-through", duration: 0.2 }, 2.6);',
                     'tl.fromTo("#b-n", { x: 0 }, { x: 14, duration: 0.05, yoyo: true, repeat: 5, ease: "none" }, 2.6);']),
            dict(id="c", ini=8.0, dur=7.6, img="c01-cozinha.png", pan=(0, -30), sem_fone=True,
                 titulos=[("c-t", "Astro:", "R$ 97 por mês.", 0.3, None, "d")],
                 el=[(contador("c-n", "R$ 3,23", "por dia", 900), 3.5, "pop", None),
                     (sep("c-s", "☕ menos que um café", 1300, "bom"), 6.0, "pop", None)]),
            dict(id="d", ini=15.6, dur=5.8, img="c06-lista.png", pan=(-10, -25), sem_fone=True,
                 titulos=[("d-t", "E ainda", "trabalha por você.", 0.3, None, "d")],
                 el=[(feito("d-f1", "✨ Atende o cliente na hora", 980), 0.5, "pop", None),
                     (feito("d-f2", "🔁 Faz o follow-up sozinha", 1120), 1.7, "pop", None),
                     (feito("d-f3", "📲 Organiza os leads pelo WhatsApp", 1260), 3.3, "pop", None)]),
            dict(id="e", ini=21.4, dur=4.2, img="c12-roleta.png", pan=(10, -25), sem_fone=True,
                 titulos=[("e-t", "Uma comissão", "paga 4 anos.", 0.3, None, "d")],
                 el=[(contador("e-n", "51 meses", "R$ 5.000 ÷ R$ 97 · exemplo", 900), 1.0, "pop", None)]),
        ]),
    "motivos": dict(
        falas={"m1": 0.2, "m2": 4.4, "m3": 9.2, "m4": 14.1, "m5": 18.85},
        fecho=(18.6, 7.2, ["R$", "97", "por", "mês."]),
        gancho=[("impact-bass-1", 0.45, 0.8), ("click-soft", 0.8, 0.6)],
        fala3d=[[9.4, 11.8]], ondas=[9.7], cafe=None,
        cenas=[
            dict(id="a", ini=0.0, dur=4.2, img="c02-audio.png", pan=(15, -25), sem_fone=True, destaque="3",
                 titulos=[], slam=[("3", 0.45), ("motivos", 0.8)], el=[(sep("a-s", "para você, corretor, usar a Astro", 1300), 1.6, "pop", None)]),
            dict(id="b", ini=4.2, dur=4.8, img="c07-noite.png", pan=(0, -30),
                 titulos=[("b-t", "1. A IA responde", "na hora.", 0.3, None, "d")],
                 el=[(hora("b-h", "23:12"), 0.2, "pop", None),
                     (bolha("b-b1", "ele", "Oi! O apê de Barueri ainda tem?", 1000), 0.6, "pop", None),
                     (bolha("b-b2", "ia", '<span class="rotulo">✨ IA da Astro · agora</span>Tem sim, Carla! Você procura 2 quartos? Vai financiar?', 1170), 1.6, "pop", None)]),
            dict(id="c", ini=9.0, dur=4.9, img="c03-cartao.png", pan=(-15, -25),
                 titulos=[("c-t", "2. O CRM", "por áudio.", 0.3, None, "d")],
                 el=[(audio("c-b1", "cadastra o Marcos e marca visita sábado às dez", 960, "0:04"), 0.5, "pop", None),
                     (bolha("c-b2", "ele", central("Vou fazer isto:<br>1) Cadastrar Marcos Lima<br>2) Marcar visita com Marcos Lima, sábado 21/11 às 10h<br><br>" + SIM), 1220), 1.8, "pop", None)]),
            dict(id="d", ini=13.9, dur=4.7, img="c07b-followup.png", pan=(-10, -25),
                 titulos=[("d-t", "3. O follow-up", "chama sozinho.", 0.3, None, "d")],
                 el=[(sep("d-s", "24 horas depois", 980), 0.6, "pop", None),
                     (bolha("d-b1", "ia", '<span class="rotulo">✨ IA da Astro · agora</span>Oi, Carla! Conseguiu falar com seu marido? Posso te mandar a planta?', 1070), 1.0, "pop", None),
                     (bolha("d-b2", "ele", "Pode mandar! 😊", 1330), 3.0, "pop", None)]),
        ]),
    "demo": dict(
        falas={"d1": 0.2, "d2": 1.8, "d3": 3.4, "d4": 10.85},
        fecho=(10.6, 6.8, ["Chama", "no", "WhatsApp."]),
        gancho=[("whoosh", 0.3, 0.6), ("impact-bass-1", 0.55, 0.7)],
        fala3d=[[1.6, 3.6]], ondas=[1.9], cafe=None,
        cenas=[
            dict(id="a", ini=0.0, dur=1.6, img="c11-lembrete.png", pan=(15, -25), sem_fone=True, destaque="isso.",
                 titulos=[], slam=[("Olha", 0.3), ("isso.", 0.55)], el=[]),
            dict(id="b", ini=1.6, dur=9.0, img="c02-audio.png", pan=(15, -25),
                 titulos=[("b-t", "Um áudio", "só.", 0.3, 5.0, "d"), ("b-t2", "Pronto.", "Está na agenda.", 5.15, None, "d")],
                 el=[(audio("b-b1", "cadastra o Marcos Lima, 11 99123-4567, e marca visita sábado às dez", 930), 0.4, "pop", None),
                     (bolha("b-b2", "ele", central("Vou fazer isto:<br>1) Cadastrar Marcos Lima, (11) 99123-4567<br>2) Marcar visita com Marcos Lima, sábado 21/11 às 10h<br><br>" + SIM), 1180), 2.1, "pop", None),
                     (bolha("b-b3", "eu", "sim", 1560), 3.2, "pop", None),
                     (bolha("b-b4", "ele", central("Marcos Lima cadastrado na sua carteira.<br>Visita com Marcos Lima marcada para sábado 21/11 às 10h. Já está na Agenda."), 1660), 4.9, "pop", None)],
                 js=['tl.to(["#b-b1", "#b-b2"], { y: -330, duration: 0.4, ease: "power2.inOut" }, 4.6);', 'tl.to("#b-b3", { y: -230, duration: 0.4, ease: "power2.inOut" }, 4.75);']),
        ]),
}

CTA = '<span class="c" id="ec1">Teste</span><span class="c" id="ec2">grátis</span><br /><span class="c d" id="ec3">por 7 dias</span>'


def fecho_whatsapp(frase):
    def fecho(modo):
        html = base_fecho(modo)
        palavras = "".join(f'<span class="p e-w{" d" if k == len(frase) - 1 else ""}">{w}</span>' for k, w in enumerate(frase))
        i0 = html.index('<h1 id="e-frase"')
        i1 = html.index("</h1>", i0)
        html = html[:i0] + html[i0:html.index(">", i0) + 1] + palavras + html[i1:]
        html = html.replace("Começar agora →", "💬 Chamar no WhatsApp")
        html = html.replace("👆 link na bio", "toque no botão e fale com a gente")
        html = html.replace("#e-cta .botao {\n      min-height: 128px;", "#e-cta .botao {\n      min-height: 128px;\n      background: #1f9d6b !important;\n      color: #ffffff !important;")
        return html
    return fecho


base_fecho = base.fecho


def gerar(vid):
    v = VIDEOS[vid]
    ini, duracao, frase = v["fecho"]
    base.CENAS = v["cenas"]
    base.FALAS = v["falas"]
    base.FECHO_INI, base.FECHO_DUR = ini, duracao
    base.TOTAL = round(ini + duracao, 2)
    base.FX_GANCHO = v["gancho"]
    base.fecho = fecho_whatsapp(frase)
    for modo, suf, nome in (("filme", "", "animação de cinema"), ("classico", "-classico", "clássico"), ("3d", "-3d", "bonecos 3D em código")):
        pasta = os.path.join(AQUI, f"../astro-vendas-{vid}{suf}")
        os.makedirs(pasta, exist_ok=True)
        json.dump({"id": f"astro-vendas-{vid}{suf}", "name": f"Astro: anúncio \"{vid}\" ({nome})", "createdAt": "2026-11-17T17:00:00.000Z"},
                  open(os.path.join(pasta, "meta.json"), "w"), ensure_ascii=False)
        base.gerar(modo, pasta)
        if modo == "3d":
            cfg = {"cenas": {c["id"]: [c["ini"], c["ini"] + c["dur"]] for c in v["cenas"]} | {"fecho": [ini, 999]},
                   "sem": ["a", "b"] if vid == "conta" else [], "fala": v["fala3d"], "ondas": v["ondas"], "cafe": v["cafe"]}
            idx = open(os.path.join(pasta, "index.html")).read()
            idx = idx.replace('    <script src="assets/mundo.js"></script>', f'    <script>window.__CFG = {json.dumps(cfg)};</script>\n    <script src="assets/mundo.js"></script>')
            open(os.path.join(pasta, "index.html"), "w").write(idx)


if __name__ == "__main__":
    for vid in sys.argv[1:] or list(VIDEOS):
        gerar(vid)
