---
title: Logins da Aretz com senha provisória
tags: [admin, painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/corretor/actions.ts
  - src/app/corretor/(painel)/perfil/FormularioPerfil.tsx
  - src/app/corretor/(painel)/admin/contas/ContasManager.tsx
created: 2026-10-23
updated: 2026-10-23
fonte: pedido operacional da Aretz em 2026-10-23
summary: A equipe da Aretz recebe senha provisória com troca obrigatória; CRECI e WhatsApp são preenchidos no próprio perfil antes de a conta entrar na operação.
---

# Logins da Aretz com senha provisória

Foram criados os acessos de Fernando como gestor e de Moisés, André, Gediel,
Fábio e Martines como corretores no grupo Aretz Imobi. Bruno já tinha acesso
como gestor.

As contas novas usam senha provisória e `deve_trocar_senha = true`, portanto o
primeiro login leva à troca. Elas ficam pausadas até a pessoa preencher o
WhatsApp com DDD e o CRECI no perfil; não se registra senha neste vault.

O formulário de perfil passou a aceitar CRECI e WhatsApp. A alteração do CRECI
é feita por uma action autenticada, filtrada pelo `user_id`, usando a chave de
serviço porque o grant normal do corretor não permite alterar esse campo
regulatório.

Depois da troca da senha provisória, a action redireciona automaticamente para
`/corretor`; não é mais necessário tocar em "Voltar ao painel".

O aceite dos termos foi temporariamente retirado do caminho do painel e da
conexão do WhatsApp. A página, a action e a tabela de aceite permanecem
preservadas para serem reativadas depois.

O favicon do CRM em `aretzimoveis.com` usa o `logo-selo.png` oficial da Aretz,
declarado no layout de `/corretor` por host. O favicon da Next permanece nos
demais endereços.

Relacionado: [[MOC — CRM e Painel]]
