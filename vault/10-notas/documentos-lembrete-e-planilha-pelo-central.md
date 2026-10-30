---
title: Documentos, lembrete e planilha pelo número central
aliases: [documentos_do_lead, lembrete pelo central, importar_planilha, anexar documento pelo WhatsApp]
tags: [crm, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/tratadores/documentos.ts
  - src/lib/central/midia.ts
  - src/lib/central/conversa.ts
  - src/lib/central/webhook.ts
  - src/lib/crm/documentoPeloCentral.ts
  - src/lib/crm/importacaoPeloCentral.ts
  - src/lib/crm/linkDeDocumentos.ts
  - src/lib/anotacoes/anotacaoPessoal.ts
fonte: onda 2 do número central, Frente I (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: A foto de documento chega ao tratador pela REFERÊNCIA da mensagem (chaves da mídia, sem o arquivo) e é baixada de novo no "sim"; a planilha é lida na hora e só as linhas seguem; chaves "_" dos dados vivem na proposta e nunca no registro. Lembrete é a anotação com lembrete do painel. Link de documentos sai do número do corretor, só para quem já conversa com ele.
---
# Documentos, lembrete e planilha pelo número central

Capacidades 5, 8 e 29 da spec (3.1, 3.2, 3.7). Onda 2; com `ONDA_ATUAL`
abaixo de 2 nada disto roda (foto segue a onda 1; arquivo, "ainda não").

## O arquivo nunca é guardado — e o "sim" vem noutra mensagem

O problema: a foto do RG chega na mensagem N, o "é do João" na N+1 e o "sim"
na N+2. Guardar o base64 na proposta faria o arquivo ir ao registro
(`central_comandos.proposta`, para sempre). A saída:

- `webhook.ts` monta a **referência** da mídia (`midia.ts`,
  `referenciaDaMensagem`): `key.id`, `remoteJid` e só os campos que a
  Evolution usa para decifrar (`url`, `directPath`, `mediaKey`…), **sem
  `jpegThumbnail`** (é um pedaço da foto) nem legenda.
- A conversa guarda a referência na fala da pessoa no histórico (janela de
  30 min) e põe em `ContextoDoCentral.midia` — da foto desta mensagem, ou da
  última do histórico. O tratador leva-a nos `dados` como `_midia`; no "sim"
  baixa de novo pela instância do central (`baixarMidiaDoProvedor` com
  `mensagemCompleta` remontada) e sobe para `documentos-clientes/<lead>/central/`.
- **Chave de `dados` que começa com `_`** fica na proposta guardada (1 h) e
  sai do registro (`paraORegistro` em `conversa.ts`). Vale para `_midia` e
  para `_linhas` da planilha. Foto anexada sai do histórico depois do "sim".

## Documentos (5)

- `ver` é leitura (preparar devolve `resposta`): a mesma conta da seção
  Documentação (`lerDocumentacaoDoLead` + `resumirLista`), nunca o caminho
  do arquivo. Gestor lê lead alheio; escrever e falar com o cliente é só do
  dono (a regra de `documentacaoAcoes.ts`).
- `anexar`: o item sai da FALA ("rg do joão", "extrato do fgts") por pistas
  ordenadas (`itemDaFoto`: FGTS antes de extrato, IR antes de renda, o RG
  não casa o "CPF (se não estiver no RG/CNH)"). Sem pista, pergunta qual
  documento listando o que falta. Entra `recebido`, não `conferido`: quem
  escolheu o item foi a leitura da conversa. Desfazer apaga linha e arquivo
  enquanto não conferido.
- **Documento nunca vira lead**: com a onda 2 o prompt da foto troca a linha
  do documento por "NUNCA use cadastrar_lead_da_foto… use documentos_do_lead
  anexar"; o tratador da foto (Frente E) não foi mexido.
- `mandar_link`: `garantirLinkDeDocumentos` é o miolo do botão da ficha
  (`linkDosDocumentos` passou a chamá-lo). Sai pelo número do corretor só se
  já há conversa com o cliente (como o toque do corretor em
  `pedirConfirmacaoDaVisita`); sem conversa, primeiro contato fica com o
  painel e as regras anti-bloqueio. Sem desfazer (mensagem enviada).

## Lembrete (8)

É a anotação com lembrete do painel (0100): `criarLembretePeloCentral`
grava `lembrete_em` + `lembrete_whatsapp`, para o próprio autor, com o lead
quando dito. Aparece em Anotações, na fila do Início e na consulta do lead;
sai pelo tique dos follow-ups (`processarLembretesDeAnotacao`), hoje pelo
número do PRÓPRIO corretor. Sem hora ("amanhã", "sexta à tarde") pergunta.

**Gancho para 4.7** (sessão principal): trocar o envio de
`processarLembretesDeAnotacao` (`src/app/api/cron/followups/route.ts`) para
o número central (instância de `lerCentral()`) quando o grupo tiver o
central ligado, mantendo o claim por `lembrete_enviado_em`.

## Planilha (29)

- Só `documentMessage` que PARECE planilha (nome/rótulo) é baixado; teto de
  5 MB (declarado antes, real depois); tipo pelos bytes: `.xlsx` = zip, `.xls`
  antigo (OLE) recusado com o passo do "Salvar como", CSV = texto sem byte
  nulo e não `%PDF-`. PDF e o resto seguem "ainda não", sem baixar.
- Não passa pelo cérebro: a conversa chama `importar_planilha` direto.
- Leitura = a do painel (`extrairDeXlsx`; CSV por `parsearTabelaLeads` +
  `dedupInterno`, sem IA). "Já existia" é no GRUPO (regra do cadastro pelo
  central), não na carteira da RLS como no painel. Telefone sem DDD ou
  cortado conta como inválido.
- O "sim" cadastra como o painel (`painel/importacao`, lotes de 50,
  `consentimento_lgpd: true` porque o resumo traz a declaração de
  autorização); desfazer arquiva os ids dessa importação.

## Relacionadas
- [[foto-no-numero-central]]
- [[crm-pelo-whatsapp-numero-central-com-ia]]
- [[agenda-pelo-numero-central]]
- [[MOC — IA e Atendimento]]
