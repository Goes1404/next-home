---
title: Clique de pessoa pelo Sec-Fetch
aliases: [ehCliqueDePessoa, de_pessoa, robô disfarçado, Sec-Fetch-User]
tags: [front, whatsapp, armadilha]
type: armadilha
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/medicaoDoLink.ts
  - src/app/wa/route.ts
  - src/app/wa/[campanha]/route.ts
  - src/lib/crm/funilDoLink.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/DoCliqueAConversa.tsx
  - src/app/corretor/(painel)/admin/anuncios/ContaDaMeta.tsx
  - src/lib/corretorSessao.ts
  - supabase/migrations/0174_queda_do_numero_e_clique_de_pessoa.sql
fonte: relatório da primeira semana em produção (10/10/2026)
created: 2026-10-10
updated: 2026-10-10
summary: 'O filtro por navegador contava como pessoa um robô com navegador de computador comum que pediu os 4 botões de WhatsApp de cada um dos 39 imóveis (39 cliques em cada intenção, nenhum lead). Desde a 0174, clique do botão do site só é de pessoa com Sec-Fetch-Site same-origin e Sec-Fetch-User ?1 (ou Referer do próprio site em navegador antigo); no anúncio vale o navegador. O link funciona igual para todos; só a contagem muda.'
---

# Clique de pessoa pelo Sec-Fetch

## O que enganava

Na semana de 03 a 09/10, 71% dos cliques nos botões do site eram robôs
declarados (ClaudeBot 321, GPTBot 158, MJ12bot 158). O filtro por navegador
já os tirava. Das 81 "pessoas" que sobravam, 54 usavam o mesmo navegador de
computador, em 3 versões, e pediram **exatamente 39 vezes cada um dos 4
botões** (tabela, visita, material, saber): os 39 imóveis publicados. Nenhum
virou lead. Para o filtro de navegador, era gente.

Esses cliques também entravam no rodízio e no "clicou e escreveu outra
coisa" do porteiro, inflando a conta de quem escreveu logo depois de um
clique.

## A regra (0174)

`ehCliqueDePessoa` em `medicaoDoLink.ts`:

- robô declarado nunca é pessoa;
- **botão do site**: a navegação tem de sair de uma página nossa por um
  toque. O navegador diz isso nos cabeçalhos: `Sec-Fetch-Site: same-origin`
  e `Sec-Fetch-User: ?1`. Navegador antigo, sem `Sec-Fetch`, vale pelo
  `Referer` do próprio site (com ou sem www);
- **anúncio**: o link é aberto pelo navegador do Instagram/Facebook sem
  página nossa antes; vale o filtro de navegador, como antes.

O resultado vai em `cliques_whatsapp.de_pessoa`. O histórico recebeu a
classificação antiga (só navegador). Contagem, rodízio por imóvel,
`reivindicar_clique_do_link` e a medição do porteiro usam
`de_pessoa ?? navegador`.

## Por que não `robots.txt`

Bloquear `/wa` no `robots.txt` arriscaria o anúncio: o link do anúncio é
`/wa/<imóvel>`, e o robô da Meta precisa abri-lo. Robô disfarçado também não
obedece `robots.txt`. A classificação resolve a contagem sem tocar no
caminho de ninguém.

## Como medir de novo

Agrupar por `user_agent` e por `url_origem` com a intenção trocada por X:
o mesmo navegador com a mesma contagem em todas as intenções é varredura,
não gente.

## Relacionadas
- [[primeira-semana-em-producao]]
- [[onde-o-clique-do-anuncio-se-perde]]
- [[queda-do-numero-pausa-a-lista-e-diz-o-motivo]]
- [[MOC — Evals e Medição]]
