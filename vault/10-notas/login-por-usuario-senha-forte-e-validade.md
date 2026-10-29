---
title: Login por usuário, senha forte e validade de 90 dias
tags: [supabase, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/auth/politicaDeSenha.ts
  - src/lib/auth/validadeDaSenhaNoServidor.ts
  - src/lib/auth/identificadorDeLogin.ts
  - src/app/corretor/actions.ts
  - src/app/corretor/definir-senha/acoes.ts
  - src/app/corretor/CampoDeAcesso.tsx
  - supabase/migrations/0235_login_por_usuario.sql
created: 2026-10-29
updated: 2026-10-29
summary: O login aceita e-mail ou nome de usuário (app_metadata.usuario + email_do_usuario, 0235); senha exige maiúscula, minúscula, número e símbolo; vence a cada 90 dias pela data em app_metadata.senha_trocada_em.
---

# Login por usuário, senha forte e validade de 90 dias

**Pedido (29/10/2026):** "transforme meu login em eduardo.bezerra", "critérios
em criar senha, como letra maiúscula, símbolo", "trocar a senha de 3 em 3
meses".

## Nome de usuário

- O Auth do Supabase só entra por e-mail. O nome mora em
  `auth.users.raw_app_meta_data->>'usuario'` (minúsculo) e
  `public.email_do_usuario(text)` (0235, `security definer`, só
  `service_role`) traduz para o e-mail antes do `signInWithPassword`.
- `app_metadata`, nunca `user_metadata`: o usuário reescreve o
  `user_metadata` pela chave pública e tomaria o nome de outro.
- Texto sem "@" fora de `^[a-z0-9][a-z0-9._-]{2,39}$` nem consulta o banco.
  Usuário inexistente e senha errada respondem a mesma frase.
- Primeira conta: `eduardo.bezerra` → conta do Gmail do Eduardo (ADM da
  plataforma, sem ficha de corretor). Senha com o dono, fora do git.
- A migration foi registrada no banco como `0240_login_por_usuario` (número
  do primeiro rascunho) e o arquivo é `0235`: `migrations.test.ts` proíbe
  buraco na numeração.

## Régua de senha

- `politicaDeSenha.ts`: 8+, maiúscula, minúscula, número, símbolo (espaço
  não conta). Vale para criar senha pelo link, trocar senha e senha
  temporária da plataforma. A tela mostra `ChecklistDaSenha` ao vivo.

## Validade de 90 dias

- Data da última troca em `app_metadata.senha_trocada_em` (só a chave de
  serviço escreve; o usuário não consegue adiar).
- Conta sem data começa a contar no primeiro login depois da regra (vencer
  todas no mesmo dia derrubaria a equipe).
- Conferida no login (`entrar`) e em toda tela do painel e da plataforma
  (`senhaDaSessaoVencida`, pelo JWT, sem ida ao Auth) → `/corretor/senha?motivo=vencida`.
- **Armadilha:** depois de gravar a data, a action chama
  `auth.refreshSession()`. Sem isso o JWT segue com a data velha por até 1 h
  e o painel manda de volta para a troca quem acabou de trocar.

Ver também [[app-no-celular-area-segura-login-e-abertura]].

## Entrar com Google (29/10/2026)

- Botão só com `NEXT_PUBLIC_LOGIN_GOOGLE=sim` (o provedor Google precisa estar
  ligado no Supabase → Authentication → Providers, com o Client ID/Secret do
  Google Cloud e a URL de volta `https://<projeto>.supabase.co/auth/v1/callback`;
  em URL Configuration, liberar `https://astroimob.vercel.app/auth/google`).
- Volta em `/auth/google`: troca o `code`, e só entra quem já tem ficha ativa
  ou é ADM. Google sem conta: sai e, se o Supabase acabou de criar um usuário
  só-Google (< 5 min), apaga. Conta com senha nunca é apagada.
- Supabase liga a identidade Google à conta com o mesmo e-mail verificado.
- Digital/biometria: não implementado (passkey própria exigiria recurso que o
  Auth atual não oferece de forma estável); o Gerenciador de Senhas do Google
  já preenche com a digital no Android.

