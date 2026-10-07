---
title: Cadastrar corretor pelo painel
aliases: [novo corretor, cadastrar corretor]
tags: [crm, painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["src/app/corretor/(painel)/admin/acoes.ts", "src/app/corretor/(painel)/admin/contas/ContasManager.tsx"]
summary: Administração → Contas ganhou "Cadastrar corretor" (nome, CRECI, WhatsApp, e-mail), que cria a ficha e o login de uma vez. Antes, ficha nova só nascia por SQL.
updated: 2026-10-07
---

# Cadastrar corretor pelo painel

Até 07/10/2026 a tela de Contas só criava ACESSO para quem já tinha ficha
(ver [[acesso-de-corretor-so-existia-para-um]]); corretor novo só entrava por
SQL.

- `cadastrarCorretor` confere o gestor com a sessão e grava a ficha com a
  chave de serviço: `corretores` não tem policy de INSERT (é pública para
  leitura).
- Depois chama `criarAcessoCorretor`, o mesmo caminho de sempre (senha
  sorteada, `deve_trocar_senha`, evento `conta_criada`). Se o login falhar,
  a ficha é apagada, para não sobrar corretor sem acesso no site.
- WhatsApp passa por `normalizarTelefoneBr` e precisa dar 12 ou 13 dígitos.
- O corretor novo nasce ativo: aparece em `/corretores` e entra na roleta.
