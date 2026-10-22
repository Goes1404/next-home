---
title: Cadastro de usuário, Meu site e Marca removidos do painel
aliases: [remoção do cadastro de usuário, remoção do Meu site, remoção da Marca]
tags: [admin, painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/corretor/(painel)/admin/contas/ContasManager.tsx
  - src/app/corretor/(painel)/_componentes/navegacao.tsx
created: 2026-10-22
updated: 2026-10-22
fonte: pedido do usuário em 2026-10-22
summary: O painel não oferece cadastro de usuário novo, Meu site nem Marca; contas existentes e configurações já gravadas permanecem.
---
# Cadastro, Meu site e Marca removidos do painel

Por decisão do usuário, o formulário que criava novos usuários da imobiliária
foi removido de Administração → Contas. A tela continua listando e gerenciando
as contas já existentes, sem apagar usuários, fichas ou logins do banco.

As áreas Administração → Meu site e Administração → Marca também foram
removidas do menu e das rotas da interface. Configurações já gravadas e a
infraestrutura interna que o site utiliza continuam existindo; o que foi
retirado são os editores administrativos. Ver também
[[meu-site-da-imobiliaria]] e [[marca-do-grupo-no-crm]].
