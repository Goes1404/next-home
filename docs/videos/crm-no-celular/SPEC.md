# SPEC — "O dia da Ana cabe no celular" (caminho A)

GOAL:    o dono de imobiliária termina pensando "meu corretor faz tudo do celular" e vai ao link da bio.
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps, sem som.
TIME:    29 s x 30 = 870 frames.

LOOK:
- Fundo: o céu da página `/astro`, radial de cima: #1f4a96 0% → #12306a 10% → #0a1a3c 24% → #060a16 45%. Sem estrelas nem partículas.
- Texto: marfim #f5f7fb; apoio #b9c2d4; destaque #7fa6ec, numa palavra por título.
- Títulos: Anton (arquivo em assets/fonts), caixa alta, 104 px, entrelinha 1.02, no máximo 2 linhas, entre y 190 e 470.
- O objeto: um celular de verdade (corpo #0b0f1a, cantos 100 px, sombra 0 40 80 rgba(0,0,0,.45)), em x 150, y 560, 780 x 1560, cortado embaixo.
  A tela mostra o Astro CRM redesenhado do código, a 1,9x do tamanho real, fonte Inter, texto de no mínimo 28 px.
- Cores do CRM na tela: tinta #0d1b33, corpo #3b4a63, tênue #6b7790, linha #d9e0ea, cartão #fff, fundo #eef2f7, acento #2f5ea8.

OBJECTS: celular; aviso na tela bloqueada; conversa do cliente com a IA; funil em colunas; tela "Foto ou print"; cartão de visita de papel; lembrete no WhatsApp; selo da Astro (SVG do código).

MOTION: chegada expo.out 0,5–0,7 s; troca de tela power2.inOut 0,5 s; saída power3.in 0,3 s; toque = ponto de dedo 64 px que afunda 0,15 s.

SHOTS:
1. 0–3,4 s · gancho. Tela bloqueada 8:12 com o aviso "Novo lead · Horizonte Imóveis". "8H12." já na tela; "A ANA NEM CHEGOU NO ESCRITÓRIO" entra palavra por palavra. O dedo toca o aviso e o aviso cresce até virar a tela da conversa.
2. 3,4–9 s · a IA atende. Conversa da Carla: áudio transcrito, a IA pergunta quartos e financiamento, a Carla responde, a IA avisa que a Ana vai chamar. "A IA JÁ ATENDEU. ATÉ O ÁUDIO." Troca de tela com blur.
3. 9–13,6 s · funil. A Carla já está em "Qualificado" (a IA moveu). O dedo toca "Marquei visita" e o cartão vai para "Visita marcada". "A IA QUALIFICA. VOCÊ CONFIRMA." Chicote para a esquerda.
4. 13,6–18,8 s · lead por foto. 11:40, "Adicionar leads → Foto ou print". Toque em "Tirar foto agora", câmera sobre um cartão de papel, flash, "Lendo foto 1 de 1…", o contato aparece. "UM CARTÃO VIROU LEAD."
5. 18,8–22,6 s · lembrete. A tela inunda para o WhatsApp às 17:00: "⏰ Lembrete" com o lead e o link. "17H. O LEMBRETE CHEGA NO WHATSAPP."
6. 22,6–29 s · fecho. O celular recua; frase oficial "O CRM QUE ATENDE SEUS CLIENTES NO WHATSAPP ENQUANTO VOCÊ VENDE." O celular sai, o selo da Astro entra, "ASTRO SOLUÇÕES", botão "Teste grátis por 7 dias", "link na bio". Segura 2,5 s.

BANNED: vazio escuro com coisa pequena flutuando; brilho, neon e partículas; cartões de vidro; três cartões em fila; logo no canto; título que se move depois de pousar; tudo entrando com fade e subida; função ou botão que o CRM não tem.

QA: frame 0 (gancho legível com o aviso); 3,2 s (aviso virando tela); 6 s (conversa legível); 11,5 s (cartão no meio do caminho); 16 s (câmera); 20,5 s (lembrete legível); 24 s (frase); 28 s (fecho).
