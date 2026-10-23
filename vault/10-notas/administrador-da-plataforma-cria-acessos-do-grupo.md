---
title: Administrador da plataforma cria acessos do grupo
aliases: [criar usuários de imobiliária, convite pelo painel da plataforma]
tags: [admin, painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/plataforma/acoes.ts
  - src/app/plataforma/grupos/[id]/FormularioNovoAcesso.tsx
  - src/app/plataforma/grupos/[id]/page.tsx
created: 2026-10-23
updated: 2026-10-23
fonte: requisito do administrador da plataforma
summary: O operador da plataforma cria, no detalhe de cada grupo, logins de gestor ou corretor com senha temporária obrigatoriamente trocada no primeiro acesso.
---
# Administrador da plataforma cria acessos do grupo

O administrador da plataforma tem, no detalhe de cada grupo em
`/plataforma/grupos/<id>`, a seção **Criar acesso**. Ela pede apenas e-mail,
senha temporária e papel: corretor ou administrador da imobiliária (`gestor`).

A action confere `eh_admin_da_plataforma()` antes de usar a chave de serviço,
confere se o grupo existe e se o e-mail não é de outra ficha, cria o login no
Auth com `email_confirm: true`, cria uma ficha oculta com CRECI `PENDENTE-*` e
registra a auditoria com `ator_plataforma_user_id`. A senha só é enviada ao
Auth: não é gravada na ficha, auditoria, logs ou resposta da action.

No primeiro login, `deve_trocar_senha` obriga o titular a escolher a própria
senha. Depois ele completa nome, CRECI e WhatsApp em
[[primeiro-acesso-completa-ficha-administrativa]]. A ficha continua oculta,
portanto não entra no site nem na roleta de leads.

Se a criação da ficha falhar, a action apaga o login que acabou de criar;
assim não deixa credencial órfã.

Relacionadas: [[plataforma-multi-grupo]] · [[primeiro-acesso-completa-ficha-administrativa]] · [[MOC — CRM e Painel]]
