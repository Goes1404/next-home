---
title: O ADM exclui o lead direto, sem arquivar antes
tags: [crm, painel, decisao]
type: decisao
status: evergreen
custou: baixo
codigo:
  - src/app/corretor/(painel)/leads/acoes.ts
  - src/app/corretor/(painel)/leads/[id]/acoes.ts
  - src/app/corretor/(painel)/leads/[id]/ArquivarLead.tsx
  - src/app/corretor/(painel)/leads/ListaLeads.tsx
created: 2026-10-02
updated: 2026-10-02
summary: A exclusão definitiva exigia dois passos (arquivar, depois excluir na lista de arquivados), e o botão quase não era achado. Pedido do usuário em 02/10/2026, o ADM passa a ver "Excluir" na lista ativa (seleção) e "Excluir definitivamente" na ficha de qualquer lead, sempre com confirmação. O corretor continua só arquivando (0134). Vai junto, por cascade, a conversa de WhatsApp, o dossiê, tarefas e linha do tempo.
---

# O ADM exclui o lead direto

- **Antes:** arquivar só na lista ativa, excluir só na de arquivados (0055).
  Na prática ninguém achava o botão.
- **Agora:** o ADM exclui na seleção da lista ativa e na ficha de qualquer
  lead. A trava contra o clique errado é a confirmação, que escreve quantos
  leads saem e o que vai junto.
- **Quem decide é o papel**, checado na action antes do `.delete()` e na
  policy `leads: so o adm exclui` (`eh_gestor()`). Guarda:
  `leadArquivado.test.ts` (provocada tirando a checagem de papel).
- O texto da ficha dizia que a conversa ficava sem lead; desde a 0111 ela
  vai junto por cascade, e a pessoa não é atendida se escrever de novo.

Relacionado: [[adm-nao-le-conversa-alheia]], [[apagar-leads-leva-a-conversa-junto]].
