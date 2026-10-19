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
updated: 2026-10-12
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

## A primeira semana medida (05 a 12/10/2026)

- **O anúncio só rodou dois dias** (05 e 06/10: 129 e 57 cliques de pessoa;
  depois, 0 a 3 por dia). Na semana: 160 cliques de pessoa, 118 pessoas,
  87% de dentro do navegador de um app (WebView do Android ou Instagram e
  Facebook declarados) e **nenhum lead do anúncio**.
- **O único lead `meta/ctwa` da semana veio de um botão do SITE.** O botão de
  imóvel do site manda a mesma mensagem pronta do anúncio (decisão de 28/09),
  e `reconhecerMensagemDeAnuncio` carimba `meta/ctwa` e `anuncio_origem` em
  quem chega por ela. Com campanha cadastrada do mesmo imóvel no ar, esse
  lead cairia na campanha paga (`campanhaDoLinkDoAnuncio`). Quem diz a
  verdade é o clique ligado ao lead: `origem = site/<imóvel>`.
- **Quem clica e não manda a mensagem pronta não escreve outra coisa.** Nos
  dois dias de anúncio, 14 de 49 barrados (28,6%) chegaram até 15 minutos
  depois de um clique; nos mesmos barrados deslocados de ±20 a ±120 minutos,
  no mesmo dia, 28,2%. Nenhum citou o imóvel. O "6 de 8 perto do clique" do
  primeiro dia era densidade: com 129 cliques num dia, um quarto do dia fica
  a menos de 15 minutos de algum clique.
- **Os barrados são o tráfego de fundo do WhatsApp pessoal**: 251 em 6,8
  dias, 157 números, de 12 a 22 por dia em cada número, inclusive no fim de
  semana sem anúncio.

Duas armadilhas da medição:

- **O acaso tem de ser medido no mesmo dia.** Deslocar os barrados de ±1 a
  3 dias deu 7% de acaso contra 19% real, porque os pontos deslocados caíam
  em dias sem anúncio e sem cliques.
- **Clique de robô do site anterior à 0174** (`de_pessoa` nulo) cobre o dia
  inteiro: em 09/10, 158 "cliques de pessoa" do site deixaram 27 de 58
  barrados "perto de um clique".

## Próximo passo

A página intermediária com formulário perdeu a premissa de recuperar quem
escreve outra coisa: essa pessoa não aparece nos dados. O que sobra é o
formulário como alternativa ao WhatsApp, a ser testado contra o destino
nativo da Meta (o anúncio que abre o WhatsApp sem passar pelo navegador do
app, já reconhecido pela etiqueta da 0127), que não exige código novo.

## Relacionadas

- [[clique-de-pessoa-pelo-sec-fetch]] — desde a 0174 o clique do site só conta como pessoa com Sec-Fetch de toque
- [[clique-no-link-cadastra-quem-escreve]]
- [[lead-do-link-do-anuncio-cai-na-campanha-do-imovel]]
- [[link-de-anuncio-e-rodizio-aleatorio]]
