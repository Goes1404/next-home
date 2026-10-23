---
title: Primeiro acesso completa ficha administrativa
aliases: [gestor sem dados iniciais, cadastro pendente do administrador]
tags: [admin, crm, decisao]
type: decisao
status: evergreen
custou: medio
codigo:
  - src/lib/corretores/cadastroPendente.ts
  - src/app/corretor/completar-cadastro/
  - src/app/corretor/(painel)/layout.tsx
created: 2026-10-23
updated: 2026-10-23
fonte: requisito de criação do administrador da Aretz Imobi
summary: Administrador de imobiliária pode nascer sem dados profissionais; fica oculto e é obrigado a informar nome, CRECI e WhatsApp antes do painel.
---
# Primeiro acesso completa ficha administrativa

O modelo de acesso da imobiliária é uma ficha em `corretores` com
`papel = gestor`; as colunas nome, CRECI e WhatsApp são obrigatórias. Quando
o dono só informa e-mail e quer que o titular preencha o resto, a ficha nasce
com CRECI marcador `PENDENTE-<id>`, é `oculta` e não entra na roleta.

O layout do painel detecta o marcador e redireciona para
`/corretor/completar-cadastro`. A action verifica a sessão, deriva a linha
pelo `user_id` (nunca recebe id do navegador) e só atualiza uma ficha ainda
marcada como pendente. A chave de serviço é necessária porque CRECI não tem
grant de edição no perfil comum.

Ao completar a ficha ela segue oculta: uma conta administrativa não vira
corretor público nem recebe lead automático só porque concluiu o cadastro.
Relacionadas: [[cadastro-e-marca-removidos-do-painel]] · [[MOC — CRM e Painel]]
