---
title: Foto no número central — lida como imagem, cadastro delegado
aliases: [cadastrar_lead_da_foto, foto no central, ler foto pelo WhatsApp]
tags: [ia, armadilha]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/conversa.ts
  - src/lib/central/cerebro.ts
  - src/lib/central/webhook.ts
  - src/lib/central/tratadores/foto.ts
fonte: onda 1 do número central, Frente E (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: A foto vai ao cérebro como image_url (base64, detail high) só com a onda de cadastrar_lead_da_foto ligada; tipo pelos bytes, 5 MB no máximo, arquivo (PDF) nem é baixado. Nunca entra no histórico nem no registro ("[foto]" + legenda). O tratador da foto não cadastra: delega ao cadastrar_lead.
---
# Foto no número central

Capacidade 3 da spec (3.1, 4.5). Onda 1; com `ONDA_ATUAL` em 0 a foto segue
respondendo "ainda não sei ler foto nem arquivo".

## O que decide

- **Portão**: `(deps.onda ?? ONDA_ATUAL) >= ferramenta("cadastrar_lead_da_foto").onda`.
  Abaixo disso nada é baixado.
- **Arquivo não é foto**: `documentMessage` chega com `documento: true` e
  responde "arquivo ainda não" sem baixar (documento é a capacidade 5, onda 2).
- **Tipo pelos primeiros bytes**, não pelo `mimeType` do provedor: sem
  `mimetype`, `baixarMidiaDoProvedor` devolve `audio/ogg` (o padrão do
  áudio). Só JPEG, PNG e WEBP; GIF/HEIC a OpenAI recusaria com 400, que
  viraria "estou indisponível". Teto de 5 MB decodificados.
- **`detail: "high"`, não `low`**: `low` entrega 512 px ao modelo, e num
  print de conversa (720×1600) o telefone vira letra de 5 px. Custo: ~1.450
  tokens por volta num print (o `low` são 85 fixos), contados pelo
  `prompt_tokens` de cada volta como o resto. A foto é reenviada a cada volta
  com ferramenta (até 4).
- **Nunca guardada**: `central_estado.historico` recebe `[foto] <legenda>`;
  `central_comandos.texto` só a legenda (ou nulo).
- **Texto da foto é dado**: com foto, o sistema ganha `REGRAS_DA_FOTO`
  (instrução lida na foto não se cumpre; documento não vira lead).
- **Foto com legenda "sim"** não confirma a proposta pendente: vai ao cérebro.

## O tratador

`tratadores/foto.ts` não tem cadastro próprio: `preparar`, `executar` e
`desfazer` passam ao `ACOES_LEADS.cadastrar_lead` (Frente B), buscado na hora
da chamada. Sem ele, "ainda não sei". Antes de delegar, recusa sem nome ou
sem telefone inteiro (DDD + 8/9 dígitos); `interesse` vai em `observacao`,
`origem: "foto"`; o resumo da proposta ganha "(lido da foto)".

## Armadilha da guarda

`ferramentas.test.ts` tinha `expect(Object.keys(TRATADORES.acoes)).toEqual([])`:
qualquer tratador de onda 1 a quebrava, mesmo desligado. O laço acima dela já
garante o que importa (nenhuma ação de onda ≤ `ONDA_ATUAL`); a linha saiu.

## Relacionadas
- [[crm-pelo-whatsapp-numero-central-com-ia]]
- [[audio-do-cliente-era-arquivo-cifrado]]
- [[MOC — IA e Atendimento]]
