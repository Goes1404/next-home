---
title: O acesso em lote existe, tem botão, e nunca foi clicado — 1 usuário no Auth para 8 corretores
aliases: [criarAcessosQueFaltam, criarAcessoCorretor, auth.users à mão]
tags: [admin, supabase, medicao]
type: medicao
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/admin/acoes.ts, src/lib/corretorSessao.ts, src/lib/corretores/credenciaisIniciais.ts]
created: 2026-09-12
updated: 2026-09-12
fonte: pedido de trocar e-mail e senha do Eduardo, 12/09/2026
summary: A 0095 construiu o lote de acessos e ele nunca rodou em produção — `auth.users` tinha UM usuário (a Bruna) para 8 corretores, e "trocar o e-mail do Eduardo" era na verdade criar o login dele. O painel também não tem caminho para trocar e-mail nem para definir senha escolhida.
---
# O acesso de corretor só existia para uma pessoa

Pedido: *"mude o e-mail do Eduardo para X e a senha para Y"*. Medido antes de
mexer, em 12/09/2026:

| | |
|---|---|
| linhas em `auth.users` | **1** (a Bruna) |
| corretores com `user_id` | **1** de 8 |
| corretores com `corretores.email` | **0** de 8 |
| e-mail do Eduardo | `null` |

**Não havia e-mail para trocar: o Eduardo nunca teve login.** O verbo do
pedido descrevia um estado que não existia, e aceitá-lo ao pé da letra levaria
a procurar defeito num `update` que nunca teve linha para atualizar.

## O lote da 0095 nunca rodou

`criarAcessosQueFaltam` faz exatamente isto — cria o login de todo corretor
ATIVO sem `user_id`, com e-mail derivado do slug e senha derivada do WhatsApp —
e tem botão na tela de Contas. Zero execuções na vida. **Décimo caso do padrão
"construído e nunca ligado" nesta base** — mesma família de
[[eval-nunca-tinha-rodado]] e [[upload-de-foto-nunca-funcionou]].

O sintoma é o mesmo de sempre e é silencioso: a roleta de leads (0093)
*prefere* quem tem login, então ela seguia mandando tudo para a Bruna, o que
parece "a roleta funcionando" em vez de "sete pessoas não conseguem entrar".

E `corretores.email` nulo para a Bruna, que TEM login, é o outro lado:
`criarAcessoCorretor` é o único caminho que escreve essa coluna, e a conta
dela nasceu antes dele. Quem depende dela (aviso de queda do número, relatório
semanal) cai na reserva pelo e-mail do LOGIN (`auth.admin.getUserById`) — é
por isso que aquele caminho não nasceu sem destinatário.

## O painel não troca e-mail nem aceita senha escolhida

As duas ações que existem:

- `criarAcessoCorretor(id, email)` — o gestor DIGITA o e-mail, a senha é
  sorteada no servidor (12 caracteres).
- `redefinirSenhaCorretor(id)` — sorteia outra senha.

Ou seja: **não há caminho de UI para trocar o e-mail de quem já tem acesso,
nem para definir uma senha escolhida.** A senha sorteada é
DECISÃO DELIBERADA, não limitação — o comentário
de `senhaTemporaria` diz que senha digitada em lote "vira next123 para as sete
pessoas, e aí o acesso de todo mundo vale o mesmo que nenhum". Antes de
construir "o gestor digita a senha", releia essa decisão: ela é o motivo de o
caminho não existir, não um esquecimento.

## Runbook: criar acesso com e-mail e senha escolhidos

Sem chave de serviço na mão, o caminho é `auth.users` direto. Funciona, e o
molde tem de ser copiado de uma linha que já loga — não escrito de cabeça:

```sql
-- ENSAIAR em begin; … rollback; primeiro. Sempre.
with novo as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', '<email>',
    extensions.crypt('<senha>', extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"email_verified":true}'::jsonb, now(), now(), '', '', '', ''
  ) returning id
)
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
select gen_random_uuid(), n.id, 'email', n.id::text,
       jsonb_build_object('sub', n.id::text, 'email', '<email>',
                          'email_verified', true, 'phone_verified', false),
       now(), now()
from novo n;
```

Detalhes que custam tempo:

- **`pgcrypto` mora em `extensions`**, não em `public`: `crypt()` sem o
  prefixo não resolve.
- **`gen_salt('bf', 10)`**, para casar o custo com o que o GoTrue escreve
  (`$2a$10$`). Sem o `10`, o pgcrypto usa 6.
- **`confirmed_at` é coluna GERADA** (`least(email_confirmed_at,
  phone_confirmed_at)`) — inserir nela é erro.
- **A linha em `auth.identities` não é opcional.** Sem ela o GoTrue reconhece
  a senha e ainda assim recusa alguns fluxos; o `provider_id` do provedor
  `email` é o próprio id do usuário.
- **Os quatro tokens vão como `''`, nunca `null`** — o GoTrue lê string.
- **`email_confirmed_at` preenchido é obrigatório**: não há SMTP no projeto,
  então a conta ficaria esperando um link que ninguém envia. É o mesmo
  `email_confirm: true` de `criarAcessoCorretor`.
- Depois: `corretores.user_id`, `corretores.email` e `slug`. **Sem slug,
  `getCorretorLogado()` devolve `null`** e a pessoa entra com a senha certa e
  cai em "Conta sem vínculo".

## A prova é entrar, não o `select`

`crypt('<senha>', encrypted_password) = encrypted_password` dando `true` prova
o hash, não o login. O que prova é o endpoint:

```
POST /auth/v1/token?grant_type=password   (header apikey: <publishable>)
```

200 com `access_token`, `last_sign_in_at` carimbado e linha em
`auth.sessions`. Aqui deu 200 em 2 de 3 tentativas — a terceira foi **504**, a
mesma piscada de gateway do Supabase de [[uma-piscada-do-banco-derrubava-a-home]].
Como distinguir a piscada de credencial ruim: **senha errada devolve 400
`Invalid login credentials` sempre**, nunca 504. Erro que muda a cada tentativa
não é erro de senha.

## Promover a gestor fora do painel falsifica o log, se feito errado

O Eduardo virou `gestor` no mesmo dia. A função da casa
(`definir_papel_corretor`, 0030) é `security definer` e começa com
`if not eh_gestor()` — que lê `auth.uid()`. Rodando como `postgres`, sem
JWT, `auth.uid()` é nulo e ela **recusa**, corretamente.

A saída aparente era fingir a sessão da gestora
(`set local request.jwt.claims = '{"sub":"<user_id dela>"}'`), o mesmo
truque que esta base usa para exercitar policy. **E ela está errada aqui**,
por um motivo que não é técnico: a função grava `ator_id = corretor_atual()`
em `admin_eventos`. Fingir a identidade dela escreveria, no log, que ELA
promoveu alguém — e a regra da 0030 é que "log que o ator pode forjar não é
log". Fingir sessão para TESTAR policy dentro de `rollback` é legítimo;
fingir sessão para GRAVAR ato de outra pessoa não é.

O caminho honesto foi `update` direto com o evento escrito à mão,
`ator_id` nulo e `origem` dizendo que veio de fora do painel. Perde-se a
validação da função; ganha-se um log que descreve o que de fato aconteceu.

**A verificação é `eh_gestor()` na sessão DELE**, não a coluna: dentro de
`begin; set local role authenticated; set local request.jwt.claims = …;
rollback;` a função devolveu `true` e ele passou a enxergar as 131 linhas de
`leads` e as 110 de `whatsapp_conversas` — que é o que `papel` realmente
significa. Coluna gravada prova o `update`; a RLS prova o acesso.

`garantir_gestor_remanescente` não estorva aqui: ela só barra DESPROMOVER
ou desativar o último gestor. Promover é sempre seguro, e de quebra tira a
operação do estado de gestor único.

Relacionadas: [[papel-nunca-ganha-grant-update]] ·
[[dado-gravado-e-nao-exibido-e-dado-perdido]] ·
[[medir-producao-nao-confiar-em-parece-funcionar]]
