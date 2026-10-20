---
title: O aviso ao corretor diz o que fazer, e não se repete
tags: [crm, whatsapp, ia]
type: decisao
status: evergreen
custou: medio
codigo:
  - src/lib/whatsapp/brokerNotifier.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/crm/avisoAoCorretor.ts
  - src/lib/crm/enviarResumoDoDia.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/lib/whatsapp/alertaAoCorretor.test.ts
summary: Os alertas do atendimento usavam o mesmo texto para oito motivos e se repetiam a cada mensagem; hoje cada motivo diz o que fazer, mostra a ficha e tem carência própria.
updated: 2026-10-20
---

# O aviso ao corretor diz o que fazer, e não se repete

Queixa do dono (20/10/2026): "chegam mensagens estranhas que não dizem
muita coisa, ou repetidas".

**O que estava errado nos alertas** (`formatarAlertaCorretor`):

- Um corpo só para oito motivos. Até "visita desmarcada" chegava com "a sua
  assistente acabou de qualificar um cliente de alto padrão" e "entre em
  contato para garantir a melhor taxa de conversão".
- "Imóveis em Alphaville" quando não havia imóvel citado.
- Nome do perfil do WhatsApp (apelido, emoji) no lugar do nome da ficha.
- Um parágrafo do dossiê escrito pela IA no lugar dos dados que decidem.
- "SOLICITAÇÃO DE VISITA" quando era a IA que tinha PROPOSTO a visita.
- Ligação, atendimento humano e dúvida pendente sem carência: o mesmo
  aviso a cada mensagem do cliente.

**Hoje:** primeira linha = o que fazer; depois o fato (data da visita), o
que o cliente disse, a ficha numa linha (imóvel, quartos, renda, até
quanto, região) e "Falta saber: …". Carência por motivo em
`whatsapp_conversas.alertas_ao_corretor` (0203): ligação, humano e dúvida
3 h; lead quente 72 h; visita sempre sai. Tudo vai por `avisarCorretor`,
então também chega como [[notificacao-no-celular-do-corretor]], com a ação
no título.

**Resumo do dia:** "Leads novos" deixou de listar quem o próprio corretor
cadastrou (planilha, painel, palavra-chave) e mostra a origem em português
("pelo anúncio …", não `meta/ctwa`). "Visitas sem retorno" aparece uma vez
(24 a 48 h depois), não seis manhãs seguidas.

Régua: aviso que diz a mesma coisa em toda situação deixa de ser lido.
