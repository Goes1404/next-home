---
title: Onde o clique do anúncio se perde
tags: [meta, campanhas, whatsapp, medicao, lgpd]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0159_medicao_do_link_do_anuncio.sql
  - src/lib/whatsapp/medicaoDoLink.ts
  - src/lib/crm/funilDoLink.ts
  - src/lib/whatsapp/repositorio.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/wa/[campanha]/route.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/DoCliqueAConversa.tsx
fonte: docs/MEMORIA.md — Onde o clique do anúncio se perde (0159)
created: 2026-10-05
updated: 2026-10-10
summary: Em 7 dias, 679 cliques de pessoas no link do anúncio do Dom Parque viraram 5 leads, e o banco só sabia o total. A 0159 conta pessoas (resumo diário de IP + navegador) e quem escreveu ao corretor sem a mensagem pronta (o porteiro ignora; fica só a contagem, nunca o texto). O cartão "Do clique à conversa" na tela de Anúncios pagos mostra os degraus lado a lado, com a linha de comparação dos contatos que escrevem sem clique por perto.
---

# Onde o clique do anúncio se perde

Primeiro item do roadmap da nota 10 (área M1, link do anúncio), escolhido
com o usuário em 05/10/2026: medir antes de mexer.

## O que se sabia

- 1.356 acessos ao link do Dom Parque em 7 dias: 643 do robô da Meta
  (prévia do anúncio), ~680 de gente (navegador interno do Instagram e do
  Facebook, quase tudo Android `wv`).
- 5 viraram lead. Não se sabia se o resto não escreveu ou escreveu outra
  coisa e foi ignorado pelo porteiro (0144).

## O que a 0159 mede

- **Pessoas**: `cliques_whatsapp.visitante`, um hash de IP + navegador +
  dia com a chave de serviço como segredo. Muda todo dia: conta, não segue.
  Cliques anteriores a 05/10 não têm, e a tela diz "contadas desde 05/10".
- **Escreveram outra coisa**: `porteiro_barrados`, uma linha por número
  desconhecido, por corretor, por dia: resumo do número, tipo, minutos desde
  o último clique de pessoa (até 60) e se citou o imóvel daquele clique. O
  texto é lido no webhook e descartado.
- Conta como "de quem clicou" a mensagem até 15 min depois (a janela da
  0143). O número é pessoal: conhecido que escreve nesse intervalo também
  entra. A tela mostra quantos desconhecidos escrevem por dia SEM clique
  perto, para separar o sinal do ruído.

## Armadilhas

- **O MCP do Supabase cancela migration com `drop policy`**, mesmo
  `if exists` numa tabela nova. O arquivo do repositório mantém o `drop`
  (idempotente); no banco foi aplicada sem ele, em duas partes
  (`0159a`, `0159b`).
- **O link grava `visitante` no insert**: sem a coluna, o insert falharia e
  o clique pago se perderia. Por isso a migration vai ANTES do deploy.
- Guarda: `medicaoDoLink.test.ts` lê o código e reprova se o upsert de
  `porteiro_barrados` passar a levar texto ou telefone cru.
- Retenção: 90 dias, apagada pela limpeza diária de `limpar-artes-ia`.

## Próximo passo

Com uma semana de dado, decidir: página intermediária com botão grande (e
formulário em que a IA chama, decisão do usuário) e/ou aceitar a mensagem
que cita o imóvel.

## Relacionadas

- [[clique-de-pessoa-pelo-sec-fetch]] — desde a 0174 o clique do site só conta como pessoa com Sec-Fetch de toque
- [[clique-no-link-cadastra-quem-escreve]]
- [[lead-do-link-do-anuncio-cai-na-campanha-do-imovel]]
- [[link-de-anuncio-e-rodizio-aleatorio]]
