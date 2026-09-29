---
title: O lead do impulsionamento era descartado; agora a etiqueta da Meta abre a porta
tags: [whatsapp, campanhas, crm, lgpd]
type: decisao
status: evergreen
custou: medio
codigo:
  - src/lib/whatsapp/anuncioMeta.ts
  - src/lib/whatsapp/impulsionamentos.ts
  - src/lib/whatsapp/porteiro.ts
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/
  - supabase/migrations/0127_impulsionamentos_do_corretor.sql
created: 2026-09-27
updated: 2026-09-27
summary: Os corretores impulsionam os próprios posts com o botão de WhatsApp. O cliente chegava com o texto padrão da Meta, que não era convite reconhecido, e a 0111 descartava a mensagem em silêncio. Agora o webhook lê a etiqueta que a Meta põe na mensagem (contextInfo.externalAdReply, com o id do anúncio) e, sem ela, o texto padrão da Meta em lista curta. O lead nasce com origem meta/ctwa e meta_ad_id, a IA atende, e o anúncio aparece sozinho em Marketing → Impulsionamentos, onde o corretor só digita quanto gastou. Conectar a conta da Meta ficou para depois (exige app aprovado).
---

# O lead do impulsionamento era descartado

## O defeito
Cada corretor impulsiona o próprio post, destino WhatsApp. O cliente cai no
número do corretor com o texto pronto da Meta ("Olá! Posso obter mais
informações sobre isto?"). Esse texto não era a mensagem do link `/wa/` nem
frase de entrada, então a regra da [[conversa-casa-com-lead-por-telefone]]
(sem lead, nada entra) descartava a mensagem: sem lead, sem resposta.

## A decisão
- **Etiqueta primeiro.** Mensagem de anúncio "Clique para o WhatsApp" traz
  `contextInfo.externalAdReply` (`sourceType: "ad"`, `sourceId` = id do
  anúncio, `title`, `sourceUrl`, `ctwaClid`) e/ou `conversionSource: FB_Ads`.
  Conversa pessoal nunca tem isso, então a proteção do número pessoal fica.
  Link compartilhado também tem `externalAdReply`, mas sem `sourceType: ad`:
  não conta.
- **Texto padrão da Meta como reserva**, com casamento EXATO numa lista curta.
  Texto personalizado pelo corretor entra pelas frases de entrada dele.
- **Gasto digitado (opção A)**, não OAuth. Conectar a conta de anúncios de
  cada corretor exige app da Meta com `ads_read` aprovado (verificação da
  empresa + revisão, semanas) ou cada corretor como testador. O corretor
  digita o valor que o app do Instagram mostra; os leads são contados de
  `leads` na leitura (nunca copiados).

## O que ainda não foi provado
Não houve anúncio real depois do deploy. Se a Evolution não repassar o
`contextInfo`, o webhook registra `[porteiro] número sem lead com
contextInfo:` com os NOMES dos campos (nunca o conteúdo). Sem esse log e sem
lead, a etiqueta não está chegando e só a reserva do texto padrão funciona.

## Relacionados
- [[MOC — Campanhas e Anti-ban]] · [[fluxo-do-webhook-whatsapp]]
- [[link-de-anuncio-e-rodizio-aleatorio]] (o `/wa/` do anúncio da empresa)
