"""Gera compositions/central.html: a conversa com o número central (0 a 35,9 s).
Textos das propostas iguais aos do código (src/lib/central); nomes e números fictícios."""
import math, re
base = open("../crm-no-whatsapp/compositions/central.html").read()
css = base[base.index("  <style>"):base.index("  </style>") + len("  </style>")]
cab = base[base.index('        <div class="z-cab">'):base.index('        <div class="status claro">')]
SIM = "Responda <b>sim</b> para confirmar ou <b>não</b> para cancelar."
FOTO = '<div class="z-foto"><b>Roberto Lima</b><i>Engenheiro civil</i><p>(11) 98765-4321</p></div>'
msgs = [  # id, quem, html, tempo
 ("m1", "eu", "marca visita com a Carla sábado às 10h", 3.3),
 ("m2", "ele", "Vou fazer isto:<br>Marcar visita com Carla Mendes, sábado 21/11 às 10h<br><br>" + SIM, 5.6),
 ("m3", "eu", "sim", 8.6),
 ("m4", "ele", "Visita com Carla Mendes marcada para sábado 21/11 às 10h. Já está na Agenda.", 9.4),
 ("m5", "eu", FOTO, 12.3),
 ("m6", "ele", "Vou fazer isto:<br>Cadastrar Roberto Lima, (11) 98765-4321<br><br>" + SIM, 13.1),
 ("m7", "eu", "sim", 14.6),
 ("m8", "ele", "Roberto Lima cadastrado na sua carteira.", 15.1),
 ("m9", "eu", "quem eu ligo hoje?", 17.4),
 ("m10", "ele", "Hoje você tem:<br>📅 Visita às 10h com a Carla Mendes<br>🔥 Mais quentes: Roberto Lima (92) e Paula Reis (88)<br>⏳ Sem resposta há 2 dias: Bruno Alves", 18.6),
 ("m11", "eu", "manda as fotos e a planta do Vitra pra Carla", 24.3),
 ("m12", "ele", "Vou fazer isto:<br>Mandar a Carla Mendes, pelo seu WhatsApp, as fotos e a planta do Vitra<br><br>" + SIM, 25.2),
 ("m13", "eu", "e cria um vídeo do Vitra pro Instagram", 27.4),
 ("m14", "ele", "Vou fazer isto:<br>Criar um vídeo vertical do Vitra com as fotos do cadastro. Fica pronto em alguns minutos e eu te mando aqui.<br><br>" + SIM, 28.2),
 ("m15", "eu", "manda o Vitra pra quem quer Barueri até 600 mil", 31.0),
 ("m16", "ele", "Vou fazer isto:<br>Lista de transmissão pelo SEU WhatsApp.<br>Filtros: Barueri, até R$ 600 mil.<br>23 pessoas; 9 nunca falaram com você.<br>Hoje devem sair cerca de 18; o resto fica na fila, no ritmo seguro do número.<br><br>" + SIM, 31.9),
]
def altura(h):
    if "z-foto" in h: return 284
    txt = re.sub(r"<(?!br)[^>]+>", "", h)
    linhas = sum(max(1, math.ceil(len(seg) / 33)) for seg in txt.split("<br>"))
    return linhas * 39 + 42
tops, y = {}, 0
for i, q, h, t in msgs:
    tops[i] = y; y += altura(h) + 16
JANELA = 600
rolagem, atual = [], 0
for i, q, h, t in msgs:
    fundo = tops[i] + altura(h)
    alvo = -tops[i] + 10 if altura(h) > JANELA - 40 else min(atual, JANELA - fundo)
    alvo = min(0, alvo)
    if alvo < atual:
        rolagem.append((round(t - 0.35, 2), alvo)); atual = alvo
bolhas = "\n".join(f'            <div id="z-{i}" class="z-b z-{q}" style="top: {tops[i]}px">{h}</div>' for i, q, h, t in msgs)
entra = "\n".join(f'    entra("#z-{i}", {t}, "{"right bottom" if q == "eu" else "left top"}");' for i, q, h, t in msgs)
rr = "\n".join(f'    tl.to("#z-lista", {{ y: {a}, duration: 0.4, ease: "power3.inOut" }}, {t});' for t, a in rolagem)
def titulo(i, a, b):
    pa = "".join(f'<span class="p {i}-w">{w}</span>' for w in a.split())
    ws = b.split()
    pb = "".join(f'<span class="p {i}-w">{w}</span>' for w in ws[:-1]) + f'<span class="p {i}-w d">{ws[-1]}</span>'
    return f'    <h1 id="{i}" class="titulo">{pa}<br />{pb}</h1>'
titulos = [("t2", "Ele propõe.", "Você diz sim.", 5.0, 11.9), ("t3", "Foto do cartão?", "Virou lead.", 12.1, 17.1),
           ("t4", "Quem eu ligo hoje?", "Ele responde.", 17.3, 24.0), ("t5", "Material e vídeo", "pelo WhatsApp.", 24.2, 30.8),
           ("t6", "Pede a lista.", "Ele protege.", 31.0, None)]
th = "\n".join(titulo(*x[:3]) for x in titulos)
tt = []
for i, a, b, t0, t1 in titulos:
    tt.append(f'    tl.fromTo(".{i}-w", {{ opacity: 0, scale: 1.5, filter: "blur(6px)" }}, {{ opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.32, stagger: 0.07, ease: "back.out(2.2)" }}, {t0});')
    if t1: tt.append(f'    tl.to("#{i}", {{ opacity: 0, filter: "blur(8px)", duration: 0.16, ease: "power2.in" }}, {t1});')
gancho = [("Um", 0.0), ("CRM", 0.0), ("que", 0.47), ("trabalha", 0.47), ("por", 0.93), ("você", 0.93), ("no", 1.4), ("seu", 1.4), ("WhatsApp", 1.86)]
gp = "".join(f'<span class="g{" d" if w == "WhatsApp" else ""}" id="zg{k}">{w}</span>' for k, (w, t) in enumerate(gancho))
gt = "\n".join(f'    tl.fromTo("#zg{k}", {{ opacity: 0, scale: 1.8 }}, {{ opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.4)" }}, {t});' for k, (w, t) in enumerate(gancho) if t > 0)
digitando = [(4.95, 5.55), (18.0, 18.55)]
dg = "\n".join(f'    tl.set("#z-digitando", {{ top: {tops[nxt] }, opacity: 1 }}, {a});\n    tl.set("#z-digitando", {{ opacity: 0 }}, {b});' for (a, b), nxt in zip(digitando, ["m2", "m10"]))
zoom = [(9.4, 11.3), (15.1, 16.6), (18.6, 23.4)]
zz = "\n".join(f'    tl.to("#z-celular", {{ scale: 1.07, y: -40, transformOrigin: "50% 30%", duration: 0.35, ease: "power3.out" }}, {a});\n    tl.to("#z-celular", {{ scale: 1, y: 0, duration: 0.35, ease: "power2.inOut" }}, {b});' for a, b in zoom)
html = f'''<template>
  <link rel="stylesheet" href="assets/celular.css" />
{css}
  <div id="root" data-composition-id="central" data-width="1080" data-height="1920">
    <div id="z-gancho">{gp}</div>
{th}

    <div id="z-celular" class="celular">
      <div id="z-tela" class="tela">
{cab}        <div class="status claro"><span>8:12</span><span class="icones"><i></i></span></div>
        <div class="camera-frontal"></div>
        <div id="z-janela">
          <div id="z-lista" style="height: {y + 400}px">
{bolhas}
            <div id="z-digitando" class="z-b z-ele"><i></i><i></i><i></i></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    const entra = (alvo, t, de) =>
      tl.fromTo(alvo, {{ opacity: 0, scale: 0.6, transformOrigin: de }}, {{ opacity: 1, scale: 1, duration: 0.42, ease: "back.out(2)" }}, t);
    // abertura: as palavras batem no ritmo da música
{gt}
    tl.to("#z-gancho", {{ scale: 0.42, y: -140, duration: 0.42, ease: "power3.inOut" }}, 2.45);
    tl.fromTo("#z-celular", {{ y: 1400 }}, {{ y: 0, duration: 0.55, ease: "power3.out" }}, 2.7);
    tl.to("#z-gancho", {{ opacity: 0, filter: "blur(8px)", duration: 0.16, ease: "power2.in" }}, 4.85);
    tl.set("#z-digitando", {{ opacity: 0 }}, 0);
{chr(10).join(tt)}
{dg}
{entra}
{rr}
{zz}
    tl.to("#z-tela", {{ x: -760, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }}, 35.6);
    tl.to("#t6", {{ opacity: 0, filter: "blur(8px)", duration: 0.2, ease: "power2.in" }}, 35.6);
    window.__timelines["central"] = tl;
  </script>
</template>
'''
open("compositions/central.html", "w").write(html)
print("lista", y, "rolagens", rolagem)
