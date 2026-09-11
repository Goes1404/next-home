---
title: O perfil do lead abre dentro da conversa
aliases: [perfil no chat, detalhes do lead no direct]
tags: [crm, painel, decisao]
type: nota
status: growing
custou: baixo
codigo: [src/app/corretor/(painel)/conversas/Chat.tsx, src/app/corretor/(painel)/conversas/acoes.ts]
created: 2026-09-11
updated: 2026-09-11
fonte: decisão de produto, referência ao fluxo do Instagram, 11/09/2026
summary: Tocar no avatar ou nome de uma conversa com lead abre uma tela de detalhes dentro do chat, com ações, qualificação e leitura da IA; voltar preserva a conversa.
---
# O perfil do lead abre dentro da conversa

Conversa e CRM não são duas jornadas separadas. Tocar no avatar ou nome do
contato troca o histórico por uma tela de `Detalhes`, no padrão mental do
direct do Instagram. Voltar restaura o mesmo chat sem recarregar nem perder o
estado.

O perfil mostra avatar, nome, telefone, etapa, orçamento, renda, região,
dormitórios, visita e temperatura, quando esses dados existem. As ações
rápidas são ligar, anotar e abrir a ficha completa. A tela compacta é leitura;
edições continuam na ficha completa para não nascer uma segunda implementação
do CRM.

No celular o perfil ocupa toda a área da conversa. No desktop ocupa a coluna
do chat, mantendo a lista de conversas ao lado. Todos os alvos principais têm
pelo menos 44 px e `Esc` também volta para a conversa.

## Relacionadas

- [[conversa-casa-com-lead-por-telefone]]
- [[o-contexto-da-decisao-da-ia]]
- [[MOC — CRM e Painel]]
