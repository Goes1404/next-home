"""Gera compositions/cidade.html: o fundo com prédios sendo construídos (0 a 84,4 s).
Desenho determinístico (semente fixa), em SVG, atrás das cenas."""
import random
random.seed(7)
W, H = 1080, 1920
predios = []
x = -20
while x < W:
    w = random.choice([110, 130, 150, 170])
    meio = 180 < x < 820
    h = random.randint(260, 520) if meio else random.randint(520, 980)
    predios.append((x, w, h)); x += w + random.choice([6, 10, 14])
def andar(h): return 46
svg, js = [], []
for i, (x, w, h) in enumerate(predios):
    topo = H - h
    andares = h // 46
    inicio = round(0.6 + i * 3.2 + random.uniform(0, 1.5), 2)
    subida = round(min(14, max(6, h / 70)), 2)
    fachada = round(inicio + 4.5, 2)
    svg.append(f'''  <clipPath id="cl-e{i}"><rect id="ce{i}" x="{x}" y="{H}" width="{w}" height="0" /></clipPath>
  <clipPath id="cl-f{i}"><rect id="cf{i}" x="{x}" y="{H}" width="{w}" height="0" /></clipPath>''')
    # estrutura (andaime): contorno e lajes
    lajes = "".join(f'<line x1="{x}" y1="{H - k * 46}" x2="{x + w}" y2="{H - k * 46}" />' for k in range(1, andares + 1))
    colunas = "".join(f'<line x1="{x + c}" y1="{topo}" x2="{x + c}" y2="{H}" />' for c in range(0, w + 1, w // 3))
    diag = "".join(f'<line x1="{x}" y1="{H - k * 46}" x2="{x + w // 3}" y2="{H - (k + 1) * 46}" />' for k in range(0, andares, 2))
    svg.append(f'  <g class="estrutura" clip-path="url(#cl-e{i})">{lajes}{colunas}{diag}</g>')
    # fachada e janelas
    jan = []
    for k in range(andares - 1):
        for c in range(10, w - 22, 26):
            jan.append(f'<rect class="j j{i}" x="{x + c}" y="{H - (k + 1) * 46 + 14}" width="14" height="20" />')
    svg.append(f'  <g clip-path="url(#cl-f{i})"><rect class="fachada" x="{x}" y="{topo}" width="{w}" height="{h}" />{"".join(jan)}</g>')
    js.append(f'    tl.to("#ce{i}", {{ attr: {{ y: {topo}, height: {h} }}, duration: {subida}, ease: "steps({andares})" }}, {inicio});')
    js.append(f'    tl.to("#cf{i}", {{ attr: {{ y: {topo}, height: {h} }}, duration: {subida}, ease: "steps({andares})" }}, {fachada});')
    if i % 3 == 1:  # guindaste no alto do prédio
        cx = x + w // 2
        svg.append(f'''  <g id="gd{i}" class="guindaste">
    <line x1="{cx}" y1="{topo}" x2="{cx}" y2="{topo - 150}" />
    <g id="gb{i}"><line x1="{cx - 60}" y1="{topo - 150}" x2="{cx + 170}" y2="{topo - 150}" /><line x1="{cx + 140}" y1="{topo - 150}" x2="{cx + 140}" y2="{topo - 90}" /></g>
  </g>''')
        js.append(f'    tl.fromTo("#gd{i}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.6 }}, {round(inicio + subida - 0.5, 2)});')
        js.append(f'    tl.fromTo("#gb{i}", {{ rotation: -6, svgOrigin: "{cx} {topo - 150}" }}, {{ rotation: 6, svgOrigin: "{cx} {topo - 150}", duration: 4, ease: "sine.inOut", yoyo: true, repeat: 7 }}, {round(inicio + subida, 2)});')
        js.append(f'    tl.to("#gd{i}", {{ opacity: 0, duration: 0.8 }}, 78.4);')
html = f'''<template>
  <style>
    #root {{
      position: absolute;
      inset: 0;
    }}
    #cidade {{
      position: absolute;
      left: 0;
      top: 0;
      width: {W}px;
      height: {H}px;
    }}
    .estrutura line {{
      stroke: #4d84e0;
      stroke-opacity: 0.5;
      stroke-width: 2;
    }}
    .fachada {{
      fill: #0d2147;
    }}
    .j {{
      fill: #ffd98a;
      opacity: 0;
    }}
    .guindaste line {{
      stroke: #7fa6ec;
      stroke-opacity: 0.55;
      stroke-width: 4;
      stroke-linecap: round;
    }}
    #brilho {{
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 700px;
      background: linear-gradient(180deg, rgba(6, 10, 22, 0) 0%, rgba(77, 132, 224, 0.18) 100%);
      opacity: 0;
    }}
  </style>
  <div id="root" data-composition-id="cidade" data-width="{W}" data-height="{H}">
    <div id="brilho"></div>
    <svg id="cidade" viewBox="0 0 {W} {H}" aria-hidden="true">
{chr(10).join(svg)}
    </svg>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
    // a cidade fica pronta: as janelas acendem e o céu ganha brilho
    tl.to(".j", {{ opacity: 0.85, duration: 0.25, stagger: {{ each: 0.012, from: "random" }} }}, 78.9);
    tl.to("#brilho", {{ opacity: 1, duration: 3, ease: "power2.out" }}, 79.4);
    window.__timelines["cidade"] = tl;
  </script>
</template>
'''
open("compositions/cidade.html", "w").write(html)
print(len(predios), "prédios")
