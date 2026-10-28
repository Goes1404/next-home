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
  - src/app/plataforma/grupos/[id]/AcessosDoGrupo.tsx
  - src/lib/plataforma/grupos.ts
  - src/lib/plataforma/senhaTemporaria.ts
  - src/app/plataforma/acessos/page.tsx
  - supabase/migrations/0231_encerrar_sessoes_do_usuario.sql
created: 2026-10-23
updated: 2026-10-28
fonte: requisito do administrador da plataforma
summary: O operador da plataforma cria, no detalhe de cada grupo, logins de gestor ou corretor com senha temporária obrigatoriamente trocada no primeiro acesso — e desde 28/10 também redefine a senha de quem já tem login, com a mesma troca obrigatória.
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

## Redefinir senha de quem já tem login (28/10/2026)

Pedido do dono: resetar senha dos usuários pela conta
`sq1matheusgsilva@gmail.com`. Medido em produção: essa conta está em
`administradores_da_plataforma` e **não tem ficha de corretor** — então não
enxerga Administração → Contas (que é do gestor) nem recupera a própria
senha pelo "Esqueci a senha". A porta tinha de ficar em `/plataforma`.

- Seção **Acessos** no detalhe do grupo (`lerAcessosDoGrupo`, só fichas com
  `user_id`: nome, e-mail, papel, ativo, troca pendente). Cada linha abre
  "Redefinir senha" com uma senha temporária (8+).
- `redefinirSenhaDoAcesso`: guarda da plataforma → ficha pelo id **e** grupo
  → recusa login que administra a plataforma → liga `deve_trocar_senha` →
  `auth.admin.updateUserById({ password })` → evento `senha_redefinida`
  (já existia no CHECK, sem migration) com `ator_plataforma_user_id`.
- A marca de troca vai ANTES da senha; se o Auth recusar (ex.: `weak_password`),
  volta ao valor que tinha. Guardar o valor antigo numa variável antes do
  `update`: o `bancoFalso` devolve a própria linha, e o `update` a mutava.
- **Exceção consciente à regra "ninguém assume o login de outro"** (revisão de
  20/10): o operador conhece a senha temporária até a pessoa trocar. É o mesmo
  acordo do "Criar acesso", pedido pelo dono. O gestor continua só com o link
  por e-mail.
- ~~Não derruba sessões abertas~~ — resolvido no mesmo dia, ver abaixo.

## Melhorias de 28/10: senha gerada, busca entre grupos, sessões encerradas

- **Gerar senha forte** (`gerarSenhaTemporaria`, no navegador): 12
  caracteres sem 0/O/1/l/I, com minúscula, maiúscula e dígito; botão
  **Copiar** usa a área de transferência. Campo com olho, nasce oculto.
- **`/plataforma/acessos?busca=`** (link "Buscar acesso e redefinir senha"
  em Contas): e-mail OU nome em todos os grupos (`buscarAcessos`, mínimo 3
  letras, 20 resultados). Duas consultas em vez de `.or()`: vírgula ou
  parêntese digitados quebrariam a sintaxe do filtro do PostgREST.
- **Sessões**: o SDK só faz logout pelo JWT da própria pessoa. A 0231 cria
  `encerrar_sessoes_do_usuario(uuid)` (security definer, só `service_role`)
  que apaga `auth.sessions` (refresh_tokens saem por cascade). O token de
  acesso que já está no navegador vale até vencer (`jwt_expiry` 3600):
  `getClaims` confere a assinatura localmente, sem perguntar ao Auth se a
  sessão existe. A tela diz "sai em até 1 hora". Falha aqui não desfaz a
  senha; o evento grava `sessoes_encerradas`.
- `postgres` tem DELETE em `auth.sessions` em produção (conferido antes).

Relacionadas: [[convite-por-link-no-nosso-dominio]] · [[plataforma-multi-grupo]] · [[primeiro-acesso-completa-ficha-administrativa]] · [[MOC — CRM e Painel]]
