---
title: Quem clicou no link do anúncio é cadastrado, seja qual for a mensagem
tags: [campanhas, meta, whatsapp, banco]
type: decisao
status: superada
custou: baixo
codigo:
  - supabase/migrations/0143_clique_no_link_cadastra_o_lead.sql
  - src/lib/whatsapp/repositorio.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/wa/[campanha]/route.ts
  - src/app/wa/route.ts
created: 2026-10-02
updated: 2026-10-02
summary: O porteiro (0111) só cadastrava número novo cuja primeira fala era a mensagem pronta do link /wa/. Quem apagava o texto e escrevia "oi" era ignorado. Agora o link marca o clique (pelo_porteiro) e o webhook, quando um número sem lead escreve ao corretor sorteado até 15 minutos depois de um clique de pessoa, reivindica o clique e cadastra o lead com a origem e o imóvel do link. Cada clique cadastra uma pessoa.
---

# Clique no link cadastra quem escreve

Decisão do usuário (02/10/2026): "se sabemos que ele entrou por aquele
link, ele tem que ser cadastrado, independente da mensagem".

## Como sabemos

O link `/wa/<imóvel>` (e o `/wa` geral do site) grava cada clique com o
corretor sorteado. A mensagem que chega a ESSE número logo depois, de quem
não tem cadastro, é de quem clicou.

## Travas (o número é o WhatsApp pessoal do corretor)

- Só clique gravado pelo servidor (`pelo_porteiro`). O `anon` ainda grava
  o clique do site, mas por grant de coluna, sem as colunas novas: ninguém
  forja um clique pela chave pública.
- Robô fora: `facebookexternalhit` e afins. Em 02/10, 409 dos 692 acessos
  ao link do Dom Parque eram robôs.
- Janela de 15 minutos; cada clique cadastra uma pessoa (`for update skip
  locked`). Cliques repetidos do mesmo navegador, até 3 minutos do
  escolhido, são gastos junto.
- O clique só é reivindicado depois de o porteiro não achar o lead: quem já
  é cliente não gasta clique.
- Quando chega a mensagem pronta, o clique dela também é gasto, para não
  sobrar uma vaga para o próximo número que escrever.

## O que fica

Contato pessoal que escreve na janela em que há um clique sobrando pode ser
cadastrado. Custo aceito; se acontecer, arquive.

## Etiqueta da Meta

Já era lida desde 27/09 ([[impulsionamento-do-corretor-pela-etiqueta-da-meta]]).
Só aparece em anúncio do tipo Mensagens (botão de WhatsApp), não em anúncio
de link. Até 02/10 nenhum chegou: os `contextInfo` registrados eram de
conversas pessoais.

Ver [[lead-do-link-do-anuncio-cai-na-campanha-do-imovel]].


## DESLIGADA no mesmo dia (02/10/2026)

Os dois únicos cadastros feitos por esta regra eram conhecidos do corretor
("estamos esperando em frente", "já tenho corretora que me atende"), e a IA
respondeu os dois. O número é o WhatsApp pessoal dele: a hora em que alguém
escreve não separa cliente de conhecido, só o texto separa. O cadastro pelo
clique saiu do webhook; o clique continua sendo gasto e ligado ao lead quando
a mensagem pronta chega (atribuição). A 0144 desligou a IA nas duas conversas
e arquivou os dois leads. Guarda: `cliqueDoLink.test.ts`.
