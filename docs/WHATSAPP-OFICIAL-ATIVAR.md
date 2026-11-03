# Como ligar a lista pelo número oficial (F0)

Guia do dono para tirar do papel o que o código já tem (03/11/2026). O
porquê está em `docs/ROADMAP-WHATSAPP-OFICIAL.md`; o que muda no número do
corretor, em `docs/WHATSAPP-OFICIAL-COEXISTENCIA.md`.

**Nada disto foi feito em produção.** O código está na branch
`ccr-7424dca4-4nynlp`; a migration 0254 não foi aplicada; nenhuma variável
foi criada na Vercel; nenhuma mensagem real saiu. Enquanto os passos abaixo
não forem feitos, o canal oficial fica desligado sozinho (o webhook responde
503, a tela diz o que falta e as listas continuam saindo só pelo número do
corretor, como hoje).

Decisões já tomadas (podem ser revistas no relatório): cada imobiliária paga
a Meta com o próprio cartão; um número oficial por imobiliária; quando o
cliente responde, a IA atende pelo número oficial até o corretor assumir.

## O que você precisa ter à mão

- O portfólio empresarial da Next Home no Meta Business (o mesmo dos anúncios serve).
- Documentos da empresa para a verificação (cartão CNPJ e um comprovante com o mesmo endereço/razão social).
- **Um chip novo, só para isto.** Número que já está no WhatsApp (comum ou Business) não entra na Cloud API sem antes sair do app — e o número pessoal de corretor nunca deve ser usado aqui.
- Cartão de crédito da empresa (cobrança em reais).
- Acesso de administrador ao projeto na Vercel e ao Supabase de produção.

## Passo a passo

### 1. Verificar a empresa na Meta
Meta Business → Configurações → **Central de Segurança → Verificação da
empresa**. Sem a verificação o limite fica em 250 pessoas novas por dia e o
nome de exibição demora mais. Leva de 1 a 5 dias úteis.

### 2. Criar (ou reaproveitar) o app
developers.facebook.com → Meus apps → Criar app, caso de uso **"Conectar-se com
clientes pelo WhatsApp"**, ligado ao portfólio da Next Home. Se for o mesmo app
do Lead Ads, o segredo do app já está na Vercel como `META_APP_SECRET`.

### 3. Pôr o chip na conta do WhatsApp Business (WABA)
No app: WhatsApp → **Configuração da API** → Adicionar número. Nome de exibição
(ex.: "Next Home Imóveis" — a Meta aprova), categoria, código por SMS. Anote os
dois ids que a tela mostra: **id do número** (phone number id) e **id da conta**
(WABA id).

Se o número aparecer como pendente, registre-o na Cloud API com um PIN de 6
dígitos que você escolhe e guarda (é a verificação em duas etapas do número):

```bash
curl -X POST "https://graph.facebook.com/v26.0/<ID_DO_NUMERO>/register" \
  -H "Authorization: Bearer <TOKEN_DO_PASSO_5>" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"<PIN_DE_6_DIGITOS>"}'
```

### 4. Forma de pagamento
WhatsApp Manager → **Configurações de pagamento** → adicionar o cartão, moeda
BRL. Sem isso a Meta recusa modelo de marketing.

### 5. Token permanente (usuário do sistema)
Configurações do negócio → Usuários → **Usuários do sistema** → Adicionar
(Admin). Atribuir ativos: o app (controle total) e a conta do WhatsApp
(controle total). Gerar token: o app, validade **Nunca**, permissões
`whatsapp_business_messaging` e `whatsapp_business_management`. Esse é o
`WHATSAPP_OFICIAL_TOKEN`.

### 6. Webhook
No app: WhatsApp → **Configuração** → Webhook:

- URL de retorno: `https://<domínio de produção>/api/webhooks/whatsapp-oficial`
- Token de verificação: um texto inventado — o mesmo vai em `WHATSAPP_OFICIAL_VERIFY_TOKEN`
- Campos a assinar: `messages`, `message_template_status_update`,
  `message_template_quality_update`, `phone_number_quality_update`,
  `account_update`, `user_preferences`.

A Meta só verifica a URL depois que o passo 7 estiver no ar. Publique o app
(modo **Ao vivo**; pede a URL da política de privacidade) — em modo de
desenvolvimento a Meta pode entregar só os webhooks de teste. O cadastro do
número no painel (passo 9) liga as notificações da conta
(`/{waba}/subscribed_apps`); se ele avisar que não conseguiu, rode:

```bash
curl -X POST "https://graph.facebook.com/v26.0/<ID_DA_CONTA_WABA>/subscribed_apps" \
  -H "Authorization: Bearer <WHATSAPP_OFICIAL_TOKEN>"
```

### 7. Variáveis na Vercel (Production) — e um novo deploy
Todas estão comentadas no `.env.example`:

| Variável | O que é |
|---|---|
| `WHATSAPP_OFICIAL_TOKEN` | o token do passo 5 |
| `WHATSAPP_OFICIAL_APP_SECRET` | segredo do app (vazio = usa `META_APP_SECRET`) |
| `WHATSAPP_OFICIAL_VERIFY_TOKEN` | o texto do passo 6 |
| `WHATSAPP_OFICIAL_CHAVE_CIFRA` | `openssl rand -base64 32` (só a F5 usa, mas já deixe) |
| `WHATSAPP_OFICIAL_APP_ID` | id do app (opcional se houver `NEXT_PUBLIC_META_APP_ID`) |

Variável nova só vale depois de um deploy.

### 8. Migration 0254 no banco de produção
Pelo processo de sempre (skill local `aplicar-migration-producao`). Antes,
confira: a **0253 é da branch `prospeccao`** e está reservada no teste de
numeração; a 0254 é desta. Ela cria cinco tabelas só do servidor, as colunas
`canal`/`numero_oficial_id`/`modelo_oficial_id` em `whatsapp_campanhas`, o rastro
da Meta na fila, a função de consentimento e tira a lista oficial da cota de
mensagens do plano. É reaplicável. O código no ar sem ela não quebra
(conferido): as listas seguem pelo número do corretor.

Ordem recomendada: migration → variáveis → deploy da branch → passo 9.

### 9. No painel
**Administração → WhatsApp oficial** (só gestor):

1. Cadastrar o número com os dois ids do passo 3 (só o grupo da Next Home pode
   cadastrar à mão; as outras imobiliárias usam o botão da Meta, F5).
2. "Atualizar dados da Meta": traz qualidade e limite.
3. Decisões: corretores podem usar ou só o gestor; teto de mensagens no mês;
   quem responde (IA, mensagem fixa ou ninguém).
4. Modelos: escrever, mandar para aprovação, esperar "Aprovado" (minutos a 24 h).
   Modelo de marketing exige o botão "Parar de receber".

### 10. Teste pequeno antes de qualquer lista de verdade
- Dois ou três leads internos (gente da equipe). Na ficha de cada um, em
  **Número oficial da imobiliária**, registrar "autorizou ofertas" — **só entra
  na lista oficial quem tem a autorização gravada**.
- Campanhas → nova lista → **Por: Número oficial** → o modelo aprovado.
- Conferir em **Medição do piloto**: enviadas, entregues, lidas, respostas, quem parou, custo estimado.
- Responder pelo celular → a conversa aparece na ficha do lead, o corretor dono
  é avisado no celular; testar "Assumir pelo meu WhatsApp" e o botão "Parar de
  receber" (o lead sai das listas e a autorização é revogada).

## O que olhar no piloto (a régua da F4)

A tela de medição mostra o "portão" do roadmap para abrir aos clientes (F5):
o sistema confere sozinho a qualidade do número (verde), nenhum modelo pausado
e haver lista oficial medida. O **custo por resposta e por visita** aparece ao
lado, com a taxa de resposta das listas pelo número do corretor no mesmo
período para comparar — se esse custo é aceitável é decisão sua, não do
sistema. Se a qualidade cair para amarela, pare e revise público e texto antes
da próxima lista.

## Para os clientes da Astro (F5) — quando o piloto passar

O botão "Conectar WhatsApp oficial pela Meta" já está na tela, escondido até
existirem as duas variáveis abaixo. Antes disso, a Astro precisa virar **Tech
Provider** da Meta:

1. Verificação da empresa da Astro no portfólio dela.
2. Revisão do app (App Review) com acesso avançado a
   `whatsapp_business_management` e `whatsapp_business_messaging`.
3. Facebook Login for Business → Configurações → nova configuração do
   **Embedded Signup** (WhatsApp) → o id dela vai em `NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID`.
4. Domínio de produção nos domínios permitidos do SDK JavaScript do app.
5. `NEXT_PUBLIC_META_APP_ID` com o id do app e `WHATSAPP_OFICIAL_CHAVE_CIFRA`
   definida (o token de cada cliente é guardado cifrado).

Cada cliente conecta o próprio número e põe o próprio cartão na janela da
Meta. A tela mostra uma vez o PIN de duas etapas que o sistema gerou: o gestor
do cliente precisa anotar.
