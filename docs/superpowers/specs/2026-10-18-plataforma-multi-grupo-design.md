# Plataforma multi-grupo — desenho

> Data: 18/10/2026. Decisões tomadas com o Matheus em conversa. O que está
> marcado **(decisão do construtor)** foi escolha minha durante o desenho e
> pode ser revisto; o resto foi dito por ele.

## 1. Por que

O CRM foi validado como protótipo dentro de uma imobiliária só, a Next Home.
Agora ele vai ser vendido para outras imobiliárias e para corretores
independentes.

Isto **substitui** a decisão de 26/09/2026 ([[next-home-e-o-espelho-da-versao-geral]]),
que previa "uma instalação por cliente" (banco e projeto Vercel próprios por
cliente). Para corretor independente pagando por mês, uma instalação por
cliente custa mais do que ele paga e transforma cada migration em N
migrations. Passa a ser **uma plataforma só, com vários grupos**.

## 2. O modelo

- **Grupo** é a unidade de cliente. Uma imobiliária é um grupo, com quantos
  gestores e corretores ela quiser. Um corretor independente é um grupo de
  uma pessoa só.
- **Um login pertence a um grupo só.** Quem quiser estar numa imobiliária e
  também atender sozinho usa dois logins.
- Os papéis dentro do grupo continuam os dois de hoje: `gestor` e `corretor`.
  Acima de todos os grupos existe o **administrador da plataforma** (o
  Matheus), que não é papel de nenhum grupo.
- **Nenhum dado de um grupo aparece para outro**, em tela, API, cache, site
  público, busca, relatório ou e-mail. Esse é o requisito que, se falhar,
  acaba com o produto.

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Vender para imobiliárias e corretores independentes na mesma base de código
  e no mesmo banco.
- A Next Home vira o primeiro grupo, sem parar o atendimento dela.
- Cada grupo tem site próprio, IA própria, catálogo próprio e cota própria.

**Não-objetivos (ficam no radar, não entram agora)**
- Cobrança automática (cartão/Pix recorrente). Por enquanto o Matheus cobra
  por fora e marca como pago.
- Cadastro sozinho pelo site. Por enquanto o Matheus cria cada grupo.
- Concordância entre grupos alimentando o catálogo base (ver §8).
- Funil de qualificação configurável por grupo.
- Um login em vários grupos.

**Anti-objetivos (se acontecer, falhou mesmo funcionando)**
- Um gestor ou o administrador da plataforma conseguir ler conversa de
  WhatsApp de um corretor.
- Um dado (lead, imóvel, ficha, número) de um grupo vazar para outro.
- A Next Home ficar fora do ar ou perder atendimento durante a migração.
- Um cliente pagar mais do que viu na tela, ou a plataforma dar prejuízo em
  um cliente que usa a cota inteira.
- Uma mudança de catálogo de um grupo virar spam para os outros.

## 4. Privacidade (decisões firmes)

- **O gestor nunca lê conversa.** Ele vê a ficha do lead e os números da
  equipe. Isso já é a regra da Next Home desde a 0134 e vale para todo grupo.
  Vários gestores pediram o contrário; a decisão é não.
- **O administrador da plataforma também não lê conversa nem ficha.** O
  painel dele mostra cadastro e números de uso.
- **Consequência obrigatória: a ficha do lead tem de ser completa e
  confiável**, porque é tudo o que o gestor vê e é o que sobrevive quando o
  corretor sai. Melhorar a extração da ficha (`lead_observacoes_ia` + campos
  de `leads`) deixa de ser melhoria e vira requisito. Medida de referência:
  antes da limpeza de 12/09 eram 16 leituras para 131 leads, e quase nenhuma
  com orçamento.
- A plataforma só guarda conversa de quem é lead cadastrado (regra da 0111),
  para todos os grupos. Isso vira argumento de venda.

## 5. WhatsApp

- **O número é o pessoal de cada corretor**, conectado pela Evolution API,
  como hoje. A API oficial da Meta não conecta número pessoal.
  **Pendência:** conferir se a coexistência da API oficial com o app WhatsApp
  Business serve para algum caso; não contar com ela.
- As proteções anti-ban atuais valem para todos os grupos sem exceção:
  espaçamento, aquecimento pelo uso (0158), janela de horário, disjuntor.
- O contrato diz que o número e o risco de bloqueio são do corretor.
- A Evolution passa a hospedar centenas de instâncias: é infraestrutura que a
  plataforma opera e paga.
- Um mesmo número conectado em dois logins (dois grupos): cada mensagem cai só
  no grupo em que aquele cliente está cadastrado como lead. Se estiver nos
  dois, o desempate é **(decisão do construtor)**.

## 6. Sites e portfólio

**Um site só no código, respondendo por vários endereços.** O `proxy.ts` lê o
`Host` da requisição, resolve o grupo e todo o resto da renderização sai
daquele grupo: catálogo, marca, contatos, corretores, Pixel.

- Todo grupo nasce com um **endereço gratuito**
  (`<slug>.<dominio-da-plataforma>`), no ar no mesmo minuto do cadastro.
  O domínio da plataforma ainda não existe; é **pendência** do Matheus.
- O grupo pode ligar **domínio próprio** pela Vercel (Vercel for Platforms,
  certificado automático). `nexthomeimoveis.com` vira o domínio do grupo
  Next Home.
- **Página do corretor** dentro do site do grupo
  (`<dominio>/corretores/<slug>`; `/corretor/*` é o painel, exige login e o robots bloqueia). O corretor independente é dono do site
  inteiro. O mecanismo atual de link pessoal por cookie (`?corretor=`)
  continua valendo dentro do site do grupo.
- O que hoje está fixo como Next Home (`src/lib/site.ts`, `marca.ts`,
  `NEXT_PUBLIC_MARCA`, citado em dezenas de arquivos) passa a vir do grupo em
  cada requisição. `site` hoje é lido de forma síncrona inclusive no cliente;
  como resolver isso é **(decisão do construtor)**.
- **Cache separado por grupo**: toda etiqueta e chave de `unstable_cache`
  (`catalogo`, `corretores-publicos-v2`, …) leva o grupo. Sem isso o site de
  uma imobiliária mostra imóveis de outra.
- SEO, sitemap, robots, canonical, JSON-LD e Pixel da Meta são de cada site.
  Até existir Pixel por grupo (fase 7), o Pixel só carrega no site do grupo
  dono do ID; nos outros sites ele fica desligado.

**Portfólio: conteúdo livre, layout fixo.** O gestor edita o site da
imobiliária; o corretor edita a página dele dentro dele. Podem mudar: nome,
foto de fundo, textos, logotipo e cor dentro de uma paleta pronta. Ficam
iguais para todos: estrutura, fontes, espaçamento, e tudo o que já foi medido
(contraste, celular, velocidade). A paleta pronta passa pela guarda de
contraste existente (`npm run paleta`).

**Google.** Funciona por domínio, mas há três cuidados:
1. **Conteúdo duplicado.** Vários grupos publicando o mesmo lançamento com o
   mesmo texto faz o Google esconder a maioria. O fato do imóvel vem da base;
   **o texto de cada site é próprio de cada grupo**, com a IA oferecendo uma
   redação para quem não quiser escrever. Canonical nunca aponta para o site
   de outro grupo.
2. Endereço gratuito em subdomínio é indexado mas posiciona mal; domínio
   próprio é o recomendado.
3. Search Console por domínio; deixar a verificação pronta ao ligar o domínio
   próprio.

## 7. IA de cada grupo

Hoje a Sofia carrega coisas da Next Home: se apresenta como Next Home, fala
no estilo medido da Bruna (`estiloDaCasa.ts`), conhece só Barueri/Alphaville,
não fala preço (decisão comercial da Next Home) e segue o funil da Bruna.

**O grupo configura:**
1. Nome da assistente e nome da imobiliária (o nome por corretor já existe).
2. Região onde atua: cidades e bairros.
3. Fala preço ou não.
4. Tom: mais formal ou descontraído, com ou sem emoji.
5. Regras da casa em texto livre, valendo para a equipe toda. As regras por
   corretor (`regras_da_ia`, 0154) continuam e se somam às do grupo.

**Fica igual para todos (protege cliente e número):** não inventar dado do
imóvel; não prometer prazo nem valorização; não negar que é IA quando
perguntada; parar quando o cliente pedir; anti-ban.

**O funil fica fixo** na primeira versão (região → pronto/planta →
dormitórios → renda → indicação → convite → horário). Foi medido e funciona.

Os exemplos de estilo da Bruna não podem ir para o prompt de outro grupo.
Para um grupo sem exemplos próprios, o que entra no lugar é
**(decisão do construtor)**. O few-shot de conversas reais
(`recuperacao.ts`) só pode buscar conversas do próprio grupo.

## 8. Catálogo compartilhado (fase 6)

Até a fase 6, cada grupo cadastra e mantém o próprio catálogo, com as
ferramentas atuais (importar do site da construtora, PDF, Drive, tabela de
preços).

Na fase 6:
- Existe uma **base de imóveis da plataforma**. Cada grupo tem a **sua cópia**
  de cada imóvel que trabalha, e edita a cópia livremente.
- **Só fato do imóvel vira sugestão**: preço de tabela, planta, foto, data de
  entrega, endereço. O jeito de cada grupo trabalhar nunca sai dele: apelido,
  ordem no site, descrição escrita por ele, foto com a marca dele.
- **A base muda por fonte oficial**: site da construtora ou tabela de preços
  lidos de tempos em tempos (as leituras de hoje, rodando sozinhas). Fica no
  radar a **concordância**: mudança manual de um grupo só vai para a base
  quando um segundo grupo, sem ligação, fizer a mesma mudança.
- A sugestão chega numa **tela**, nunca como mensagem: **uma linha por
  imóvel** ("Dom Parque: preço e 2 plantas novas") com Aceitar tudo ou
  Recusar, e um contador no menu. A mais nova substitui a anterior. Só chega
  para quem tem aquele imóvel.
- **Nada muda no catálogo de um grupo sem o clique dele.** A recusa da
  maioria tira a sugestão do ar para quem ainda não respondeu.

## 9. Quando o corretor sai do grupo

- Todo lead nasce com uma **etiqueta de origem que ninguém edita depois**.
  - **Do corretor:** cadastrado por ele (palavra-chave ou à mão), importado
    por ele, chegado pelo link pessoal dele, indicado por ele, vindo de
    campanha paga por ele.
  - **Do grupo:** roleta, anúncio ou site da imobiliária, portal, importado
    ou repassado pelo gestor.
  - Hoje `leads.origem_atribuicao` cobre parte disso (roleta, link). A
    etiqueta nova precisa cobrir **todos** os caminhos de entrada e ficar sem
    `grant update`.
- A regra é a mesma quando ele sai por conta própria e quando é desligado.
- O que é dele vai com ele: para a conta de independente dele (criada na hora
  se não existir) ou para o novo grupo. Ele não perde acesso no meio.
- O que é do grupo fica e volta para a fila; o gestor repassa ou a roleta
  escolhe. **Quem herda recebe só a ficha, nunca a conversa.**
- Venda fechada fica nos registros do grupo; comissão paga ou devida continua
  visível para os dois.
- Mover dados entre grupos é a única operação que atravessa o isolamento: tem
  de ser uma função única no banco, auditada em `admin_eventos`.

## 10. Planos, cotas e medidor

**Todas as ferramentas em todos os planos; muda só a quantidade.** No código
não existe bloqueio de função, só medidor. Ferramentas de equipe (roleta,
ranking, financeiro de comissão) existem para todos, mas não aparecem num
grupo de uma pessoa, porque não servem a ninguém ali.

| | Essencial | Profissional | Imobiliária (por corretor) |
|---|---|---|---|
| Preço/mês | R$ 97 | R$ 147 | R$ 127 |
| Respostas da IA/mês | 1.000 | 2.000 | 1.500 |
| Artes de IA/mês | 30 | 100 | 50 |
| Vídeos/mês | 3 | 10 | 5 |
| Mensagens de lista/mês | 1.000 | 2.500 | 2.500 |
| Fotos e arquivos | 5 GB | 20 GB | 10 GB |
| Domínio próprio | 1 | 1 | 1 por imobiliária |

- **Números provisórios** até medir o custo real por resposta (estimativa de
  ~R$ 0,05 com a leitura da ficha; imagem já medida em R$ 0,03 rápida /
  R$ 0,21 boa). O formato é definitivo.
- No plano Imobiliária as cotas **somam na equipe**. Gestor que não atende
  não paga assento.
- Quando o cache de prompt da OpenAI estiver medido e o custo cair, o
  Profissional sobe para 3.000 respostas sem mudar o preço.
- **Mensagens de lista** têm dois limites: a cota do plano e a segurança do
  número (anti-ban, ~150/dia no máximo). A tela mostra os dois.
- **Plano a preço de custo**, só atribuível pelo administrador da plataforma,
  sem cota fixa: no fim do mês vale o custo medido (IA, imagem, vídeo) mais a
  parte do grupo no custo fixo. É o plano da Next Home, e serve para calibrar
  o preço dos outros.
- **Medidor único**: conta o uso de cada ferramenta por grupo e por mês e
  **reserva a vez antes de gastar**, atômico no banco (padrão da
  `reservar_cota_campanha` e da `reservar_credito_video`). Os medidores
  separados de hoje (teto de imagens/dia, créditos de vídeo, cota de lista)
  passam a ser este. Mês vira no fuso de São Paulo. Aviso aos 80%. Ao acabar:
  a IA para e avisa o corretor, ou ele compra pacote extra
  (500 respostas por R$ 39). Nunca cobra a mais sem ele ver.
- A tela "quanto já usei" existe para gestor e corretor.

## 11. Painel da plataforma

Só o administrador da plataforma acessa. Nele:
- cria o grupo, escolhe plano e endereço gratuito;
- cria o primeiro gestor (que convida o resto) ou o corretor independente;
- vê o uso de cada grupo por ferramenta;
- marca pagamento e suspende/reativa grupo.

Grupo tem `situacao` (ativo, suspenso, encerrado); encerrar está no §18,
fase Operação.

**Não vê conversa nem ficha.** Grupo suspenso: o que para e o que continua
(site, IA, login) é **(decisão do construtor)**, com a regra de que o cliente
final do grupo nunca recebe mensagem de erro da plataforma.

## 12. A Next Home como primeiro grupo

- Migração **no mesmo banco de produção**. Nada é copiado.
- Ordem, cada passo deixando a produção de pé:
  1. coluna de grupo em todas as tabelas, com o grupo Next Home como padrão,
     e todas as linhas existentes marcadas;
  2. código que lê e escreve o grupo;
  3. regras de isolamento (RLS) ligadas.
- `nexthomeimoveis.com` vira o domínio próprio do grupo Next Home.
- Plano a preço de custo.

## 13. Fases

| Fase | Entrega |
|---|---|
| **1. Fundação** | Grupo no banco, Next Home como grupo 1, isolamento com teste de vazamento, ambiente de testes separado de produção; isolamento também nas portas de entrada, nos scripts e nas telas do gestor (§18) |
| **2. Painel da plataforma e planos** | Cadastro de grupos, medidor único, cotas, cobrança manual, plano a preço de custo |
| **3. Sites por endereço** | Endereço gratuito, domínio próprio, portfólio editável, SEO e cache por site |
| **4. IA de cada grupo** | Nome, região, preço, tom, regras da casa |
| **5. Saída do corretor** | Etiqueta de origem, levar e devolver leads |
| **Operação e ciclo de vida** | Planos pagos, alertas, Evolution em escala, justiça entre grupos nos crons, encerramento de grupo, pedidos de titular (LGPD), retenção, exportação, site de vendas |
| — | **Pronto para o primeiro cliente externo** |
| **6. Catálogo compartilhado** | Base, cópias por grupo, sugestões por fonte oficial |
| **7. Integrações por grupo** | Meta Ads, Pixel, e-mail de portais, Gmail |
| **Radar** | Cobrança automática, cadastro sozinho, concordância entre grupos, funil configurável |

Cada fase tem plano próprio. A parte jurídica (termos de uso, contrato de
tratamento de dados LGPD, política de privacidade por site, risco do número,
responsabilidade pelo que a IA diz) corre em paralelo com advogado e não
trava código.

## 14. Requisitos técnicos que valem para todas as fases

- **Isolamento testado de verdade.** Teste automático que tenta ler, escrever
  e listar dados de outro grupo por cada caminho (RLS, views, funções
  `security definer`, chave de serviço, cache, site público) e reprova se
  conseguir. Roda no CI a cada push. As funções `security definer` e os usos
  da chave de serviço são os pontos onde a RLS não protege: cada um precisa
  receber e conferir o grupo explicitamente.
- **Ambiente de testes** separado de produção (banco e deploy). Na fase 1
  isso inclui o deploy: um projeto Supabase de testes e um ambiente da Vercel
  apontando para ele, para onde o E2E diário passa a apontar. Hoje o E2E
  roda contra produção; com dados de várias empresas isso deixa de ser
  aceitável.
- **Migrations reproduzíveis do zero.** As 158 migrations nunca foram
  aplicadas num banco vazio, e há objetos aplicados fora delas. O ambiente de
  testes é onde isso se prova.
- **Operação**: alertas quando algo cai, backup, e o CI precisa avisar quando
  fica vermelho (já ficou 15 dias sem ninguém ver).
- **Planos pagos**: Vercel Pro (o Hobby proíbe uso comercial) e Supabase Pro.
- Regras da casa continuam valendo: tabela nova revoga `anon` e
  `authenticated` antes de grant por coluna; view nova com
  `security_invoker`; toda descoberta vai para o vault e a MEMORIA.

## 15. Decisões tomadas na revisão (decisão do construtor)

Pontos levantados por uma leitura independente do desenho e resolvidos por
mim, para o Matheus conferir:

- **Leitura pública sai da chave `anon`.** Hoje o site lê catálogo e
  corretores (com WhatsApp) direto pela chave pública. Num banco único,
  qualquer um listaria imóveis e telefones de todos os grupos pelo
  PostgREST. A leitura pública passa a acontecer no servidor, escopada pelo
  grupo do `Host`, e o `anon` perde `select` direto nessas tabelas. Isso
  também é o que torna o cache por grupo confiável. As duas entradas públicas
  de escrita (formulário de lead e clique de WhatsApp) passam pelo servidor,
  que carimba o grupo — isso já na fase 1 (§18).
- **Dois logins são dois e-mails.** O Supabase Auth exige e-mail único.
- **Na saída, o login dele muda de grupo** (para a conta de independente ou
  para o novo grupo). Não nasce login novo.
- **Comissão depois da saída:** a linha dele em `venda_participantes` é
  copiada, congelada, para o grupo de destino no momento da saída. Nada lê
  através do isolamento depois disso.
- **Conversa na saída:** leads dele levam a conversa e a instância do número
  vai junto (o número é dele). Leads do grupo: a conversa é **apagada** da
  plataforma na transferência; a ficha fica. Guardar conversa que ninguém
  pode ler é dado sem leitor e só aumenta o risco de LGPD.
- **Gestor que paga assento:** quem tem número conectado ou lead na carteira
  em algum dia do mês.
- **Custo no pior caso** (cota inteira, artes todas na qualidade Boa,
  imposto de ~6%): Essencial ~R$ 70, Profissional ~R$ 144, Imobiliária
  ~R$ 105 por corretor. O Profissional empata no pior caso; a resposta da IA
  é mais de dois terços do custo de todo plano. Medir o custo real por
  resposta e o cache de prompt é o primeiro trabalho da fase 2, antes de
  publicar preço.

## 16. Perguntas abertas, com o padrão adotado até a resposta

O Matheus mandou seguir sem responder estas quatro. Vale o padrão abaixo,
que é **provisório** e pode mudar o plano quando houver resposta:

1. **Região do banco — decidido em 18/10: fica no Canadá (`ca-central-1`).**
   Decisão do Matheus, por dar menos trabalho. Custo aceito: o painel perde
   ~0,2–0,5 s por tela em relação a tudo em São Paulo (estimativa, não
   medida), e a função da Vercel continua em `iad1` (mudar só a função para
   `gru1` piora, ver MEMORIA de 13/09). Consequência jurídica: a política de
   privacidade e o contrato de tratamento de dados precisam declarar a
   transferência internacional; isso vai para o advogado e não trava código.
2. **Pacote extra.** **Padrão:** o pacote só libera depois que o Matheus
   marca como pago no painel da plataforma. Evita uso que ninguém pagou e
   respeita "nunca cobrar sem ele ver".
3. **Primeiro cliente externo.** Sem data e sem tipo definidos. **Padrão:**
   a ordem de fases do §13 vale como está.
4. **"O administrador não lê conversa".** **Padrão:** regra de produto e de
   contrato, não criptografia. Nenhuma tela do painel da plataforma mostra
   conversa ou ficha; o contrato diz que o operador só acessa para suporte,
   com consentimento do corretor, e todo acesso fica registrado em
   `admin_eventos`. Criptografar o conteúdo fica no radar (a IA precisa do
   texto aberto, o que torna isso um projeto à parte).

## 17. Deixado para o construtor

- Nome da tabela e da coluna (`grupos`, `grupo_id` são sugestão), e como o
  grupo chega às policies (função tipo `grupo_atual()` ao lado de
  `corretor_atual()`).
- Como o `site` deixa de ser constante síncrona.
- Desempate de lead cadastrado em dois grupos com o mesmo número.
- O que substitui os exemplos de estilo da Bruna num grupo sem exemplos.
- Comportamento de grupo suspenso.
- Formato da etiqueta de origem e o mapeamento de cada caminho de entrada
  atual para ela.
- Estrutura do ambiente de testes (branch do Supabase, projeto separado).
- Precedência entre nome e tom da assistente do grupo e os que já existem por
  instância de corretor.
- Na saída do corretor: mover a linha dele ou criar ficha nova no destino.

## 18. Lacunas cobertas na revisão de 19/10

Uma auditoria do código contra este desenho e o plano da fase 1 achou 88
lacunas (lista com evidência em `docs/superpowers/specs/2026-10-19-lacunas-multi-grupo.md`). Elas entram assim.
O código citado é o caminho de onde a mudança parte.

### Fase 1 — Fundação (o plano da fase 1 foi acrescido)

- **Gatilhos que gravam em outra tabela repassam o grupo.**
  `registrar_evento_lead_criado` (0065) e `vincular_campanha_meta_canonica`
  passam `new.grupo_id` para `marketing_eventos`, `event_outbox` e
  `marketing_campanhas`; o gatilho `meta_ads_campanha_canonica` é renomeado
  para rodar depois de `meta_ads_metricas_00_grupo`. Sem isso, com dois grupos,
  nenhum lead nasce.
- **A linha-mãe sai das FKs reais, não do nome da coluna.** Mapa
  `(tabela, coluna, tabela_mãe)` gerado de `pg_constraint`. Corrige
  `estudio_mensagens`/`consultor_mensagens` (`conversa_id` de outras tabelas),
  `meta_ads_metricas.campanha_id` (texto) e inclui `marketing_evento_id`,
  `entidade_id`, `parceiro_id`, `impulsionamento_id`, `lote_id`, `link_token`,
  `ator_id`/`alvo_corretor_id`. Valor sem linha-mãe → erro.
- **Todas as colunas-mãe são conferidas, não só a primeira**, e no UPDATE só
  as que mudaram. Fecha `anotacoes.destinatario_id` (vazava a nota pelo
  WhatsApp), `venda_participantes`, `leads.empreendimento_id`/`parceiro_id`,
  `imagens_geradas`, `video_jobs`, `whatsapp_campanhas_fila`,
  `estudio_mensagens`, `ativacoes_em_lead_alheio`.
- **Trocar o grupo de uma linha só pela role dona da função de transferência**
  (role `NOLOGIN`), nunca por variável de sessão.
- **Tabelas da plataforma:** `whatsapp_disparo_lock` e
  `whatsapp_diagnosticos` não têm grupo e não são lidas pelo usuário.
- **Administrador da plataforma no banco:** `administradores_da_plataforma` +
  `eh_admin_da_plataforma()`. Parâmetros de crédito passam a ser escritos só
  por ele (`atualizar_parametros_credito`, 0103).
- **Inativo perde acesso:** `grupo_atual()`, `corretor_atual()`, `eh_gestor()`
  e `getCorretorLogado()` ignoram corretor com `ativo = false`.
- **Portas de entrada leem dentro do grupo:** `processarEmailDeLead`
  (`src/lib/inbound/processarEmail.ts`), webhook da Meta
  (`api/webhooks/meta/route.ts`), palavra-chave (`repositorio.ts`
  `cadastrarPelaPalavraChave`), porteiro `/wa` e `/wa/<campanha>`
  (`sortear_corretor_whatsapp` ganha `p_grupo`), página do parceiro
  (`parceiros.grupo_id`), aviso de novidade (`crm/avisoDeNovidade.ts`).
- **Formulário e clique públicos gravam pelo servidor** (`api/leads`,
  `api/clique-whatsapp`), com `grupoDoSite()` e o corretor validado no grupo.
- **Leitura pública e catálogo da IA filtram o grupo já na fase 1**
  (`catalogo/cache.ts`, `queries.ts`), para o grupo de teste da fase 2 não
  aparecer no site da Next Home.
- **Chave de serviço sobre id do navegador:** `desconectarNumeroDoCorretor`,
  `trocarLinkDoParceiro` e `/api/imagens/gerar` (`midiaId`) conferem o grupo
  antes de agir.
- **Telas do gestor e views:** toda view ganha `grupo_id`; Visão geral,
  WhatsApp da equipe, Desempenho e Prontidão filtram pelo grupo da sessão.
- **Relatório semanal e aviso de espera** rodam por grupo.
- **Integrações da Next Home** (Meta, Gmail) ficam restritas ao grupo 1 até a
  fase 7; `meta_ads_metricas` é carimbada com o grupo 1.
- **Funções `security definer` com id no parâmetro** (créditos de vídeo, 0092)
  são revogadas do `authenticated` ou conferem o chamador; a guarda confere
  `pg_proc` no banco, não o texto das migrations.
- **Scripts com chave secreta** (`scripts/observatorio.ts`,
  `scripts/eval/*`, scripts de catálogo, SQL de diagnóstico) exigem `--grupo` e
  aceitam só o grupo 1; logs deixam de levar conteúdo de conversa.
- **Repositório público:** o E2E para de subir traços como artefato e o golden
  do eval deixa de exportar conversa real.
- **Ambiente de testes com deploy** e E2E diário fora de produção.
- **Realtime** entra na suíte de isolamento.
- **Telemetria e gravação de mensagem** deixam de engolir erro de insert.
- **Unicidade global** (slug de corretor, e-mail de acesso) é conferida por
  função que enxerga todos os grupos e só responde sim/não.
- **`catalogo_candidatos`** ganha grupo e chave única por grupo.
- **A sessão do painel carrega o grupo.**
- **Repasse de lead** grava a origem anterior em `lead_interacoes` antes de
  sobrescrever, para a etiqueta da fase 5.

### Fase 2 — Painel da plataforma e planos

- Gestor **cadastra e convida** corretor (hoje não existe insert em
  `corretores`; `admin/acoes.ts` só cria login para ficha existente).
- **Login** com e-mail real, convite e recuperação de senha, se a resposta à
  pergunta 2 for sim (`corretores/credenciaisIniciais.ts`).
- **Canal com o cliente pagante:** contato de cobrança do grupo, remetente da
  plataforma, chave de e-mail configurada (`src/lib/email.ts`).
- **Dados institucionais do grupo:** razão social, CNPJ/CPF, CRECI J ou F,
  endereço, telefones, redes, encarregado LGPD. Substituem `site.ts` no rodapé,
  no JSON-LD e na privacidade.
- **Slug do grupo** validado como nome de DNS, com lista de reservados.
- **Grupo de uma pessoa:** independente é gestor do próprio grupo; o menu
  esconde roleta, ranking e comissão por `grupos.tipo`; caminho de
  independente para imobiliária.
- **Ponto único "pode operar"** no webhook, nos crons e no disparador (corretor
  ativo, grupo ativo, cota), sem mandar contingência repetida ao cliente
  (`repositorio.ts` `resolverInstancia`, `aiAgent.ts` `textoDeContingencia`).
- **Medidor cobre toda chamada paga** (dossiê, transcrição, variação de lista,
  consultor, estúdio, tradutor, leituras de PDF/planta/preço/lista, e-mail de
  portal, classificação de fotos), grava tokens por grupo e não depende de
  linha que expira. Define o que continua quando a cota acaba.
- **Vazão da OpenAI:** prioridade (atendimento > lote > eval), chave separada
  para testes, crédito acabando avisa a plataforma e nunca manda o corretor
  "recarregar".
- **Armazenamento por grupo:** como somar bytes do Storage, órfãos e apagados.
- **Cobrança manual completa:** ciclo, pro rata, carência, troca de plano,
  faturas; registro diário de assento (número conectado ou lead na carteira).
- **Suporte:** canal, consentimento do corretor e registro em `admin_eventos`
  aceitando ator da plataforma.
- **Saúde por grupo** no painel da plataforma (ativação, número caído, IA
  calada, inadimplência).
- **Teto por corretor** dentro da cota somada da equipe.
- **Aceite de termos** por usuário antes de conectar o número.
- **Mesmo número em dois grupos**, conforme a pergunta 4: anti-bloqueio contado
  por telefone e dedup por instância, ou proibição.

### Fase 3 — Sites por endereço

- **Fora de requisição o grupo vem da linha** (instância → corretor → grupo),
  nunca do `Host`: `getEmpreendimentos`, `site` e `linkDaPagina` recebem o
  grupo; `dominioDoGrupo(grupoId)` monta todo link enviado ao cliente
  (`resolverMidia.ts`, `apresentacaoDigital.ts`, `aiAgent.ts`,
  `linksAcoes.ts`, `api/agenda`, `linkDeIndicacao.ts`, `campaignQueue.ts`).
- **Painel, login e infraestrutura no domínio da plataforma**: webhook da
  Evolution, retorno do OAuth, pg_cron e auto-disparo deixam de depender do
  domínio da Next Home; matcher do proxy cobre `api/`, sitemap e robots; Host
  desconhecido e previews têm regra.
- **Slug do corretor por grupo**; instância da Evolution identificada por id,
  nunca recalculada do slug (`whatsapp/acoes.ts`); `?corretor=` conferido
  contra o grupo do site.
- **`corretor_destaques`** passa a referenciar `empreendimento_id`.
- **Search Console por grupo**; sai o arquivo estático da Next Home de
  `public/`.
- **Porteiro reconhece a mensagem pronta de cada grupo**
  (`mensagensDoSite.ts`, `porteiro.ts`).
- **Marca do grupo fora do site:** painel, e-mails, sonda, GET do webhook,
  vídeo, carrossel, legenda, capa padrão, og-image, vinheta e fundos.
- **Regiões, mapa e globo** saem da configuração do grupo (`lib/regioes.ts`,
  `MapaInterativoClient.tsx`, `GloboImoveis.tsx`).
- **Páginas por token** usam o grupo do token e redirecionam Host divergente.
- **Cache de rota por Host** (segmento por grupo ou guarda que mantém as rotas
  dinâmicas).
- **Storage:** pasta e policy para a marca do grupo; material interno
  (referências, artes, books, rascunho) fora do bucket público.
- **Privacidade e termos por grupo**, com controlador, operador, transferência
  ao Canadá e Pixel só quando existe.
- **Redirecionamento permanente** do endereço gratuito para o próprio, e
  destino definido para links de grupo suspenso ou encerrado.
- **Migrations e scripts de catálogo** passam a localizar imóvel por grupo e
  id, não por slug; guarda.
- **Aposentar** a tela Marca (`NEXT_PUBLIC_MARCA`) e
  `docs/INSTALAR-NOVO-CLIENTE.md`.

### Fase 4 — IA de cada grupo

- **Ficha completa e confiável** (extração para `lead_observacoes_ia` e
  `leads`), pronta antes da fase 5.
- **`ModalDossieLead` mostra dados inventados** e é trocado pelo dossiê real
  (conserto que pode sair antes da fase).
- **Literais de Barueri e Alphaville** no funil, dossiê, alertas e estilo
  (`jogada.ts`, `aiAgent.ts`, `dossierExtractor.ts`, `brokerNotifier.ts`).
- **Segmento** (alto padrão, médio, econômico) entra entre os itens
  configuráveis; precedência entre grupo e instância.
- **IAs de marketing** (descrição do imóvel, variação de lista, legenda,
  tradutor, estúdio) seguem a configuração do grupo.
- **Evals por configuração** de grupo; `PROMPT_VERSAO` e fixture por grupo.
- **Fuso por grupo** na configuração de região (visita, cota, janela anti-ban,
  teto de imagem, ciclo de vídeo).

### Fase 5 — Saída do corretor

- Corretor só **exclui ou arquiva lead de origem dele**.
- Decidir entre **mover a linha do corretor** e criar ficha nova no destino.
- **Material de marketing e link pessoal** na saída: artes, vídeos, listas,
  impulsionamentos, destaques e o `?corretor=` já publicado.

### Fase 6 — Catálogo compartilhado

- Decidir se `catalogo_candidatos` vira a base da plataforma ou continua fila
  do grupo.

### Fase 7 — Integrações por grupo

- **Cofre de credenciais** por grupo; `refresh_token` do Gmail sai do texto
  puro.
- **Meta por grupo:** chave de `meta_ads_metricas` com grupo, conta canônica
  sem `legacy`, webhook roteado por `page_id`, cron por conta.
- **Gmail para clientes** depende da pergunta 10 (verificação do Google).

### Operação e ciclo de vida (fase nova, antes do primeiro cliente externo)

- **Planos pagos:** Vercel Pro e Supabase Pro.
- **Alertas e CI que avisa:** crédito da OpenAI, Evolution, worker de vídeo,
  crons com erro, CI vermelho.
- **Evolution em escala:** capacidade, backup das sessões, segredo de webhook
  por instância (a coluna já existe), limpeza das instâncias de quem sai.
- **Justiça entre grupos nos crons:** rodízio por grupo no disparador, nos
  follow-ups, nas respostas atrasadas, nas listas vivas e no Gmail; a trava
  global da roleta vira por grupo.
- **Render de vídeo:** fila com rodízio por grupo, ambiente de teste e destino
  conforme a pergunta 1.
- **Encerramento de grupo:** exportar e apagar linhas, Storage, instâncias,
  logins e tokens, com auditoria; prazo conforme a pergunta 7.
- **Pedido do titular (LGPD):** excluir lead apaga também `ia_correcoes`,
  `ia_interacoes.contexto`, fila de campanha, `inbound_logs` e documentos do
  Storage.
- **Retenção** por tipo de dado.
- **Exportação** dos dados do grupo e do titular.
- **Lixeira**, conforme a pergunta 8.
- **Pronto para vender:** domínio da plataforma, site de vendas, termos e
  privacidade da plataforma, conta de demonstração fora da produção.

## 19. Perguntas abertas da revisão de 19/10 (padrão provisório até a resposta)

**Respondidas pelo Matheus em 19/10:**

- **1 — Repositório:** pode ficar privado. O Matheus muda a visibilidade no
  GitHub. O render de vídeo no Actions passa a gastar minutos da cota do
  plano; as guardas da Task 10 (sem traço público, golden fora do
  repositório) continuam valendo.
- **2 — Login:** e-mail real de cada corretor, com convite e "esqueci a
  senha". Exige e-mail transacional configurado (hoje não há SMTP e o Resend
  está sem chave). Entra na fase 2, junto com a criação de grupo e o convite
  de equipe; o endereço inventado `nome@nexthome.com` deixa de ser criado.
- **3 — Domínio da plataforma:** comprado depois do primeiro pagamento de uma
  imobiliária. Até lá não há endereço gratuito por grupo: o primeiro cliente
  entra com o domínio próprio dele, e o painel segue no endereço atual.
- **4 — Mesmo número em duas contas:** proibido. Um número de WhatsApp só
  pode estar conectado em um grupo; a tentativa de conectar em outro é
  recusada com explicação. A trava mora no banco (número único entre
  instâncias de todos os grupos), na fase 2.

- **5 — Taxas do simulador:** cada imobiliária ajusta as dela. `parametros_credito`
  passa a ser por grupo já na fase 1; grupo novo nasce com cópia das taxas da
  Next Home (fase 2). O site de cada grupo simula com as taxas daquele grupo.
- **6 — Atraso:** suspensão automática no 5º dia de atraso, com aviso no
  painel desde o vencimento (fase 2).
- **7 — Cancelamento:** o cliente recebe a exportação dos leads e do catálogo;
  os dados ficam bloqueados por 90 dias (dá para reativar) e depois são
  apagados de vez (fase Operação).
- **8 — Exclusão de lead:** lixeira de 30 dias, com lead e conversa
  recuperáveis; depois disso, apagado de vez (fase Operação).
- **9 — Co-corretagem entre empresas:** permitida. Uma venda pode ter
  participante de outro grupo, por convite que o outro lado aceita; é uma
  exceção ao isolamento feita por função única e auditada em `admin_eventos`.
  O participante externo vê só a própria participação (imóvel, valor, a
  comissão dele), nunca o lead nem a ficha. Na fase 1 o banco ainda recusa;
  a exceção entra em fase posterior (junto da fase 5, que também atravessa
  grupos de forma controlada).
- **10 — Gmail:** só a Next Home por enquanto; os outros clientes usam o
  e-mail de encaminhamento dos portais.
- **11 — Aviso de IA:** como hoje — a IA não se anuncia e nunca nega quando
  perguntada. Confirmar com o advogado.

Todas as 11 perguntas estão respondidas; o texto abaixo é o registro de como
elas foram feitas.


Cada pergunta diz o que acontece até a resposta (o padrão que vale enquanto
isso) e qual lacuna depende dela.

1. **O repositório do GitHub pode ficar privado?** Hoje ele é público: os
   traços dos testes automáticos (com telas do painel) e trechos de conversas
   reais ficam baixáveis por qualquer pessoa. Fechar custa: o vídeo deixa de
   ser renderizado de graça no GitHub (passa a gastar minutos pagos).
   *Até a resposta:* a fase 1 para de publicar traços e conversas, mesmo com o
   repositório aberto. (L23, L79)

2. **O login do corretor vai ser o e-mail real dele, com convite e "esqueci a
   senha"?** Hoje o login é um endereço inventado (`nome@nexthome.com`, que é
   de outra empresa) com senha padrão que o gestor entrega, e só o gestor (ou
   você) consegue trocar a senha. Com várias imobiliárias, dois "João" em
   empresas diferentes não conseguem ter o mesmo endereço.
   *Até a resposta:* nada muda; o primeiro cliente externo não entra antes
   disso. (L85, L31, L32)

3. **Quando o domínio da plataforma será comprado, e o painel de todos os
   clientes pode morar nele (por exemplo `app.<dominio>`)?** Sem ele não há
   endereço gratuito para os grupos, e hoje o WhatsApp, os avisos e o login do
   Gmail de todos dependem de `nexthomeimoveis.com`, que é o domínio de um
   cliente. *Até a resposta:* a fase 3 não começa. (L45, L46, L84)

4. **O mesmo WhatsApp pode ficar ligado em duas contas (duas imobiliárias) ao
   mesmo tempo?** Permitir exige contar o limite anti-bloqueio pelo número e
   não pela conta (senão o número manda o dobro e corre mais risco de bloqueio).
   Proibir é bem mais simples e mais seguro.
   *Até a resposta:* proibido na prática, porque nenhum cliente externo entra
   antes da fase 2. (L86)

5. **As taxas do simulador de financiamento (juros, FGTS, faixas do Minha Casa
   Minha Vida, ITBI por cidade) são iguais para todas as imobiliárias e só você
   muda, ou cada imobiliária ajusta as dela?** Hoje qualquer gestor muda para
   todos.
   *Até a resposta:* iguais para todos, só você muda (fase 1). (L06)

6. **Cliente com mensalidade atrasada: quantos dias de tolerância antes de
   suspender?** *Até a resposta:* nenhuma suspensão automática; você suspende à
   mão. (L40)

7. **Quando um cliente cancela, por quanto tempo os dados dele ficam guardados
   antes de serem apagados (e ele recebe uma cópia)?** *Até a resposta:* nada é
   apagado sem você pedir. (L80, L83)

8. **Lead excluído some na hora ou vai para uma lixeira por alguns dias (por
   exemplo 30)?** Hoje some na hora, com a conversa junto, e com várias empresas
   no mesmo banco não dá para recuperar o erro de uma sem voltar o banco de
   todas. *Até a resposta:* continua sumindo na hora. (L88)

9. **Uma venda pode ser dividida entre corretores de imobiliárias diferentes
   (co-corretagem entre empresas)?** *Até a resposta:* não; o banco recusa um
   participante de outro grupo. (L03)

10. **Vale pagar a verificação anual do Google para oferecer "ler leads do
    Gmail" aos clientes, ou o Gmail fica só para a Next Home?** Sem a
    verificação, o acesso de quem não é da Next Home vence a cada 7 dias.
    *Até a resposta:* só a Next Home. (L87)

11. **(Para o advogado)** O cliente final deve ser avisado logo no começo da
    conversa no WhatsApp de que ela é guardada e lida por IA, ou basta a IA não
    negar quando perguntada? *Até a resposta:* vale a regra de hoje (não nega
    quando perguntada). (L58)
