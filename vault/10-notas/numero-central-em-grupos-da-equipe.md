---
title: Número central em grupos da equipe
aliases: [central no grupo, "@central", respostaSoNoPrivado, tratarMensagemDoGrupoNoCentral, Te mandei no privado]
tags: [whatsapp, crm, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/grupo.ts
  - src/lib/central/conversa.ts
  - src/lib/central/webhook.ts
  - src/lib/crm/retornoPeloGrupo/identificar.ts
fonte: fase 2b do número central, Frente K (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: Com onda >= 2, o central responde em grupo de WhatsApp só quando mencionado (mentionedJid com o número ou o @lid dele, ou resposta a uma mensagem dele) e só se TODO participante for corretor ativo de UMA imobiliária com o recurso ligado; grupo com gente de fora = silêncio + tentativa "grupo". Dado de cliente, relatório e proposta vão no privado de quem pediu e o grupo ouve só "Te mandei no privado"; a regra mora em respostaSoNoPrivado (pela ferramenta que rodou, nunca pelo texto da IA). Antes da onda 2, grupo segue ignorado.
---
# Número central em grupos da equipe

Spec 4.1 ("o central pode ficar em grupos da equipe e responde quando é
mencionado"). Antes, `lerMensagemDoCentral` descartava todo `@g.us`. O
desvio do `route.ts` já mandava o evento do central para
`tratarWebhookDoCentral` ANTES do descarte de grupo
(`centralInvisivel.test.ts`), então o `route.ts` não mudou.

## O fluxo (`src/lib/central/grupo.ts`, `tratarMensagemDoGrupoNoCentral`)

Do mais barato ao mais caro (mensagem comum de grupo é quase tudo o que
chega, e não pode custar consulta):

1. **Onda < 2** → `ignored: "central_sem_mensagem"`, igual a antes. Nada é lido.
2. Leitor (`lerMensagemDeGrupoNoCentral`, `webhook.ts`): `fromMe`,
   privado, transmissão e status → `null`. Desembrulha mensagem temporária
   (`desembrulhar`, exportada do retorno pelo grupo). Autor por
   `participant`/`participantPn`/`participantAlt`/`senderPn`; menção por
   `contextInfo.mentionedJid` de todo lugar; citação pelo
   `contextInfo.participant` com `stanzaId`/`quotedMessage`.
3. Sem nenhuma menção/citação → silêncio, sem ler nada.
4. Participantes da Evolution (`listarParticipantesDoGrupo`) com **cache de
   60 s** por grupo (`participantesComCache`; falha não é guardada). Cliente
   adicionado ao grupo cala o central em até 60 s.
5. O central tem de estar na lista (pelo número do chip); o **`@lid` do
   central** sai desse mesmo participante — é com ele que a menção chega
   nos grupos que usam lid. Menção a outra pessoa não conta.
6. `conferirEquipe`: todo participante (menos o central) casa com um
   corretor **ativo**, com `central_whatsapp_ativo`, por número (com/sem 55
   e 9) ou `whatsapp_lid`, e existe **uma** imobiliária comum a todos.
   Falhou → silêncio + `central_tentativas` com motivo **`grupo`** (já
   permitido pelo CHECK da 0249; sem texto, telefone do autor em hash).
   Duas imobiliárias comuns a todos → silêncio (ambíguo), sem tentativa.
7. Autor (`acharAutor`) entre os corretores daquela imobiliária, também
   pelo par número↔lid da lista de participantes. A imobiliária é a do
   GRUPO, não a escolha guardada no privado.
8. `responderNoGrupo` (`conversa.ts`) e o envio conforme `soNoPrivado`.

Só "@central", sem pedido: o texto da ajuda no grupo, sem IA.

## Onde a resposta aparece — um ponto só

`respostaSoNoPrivado` em `grupo.ts`. No grupo: ajuda, "ainda não sei"
(ferramenta de onda futura), cota, "não ouvi o áudio", recusa de foto/
planilha, `informacao_de_imovel` e `simular_financiamento`
(`FERRAMENTAS_QUE_PODEM_IR_AO_GRUPO`). Todo o resto (proposta, dado de
lead, agenda, relatórios — **inclusive o da equipe**, que a spec permitia
ao gestor no grupo: o corretor não vê os números dos colegas no painel —,
financeiro, documentos, planilha) vai no privado, para o `corretores.whatsapp`
de quem pediu, e o grupo ouve só "Te mandei no privado." (depois do envio;
se o privado falhou, o grupo ouve isso; sem WhatsApp no perfil, "só vai no
privado").

Decide pela **ferramenta que rodou**, anotada pela conversa ao repassar o
`executar` ao cérebro (não pelo relato `chamadas` do cérebro, nem pelo
texto). Ferramenta nova ou desconhecida cai no privado.

## O que muda na conversa em modo grupo

- Sem boas-vindas (ficam para o primeiro "oi" no privado) e sem "trocar de
  imobiliária".
- O "sim"/"não" **não** é lido no grupo: a proposta e a confirmação são no
  privado, no estado por pessoa de sempre. Pedido do grupo sem proposta
  nova não derruba a pendente do privado.
- O cérebro **não recebe o histórico nem a proposta do privado**: senão uma
  resposta sem ferramenta ("e o telefone dele?") repetiria no grupo o que
  foi dito a sós. A troca do grupo entra no histórico da pessoa (o privado
  continua o assunto).

## Pendências

- A spec diz "em grupo com cliente, ele SAI"; aqui ele só cala. Sair é
  decisão do dono (sem o chip na mão, ninguém o põe de volta).
- Se a Evolution não entregar o número dos participantes `@lid` e o corretor
  não tiver `whatsapp_lid` guardado, o grupo parece ter gente de fora e o
  central cala (falha fechada). O central também só se acha na lista pelo
  número do chip.
- Mandar no privado de quem nunca escreveu ao central é o central iniciando
  conversa (risco de bloqueio baixo: é da equipe e pediu no grupo).

Veja [[crm-pelo-whatsapp-numero-central-com-ia]],
[[retorno-da-ligacao-pelo-grupo]] (leitura de grupo e de `@lid` que serviu
de base) e [[avisos-espontaneos-pelo-numero-central]].
