# Roadmap — Lista de transmissão pela API oficial da Meta (03/11/2026)

> Objetivo: mandar lista de transmissão para quem **nunca conversou** com o
> corretor sem pôr em risco o número de ninguém. Hoje toda lista sai pelo
> WhatsApp do próprio corretor, conectado pela Evolution (API não oficial),
> e é exatamente isso que o WhatsApp pune.

## Por que agora

- **A conta da Bruna foi restringida (07/10/2026)** por "mensagens
  automáticas ou em massa" no meio de uma lista fria de 300 (114 enviadas).
  Aquecimento e espaçamento estavam certos: o que o WhatsApp restringe é
  **primeira mensagem para quem nunca escreveu, saindo de número comum**.
  A conclusão registrada na MEMORIA foi: "massa segura só pela API oficial".
- Desde então o sistema se defende cortando volume: teto de primeiro contato
  de 10/dia e 30/semana por corretor (0222), lista que para sozinha, texto
  conferido. Isso protege o número, mas **impede o uso que o cliente quer**:
  reativar uma base fria de centenas de leads.
- A API oficial (WhatsApp Cloud API) é o caminho que a Meta permite para isso:
  mensagem iniciada pela empresa com **modelo aprovado**, para quem deu
  **consentimento**, com custo por mensagem e limites claros, em vez de
  bloqueio sem aviso.

## Como a Meta funciona hoje (conferido em 03/11/2026)

Fonte: documentação oficial da Meta para desenvolvedores, salvo onde está
marcado "revendedores". **Rever antes de cada fase**: essas regras mudaram
três vezes desde julho de 2025.

| tema | regra |
|---|---|
| **Cobrança** | Por mensagem **entregue**, por categoria e país do destinatário (desde 01/07/2025). Mensagem do cliente para a empresa é grátis. |
| **Preço no Brasil** | Marketing ≈ **R$ 0,32** (US$ 0,0625); utilidade e autenticação ≈ **R$ 0,035** (US$ 0,0068). O número de utilidade é da Meta; o de marketing veio de revendedores e precisa ser conferido na tabela oficial. |
| **Moeda** | Cobrança em **reais** liberada desde 16/07/2026; quem é do Brasil precisa migrar a conta para BRL até 30/06/2027. |
| **Janela de atendimento** | Quando o cliente escreve, abre uma janela de 24 h para respostas livres (mensagem de "serviço"). Desde **01/10/2026** são grátis só as **1.000 primeiras por número por mês**; depois são cobradas. Mensagem de utilidade dentro da janela também passou a ser cobrada. |
| **Anúncio Click-to-WhatsApp** | A conversa vinda do anúncio abre uma janela grátis de **até 7 dias** para tudo, inclusive marketing. |
| **Limite de envio** | Conta por **pessoas diferentes** contatadas fora da janela em 24 h, e vale para o **portfólio inteiro** (todos os números somados). Começa em **250**; sobe para **2.000** com a verificação da empresa (ou 2.000 entregas de qualidade em 30 dias); depois 10.000, 100.000 e ilimitado, subindo sozinho se a qualidade for boa e a empresa usar ao menos metade do limite em 7 dias. |
| **Limite por pessoa** | O WhatsApp limita quantos **modelos de marketing** uma pessoa recebe de **todas as empresas somadas**, conforme o quanto ela costuma ler. Bloqueado = erro **131049**; tentar de novo só depois de **24 h** (tentar antes piora). Se a pessoa responde, o que vai dentro da janela não conta. |
| **Modelo (template)** | Toda mensagem fora da janela precisa de um modelo **aprovado pela Meta**: texto fixo com variáveis (`{{1}}` = nome etc.), cabeçalho com foto opcional e botões. Categoria **marketing** para lista. |
| **Consentimento** | A política exige consentimento (opt-in) para mensagem iniciada pela empresa e respeito imediato ao pedido de parar. Bloqueios e denúncias derrubam a qualidade, e com ela os modelos e o limite. |
| **Coexistência** | Um número que já usa o **WhatsApp Business** (app) pode entrar na API e continuar no celular. Mas: **todos os aparelhos vinculados são desconectados** (é o caso da Evolution), listas de transmissão do app viram só leitura, **grupos não sincronizam**, velocidade fixa de 20 msg/s, e o número sai da API se o celular ficar ~14 dias inativo. Exige app 2.24.17+. |
| **Cadastro de clientes (Embedded Signup)** | Para uma plataforma como a Astro conectar o WhatsApp de cada cliente, é preciso ser **Tech Provider**: empresa verificada na Meta, App Review com dois vídeos e as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. O Embedded Signup v2 foi desativado em 15/10/2026; usar a **v4** (em prévia pública) ou a v3. |

## A decisão que define o resto: qual número vai para a API oficial

O número que entra na API oficial **sai da Evolution**: a coexistência
desconecta os aparelhos vinculados, e a Evolution é um deles. E a Evolution
não faz só a lista. Pelo número do corretor passam a recepção das
mensagens, a IA, o "digitando", os avisos e os **grupos de leads**
(`enviosDeLeadParaGrupo.ts`, `retornoPeloGrupo/`), que a API oficial não
sincroniza. Migrar o número do corretor é trocar o encanamento inteiro.

| | **A. Número oficial só para listas** (recomendado para começar) | **B. Número do corretor na API (coexistência)** |
|---|---|---|
| O que muda | Um número novo por imobiliária (chip novo), só na API oficial, que envia as listas e recebe as respostas | O WhatsApp de cada corretor passa a ser atendido pela API oficial; a Evolution sai |
| Risco ao que já funciona | **Nenhum**: o número do corretor, a IA, os grupos e o central seguem como estão | Alto: recepção, IA, grupos, "Número não está no WhatsApp" e histórico precisam ser refeitos |
| Quem o cliente vê | Um número da imobiliária na lista; o corretor assume depois, pelo número dele, com o cliente **já tendo respondido** | O próprio corretor |
| Esforço | ~4 a 6 semanas até o piloto medido | Meses, e depende do corretor usar o WhatsApp Business |
| Aprende o quê | Custo, taxa de resposta e qualidade, com dado real | — |

**Recomendação: A primeiro, B só depois do piloto, e só se o dado pedir.**
O fluxo A resolve exatamente o problema que derrubou a Bruna: a primeira
mensagem fria sai do número oficial; quem responde vira lead quente, e o
corretor entra em seguida pelo próprio número, falando com alguém que acabou
de responder (o que o WhatsApp não trata como envio em massa).

## O que já existe e ajuda

- **`src/lib/whatsapp/provider.ts` é o único ponto que fala com a Evolution**
  (30 arquivos passam por ele). A API oficial entra como um segundo
  adaptador ao lado, sem espalhar `if` pelo sistema.
- **O funil da lista já está pronto** (`campaignQueue.ts` +
  `campaignDispatcher.ts`): fila, janela 9h–20h59, pausa automática, pedido
  de parada, uma vez por telefone, proteção de 7 dias, A/B. O canal oficial
  reaproveita a fila e troca só o "como sai".
- **Consentimento já tem histórico** (`marketing_consentimentos` e
  `marketing_preferencias`, migration 0067), por finalidade e canal. Falta
  registrar o consentimento **para marketing no WhatsApp** e de onde veio.
- **O pedido para sair já é reconhecido** (`lead_pediu_para_sair`,
  `duvidaDeEngano.ts`), e a lista já para sozinha com pedidos demais.
- **`/api/webhooks/meta` já existe** (leads do Lead Ads, desde a F0 do
  `ROADMAP-META-ADS.md`): a verificação de assinatura e o app da Meta podem
  ser compartilhados.

## Fases

### F0 — Contas e decisões (dono do negócio, ~1 semana, sem código)

1. **Verificar a Next Home no Gerenciador de Negócios da Meta** (CNPJ e
   comprovante). Sem isso o limite fica em 250 pessoas por dia.
2. **Comprar um chip novo** para o número oficial de listas da Next Home.
   Não pode ser o central (11 96867-1127): ele está na Evolution e é o
   número que fala com a equipe.
3. Criar a conta do WhatsApp Business (WABA) e o app, cadastrar o número com
   o **nome de exibição** ("Next Home Imóveis"), que a Meta aprova.
4. **Forma de pagamento em reais** na conta de mensagens.
5. Decidir as três perguntas do fim deste documento.

> A Next Home é dona do próprio número, então o piloto **não precisa** de
> Tech Provider nem de Embedded Signup: integra direto, com um token de
> usuário do sistema. Tech Provider só entra na F5, para os outros clientes
> da Astro.

### F1 — Fundação técnica (~1 a 2 semanas)

- `src/lib/whatsapp/meta/`: cliente da Graph API (versão fixada em uma
  constante), `enviarModelo`, `enviarTexto` (dentro da janela),
  `enviarMidia`, leitura do webhook e verificação da assinatura
  `X-Hub-Signature-256` com o segredo do app.
- **Webhook** em rota própria (`/api/webhooks/whatsapp-oficial`): `GET` de
  verificação (token) e `POST` com mensagens recebidas e status (`sent`,
  `delivered`, `read`, `failed` com o código de erro).
- Migration:
  - `whatsapp_numeros_oficiais`: grupo, `waba_id`, `phone_number_id`,
    número, nome de exibição, limite atual, qualidade, estado;
  - `whatsapp_modelos`: grupo, nome, categoria, idioma, componentes, estado
    na Meta (aprovado, rejeitado, pausado) e motivo;
  - `whatsapp_campanhas_fila` ganha `canal` (`evolution` | `oficial`),
    `modelo_id`, `variaveis`, `wamid` (id da mensagem na Meta) e
    `erro_meta`.
- **Token fora do banco em texto puro**: no piloto, variável de ambiente;
  na F5, um token por cliente, guardado cifrado (Supabase Vault).
- Mensagens e status gravados em `whatsapp_mensagens`, como as da Evolution,
  para o Live Chat e os ✓✓ funcionarem igual.
- Regra da casa mantida: **nunca `enviado: true` sem o `wamid`** da Meta.

### F2 — A lista pelo número oficial (~1 a 2 semanas)

- **Modelos**: tela para criar o modelo (texto com `{{nome}}` e
  `{{imóvel}}`, foto do imóvel no cabeçalho, botões "Quero saber mais" e
  "Parar de receber"), enviar à Meta e acompanhar a aprovação. O webhook de
  estado do modelo avisa quando a Meta aprova, rejeita ou pausa.
- **No assistente da lista**, escolher por onde sai:
  - **Número oficial**: quem nunca conversou entra aqui; mostra o custo
    estimado (pessoas × R$ 0,32) antes de confirmar;
  - **Meu WhatsApp**: continua como hoje, com o teto de primeiro contato.
    Na prática, fica para quem já conversou.
- **O que muda no disparador para o canal oficial**:
  - sai o que só existe para proteger número comum: espaçamento de 1min30,
    aquecimento pelo uso, teto de 10 primeiros contatos por dia, reescrita
    pela IA (`variarSemRepetir`). **O modelo aprovado é o texto**; variar o
    texto não é mais permitido nem necessário;
  - fica o que é cortesia e regra do produto: janela 9h–20h59, proteção de
    7 dias, uma vez por telefone, pausa e cancelamento;
  - entra o que é da Meta: só quem tem **consentimento para marketing no
    WhatsApp** e não pediu para sair; teto pelo limite do portfólio;
    respeito ao 131049 (reagenda para 24 h depois, uma vez).
- **Erros da Meta** tratados como os da Evolution: número inexistente ou
  que não recebe (131026) vira erro definitivo; limite por pessoa (131049)
  reagenda; pessoa que parou de receber marketing (131050) vira opt-out no
  `marketing_preferencias`.
- **Consentimento**: registrar em `marketing_consentimentos` a finalidade
  `marketing` no canal `whatsapp`, com a origem (formulário do site com
  caixa marcada, anúncio, conversa). O botão "Parar de receber" e as
  palavras de saída revogam na hora.

### F3 — Resposta e passagem ao corretor (~1 semana)

- A resposta ao número oficial entra no CRM **no lead certo** e abre a
  janela de 24 h.
- **A IA responde dentro da janela**, com o mesmo motor de hoje (mensagem
  de serviço: 1.000 grátis por mês, depois paga). Ou, se a Next Home
  preferir, só uma resposta fixa ("Obrigado! O Rafael, que cuida desse
  imóvel, vai te chamar agora").
- **Aviso ao corretor dono do lead** (pelo central, onde estiver ligado):
  "Carla respondeu à lista do Dom Parque". O botão "Assumir pelo meu
  WhatsApp" abre a conversa no número dele, com o contexto.
- Lead que respondeu sai da fila de primeiro contato do corretor: ele já não
  é frio.

### F4 — Piloto medido (2 a 3 semanas, com 2 ou 3 corretores)

Medir, por lista, e comparar com as listas da Evolution:

| métrica | por quê |
|---|---|
| entregues / enviadas | número e base saudáveis |
| lidas e **respondidas** | o que importa para o corretor |
| pedidos para parar e bloqueios | a qualidade que a Meta mede |
| qualidade do número e do modelo na Meta | aviso antes da pausa |
| **custo por resposta** e por visita marcada | a conta que decide se escala |

**Portão para a F5**: qualidade alta, custo por visita aceitável para o
dono, e nenhuma pausa de modelo.

### F5 — Para todos os clientes da Astro (~3 a 4 semanas)

- **Tornar a Astro Tech Provider**: verificação da empresa, App Review com
  os dois vídeos (envio de mensagem e criação de modelo), acesso avançado às
  duas permissões.
- **Embedded Signup v4** no onboarding do cliente ("Conectar WhatsApp
  oficial"): o cliente cria ou escolhe a conta dele, verifica o número, e a
  Astro recebe acesso para enviar em nome dele.
- Um token e um número por cliente; cada um com o **próprio cartão** na
  Meta (ver a pergunta 1).
- **Planos**: hoje vendemos "1.000 / 2.500 mensagens de lista por mês" sem
  custo direto. Com o oficial, 2.500 mensagens de marketing custam cerca de
  **R$ 800 na Meta**. O limite do plano precisa virar "mensagens pelo seu
  WhatsApp", com o oficial cobrado à parte.

### F6 — Coexistência (opcional, só com dado do piloto)

Levar o número do próprio corretor para a API oficial, se o piloto mostrar
que o número separado atrapalha a venda. Antes de qualquer código:

- mapear tudo que depende da Evolution no número do corretor (grupos de
  leads, aviso no grupo, retorno pelo grupo, "digitando", conferir número,
  buscar histórico) e o substituto de cada um;
- confirmar quem usa **WhatsApp Business** (a coexistência não funciona com
  o WhatsApp comum);
- decidir número por número. Os grupos continuam sendo o ponto mais caro.

## Riscos

- **Base antiga sem consentimento.** Lead de portal ou de planilha antiga
  não disse "pode me mandar oferta no WhatsApp". Mandar para ele pelo
  oficial queima a qualidade do número e pode pausar os modelos. Mitigação:
  começar pelos leads com consentimento registrado e pedir consentimento
  nos formulários e anúncios a partir de agora.
- **Custo.** R$ 0,32 por mensagem de marketing é pouco por lead e muito por
  lista grande sem resposta. O custo estimado aparece antes de confirmar, e
  o piloto mede o custo por visita.
- **Modelo rejeitado ou pausado.** Texto genérico demais ou com muitas
  denúncias é pausado pela Meta. Mitigação: poucos modelos bons, foto real
  do imóvel, botão de sair visível.
- **Regras mudam.** Preço, limites e cadastro mudaram três vezes desde
  julho de 2025. Este documento registra o estado de 03/11/2026; conferir na
  documentação oficial no início de cada fase.
- **Embedded Signup v4 está em prévia pública.** Para a F5, conferir se já
  é estável ou usar a v3.

## Perguntas para o dono decidir antes da F1

1. **Quem paga a Meta?** (a) Cada cliente põe o próprio cartão na conta
   dele; a Astro cobra só a assinatura. (b) A Astro paga e revende as
   mensagens com margem. **Recomendação: (a)**, pelo menos até haver volume;
   (b) exige crédito com a Meta e cobrança por uso no Asaas.
2. **Um número oficial por imobiliária ou por corretor?** Recomendação:
   **por imobiliária** no piloto. O limite de envio é do portfólio inteiro
   de qualquer jeito, e um número só é mais simples de aprovar e de manter
   com qualidade.
3. **Quem responde no número oficial: a IA ou uma mensagem fixa?**
   Recomendação: **a IA**, com a passagem ao corretor na primeira resposta
   que mostre interesse. É o que já funciona no número do corretor.

## Fontes (conferidas em 03/11/2026)

- Meta, preços: <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>
- Meta, limites de envio: <https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits>
- Meta, limite por pessoa (131049): <https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/>
- Meta, coexistência: <https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users>
- Meta, Tech Provider: <https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers>
- Meta, Embedded Signup v4: <https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4-public-preview/>
- Preço de marketing no Brasil (revendedores, conferir na tabela oficial):
  <https://wabaindex.com/learn/whatsapp-api-pricing-brazil>,
  <https://whautomate.com/whatsapp-business-api-pricing-brazil>
