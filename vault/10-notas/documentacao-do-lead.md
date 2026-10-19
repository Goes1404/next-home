---
title: A documentação do lead tem lista, conferência e recusa com motivo
aliases: [documentação do lead, documentos do cliente, guardar como documento]
tags: [crm, painel, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [supabase/migrations/0179_documentacao_do_lead.sql, src/lib/crm/documentacao.ts, src/lib/crm/documentacaoDados.ts, src/lib/crm/zipNoNavegador.ts, src/app/corretor/(painel)/leads/[id]/Documentacao.tsx, src/app/corretor/(painel)/leads/[id]/DocumentacaoClient.tsx, src/app/corretor/(painel)/leads/[id]/documentacaoAcoes.ts, src/app/corretor/(painel)/conversas/documentoAcoes.ts, src/lib/whatsapp/midiaRecebida.ts, src/lib/whatsapp/midiaPrivada.ts, src/app/(institucional)/documentos/[token]/acoes.ts]
created: 2026-10-16
updated: 2026-10-16
summary: A ficha do lead ganhou a seção Documentação (0179). Duas listas por lead (financiamento e contrato), editáveis; cada arquivo recebido, conferido ou recusado com motivo; o recusado volta para o link do cliente com o motivo. O corretor anexa pela ficha ou guarda a foto que o cliente mandou no WhatsApp. Baixa os conferidos em .zip e recebe a sugestão de mover para Documentação.
---
# A documentação do lead (0179)

Pedido de 16/10: "vamos criar uma parte de documentação do lead". Até ali o
documento só chegava pelo link do cliente (0118), a lista morava DENTRO do
link e a ficha mostrava só "recebido".

## O que ficou

- **Duas listas por lead**, uma por fase: financiamento (começa pelo perfil
  CLT, autônomo ou casal) e contrato (começa com o que as construtoras
  costumam pedir). O corretor põe e tira item. A lista mora no lead
  (`lead_documentos_lista`), não no link: o link mostra sempre a lista como
  está agora.
- **Situação por arquivo**: recebido, conferido ou recusado com motivo. A
  situação do item sai dos arquivos (`situacaoDoItem`): um conferido basta;
  recusado só quando todos foram recusados.
- **Recusar não manda nada sozinho**: abre o WhatsApp do corretor com a
  mensagem pronta. O cliente vê o motivo na página do link e o botão "Enviar
  de novo".
- **O corretor anexa** pela ficha (entra conferido) ou guarda a foto/PDF que
  o cliente mandou no WhatsApp ("Guardar como documento", embaixo do balão).
- **.zip dos conferidos**, numerados na ordem da lista ("01 - RG ou CNH.jpg").
- **Sugestão de etapa**: com o financiamento todo conferido, a seção oferece
  "Mover para Documentação". Só oferece; mover é do corretor.

## O que custou decidir

- **A mídia do cliente no WhatsApp não era guardada.** A mensagem gravava só
  "[cliente enviou uma imagem]". Agora o webhook baixa pela Evolution (com a
  mensagem inteira, senão "Message not found") e guarda no bucket PRIVADO
  `documentos-clientes`, depois da resposta (`after`). A coluna `midia_url`
  guarda `privado:<caminho>` e o painel assina na leitura (30 min). Só
  formato e tamanho que a lista de documentos aceita.
- **O .zip é montado no navegador.** A resposta de uma função da Vercel tem
  teto de 4,5 MB, e uma pasta de financiamento passa disso. O servidor só
  assina os links; os bytes vêm direto do Storage.
- **Escrita só pelo servidor.** A sessão lê pela RLS (dono ou gestor); a
  action confere que o lead é do corretor e escreve com a chave de serviço.
  O gestor vê e baixa, não mexe. A tabela nova revoga tudo do `anon` e do
  `authenticated` e devolve só SELECT.
- **O código roda antes da migration.** Sem as colunas novas, a leitura cai
  na consulta antiga (tudo "recebido", fase financiamento) e a seção avisa
  que conferir e editar dependem da 0179.

## Links

- [[lembrete-da-tarefa-chega-no-whatsapp]]
- [[audio-do-cliente-era-arquivo-cifrado]] (o mesmo download da Evolution)

O envio (link do cliente e anexar da ficha) sobe direto ao armazenamento desde
o mesmo dia: [[arquivo-grande-nao-passa-pela-server-action]].
