# Como ligar o convite e o e-mail

Guia para o Matheus. Desde a fase 2A o acesso ao painel não tem mais senha
provisória: quem entra recebe um **link por e-mail** (convite) e cria a
própria senha. O mesmo vale para "Esqueci a senha".

Sem os passos abaixo nada quebra: o convite continua sendo criado e a tela
mostra o link para você copiar e mandar pelo WhatsApp. Com eles, o e-mail
sai sozinho.

**Ordem:** os passos 1 a 4 podem ser feitos a qualquer hora. O passo 5
(cadastrar-se como administrador da plataforma) só funciona depois que as
migrations 0181 a 0187 estiverem aplicadas em produção — antes disso a
tabela não existe.

---

## 1. Conta no Resend e o domínio

O Resend é quem entrega o e-mail. O remetente é
`Next Home <acesso@nexthomeimoveis.com>`.

1. Crie a conta em <https://resend.com>.
2. Em **Domains → Add Domain**, digite `nexthomeimoveis.com`.
3. O Resend mostra uma lista de registros DNS (normalmente: um **MX** e um
   **TXT** de SPF no subdomínio `send`, e um **TXT** de DKIM em
   `resend._domainkey`). Deixe essa tela aberta.
4. Na Hostinger (o domínio foi comprado lá): **hPanel → Domínios →
   nexthomeimoveis.com → DNS / Nameservers → Gerenciar registros DNS**.
   Crie cada registro exatamente como o Resend mostra.
   - Atenção: no campo **Nome**, a Hostinger já completa o domínio. Se o
     Resend diz `send.nexthomeimoveis.com`, digite só `send`. Se digitar o
     endereço inteiro, o registro vira `send.nexthomeimoveis.com.nexthomeimoveis.com`
     e nunca é verificado.
   - Não apague os registros que apontam o site para a Vercel.
5. Volte ao Resend e clique em **Verify DNS Records**. Pode levar de
   minutos a algumas horas. Siga só quando o domínio aparecer como
   **Verified**.
6. Em **API Keys → Create API Key**: permissão **Sending access**, domínio
   `nexthomeimoveis.com`. Copie a chave (ela só aparece uma vez).

## 2. As duas variáveis na Vercel, e o redeploy

Vercel → projeto **next-home** → **Settings → Environment Variables**,
ambiente **Production**:

| Nome | Valor |
|---|---|
| `RESEND_API_KEY` | a chave do passo 1.6 |
| `EMAIL_REMETENTE` | `Next Home <acesso@nexthomeimoveis.com>` |

Depois: **Deployments → o último de produção → ⋯ → Redeploy**. Variável
nova só vale depois de um redeploy (a função congela o ambiente no build).

Sem `EMAIL_REMETENTE` o código usa esse mesmo remetente; a variável existe
para trocar sem mexer em código.

## 3. Supabase: endereço do site e para onde o link pode voltar

Supabase → projeto **Next homee** → **Authentication → URL
Configuration**:

- **Site URL:** `https://www.nexthomeimoveis.com` (o mesmo valor de
  `NEXT_PUBLIC_SITE_URL` na Vercel).
- **Redirect URLs:** adicione `https://www.nexthomeimoveis.com/auth/confirmar`.
  Se ainda houver acesso pelo endereço antigo, adicione também
  `https://next-home-drab.vercel.app/auth/confirmar`.

O link do e-mail é do NOSSO domínio (`/auth/confirmar?token_hash=…`), e não
o link do próprio Supabase. A lista de Redirect URLs fica certa mesmo assim:
é a regra que o Auth confere, e se um dia alguém usar o link do Supabase ele
cai na mesma rota.

## 4. Supabase: quanto tempo o link vale (24 horas)

Supabase → **Authentication → Sign In / Providers → Email** (em versões
antigas do painel: **Authentication → Providers → Email**), campo **Email
OTP Expiration**: `86400` (segundos = 24 horas). Salve.

- O padrão do Supabase é 3600 (1 hora): curto demais para quem recebe o
  convite no meio do expediente. A tela do convite diz "vale por 24 horas";
  sem este passo, ela mente.
- O mesmo campo vale para o link de **recuperação de senha** ("Esqueci a
  senha"): também passa a durar 24 horas.
- O ambiente local já usa 86400 (`supabase/config.toml`, `otp_expiry`);
  produção não lê esse arquivo — é este passo que vale lá.

Dois prazos menores, que são do código e não mudam aqui:

- Depois de abrir o link, a pessoa tem **15 minutos** para apertar o botão
  "Continuar" (o link fica guardado num cookie nesse meio-tempo; scanners de
  e-mail abrem o link antes da pessoa e não gastam nada).
- Depois de apertar o botão, ela tem **15 minutos** para criar a senha. Fora
  disso, a tela de criar senha manda para "Trocar senha", que pede a senha
  atual — quem ainda não tem senha pede outro link em "Esqueci a senha".

## 5. Cadastrar-se como administrador da plataforma

A área `/plataforma` (criar grupos, ver cadastro e números de cada um) só
abre para quem está em `administradores_da_plataforma`. Não há tela para
isso, de propósito.

1. Você precisa de um login no Supabase (o mesmo que usa no painel serve).
2. Supabase → **SQL Editor** → rode, trocando o e-mail pelo seu:

   ```sql
   insert into public.administradores_da_plataforma (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com.br'
   on conflict (user_id) do nothing;
   ```

3. Confira: `select count(*) from public.administradores_da_plataforma;`
   deve dar pelo menos 1.
4. Abra `https://www.nexthomeimoveis.com/plataforma`. Sem sessão, ele pede
   o login e volta para a plataforma. Quem não é administrador vê "página
   não encontrada" — a área nem diz que existe.

O administrador da plataforma **não lê** conversa, ficha nem lead de grupo
nenhum: só cadastro e contagens.

## 6. Testar de ponta a ponta

Use um e-mail seu que **não** seja de nenhum corretor (por exemplo um Gmail
com `+teste`: `voce+teste1@gmail.com`).

**Convite pelo gestor (reversível):**

1. Painel → **Administração → Contas → Cadastrar corretor**, com o e-mail de
   teste → **Cadastrar e convidar**.
2. A tela deve dizer que o convite foi enviado (se mostrar o link para
   copiar, o e-mail não saiu: confira os passos 1 e 2 e o log da Vercel,
   procurando `[email]`).
3. Abra o e-mail **no celular** (outro aparelho é o teste que importa).
   Remetente `acesso@nexthomeimoveis.com`.
4. Toque no link → tela com o botão **Continuar** → toque → tela **Crie sua
   senha** → crie uma senha de 8+ caracteres → cai no painel.
5. Abra o MESMO link de novo: deve cair em "Este link já foi usado ou
   expirou", com o caminho do "Esqueci a senha" — nunca um erro genérico.
6. Saia, vá em **Esqueci a senha** na tela de entrar, peça o link para o
   e-mail de teste, e repita o passo 4.
7. Depois do teste: **Contas → desativar** o corretor de teste.

**Grupo novo pela plataforma:** em `/plataforma → Novo grupo`. Atenção:
nesta fase não há botão de apagar grupo — um grupo criado para teste fica.
Prefira testar este caminho já com o primeiro cliente de verdade, ou só
depois do teste do gestor ter passado.

Se algo falhar no meio da criação do grupo (ficha ou convite), o grupo é
desfeito sozinho e o endereço fica livre para tentar de novo. A tentativa
fica registrada em `admin_eventos` como `grupo_desfeito` (sem e-mail nem
nome, só o endereço e o passo que falhou).
