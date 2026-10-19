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
  (`<dominio>/corretor/<slug>`). O corretor independente é dono do site
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
| **1. Fundação** | Grupo no banco, Next Home como grupo 1, isolamento com teste de vazamento, ambiente de testes separado de produção |
| **2. Painel da plataforma e planos** | Cadastro de grupos, medidor único, cotas, cobrança manual, plano a preço de custo |
| **3. Sites por endereço** | Endereço gratuito, domínio próprio, portfólio editável, SEO e cache por site |
| **4. IA de cada grupo** | Nome, região, preço, tom, regras da casa |
| **5. Saída do corretor** | Etiqueta de origem, levar e devolver leads |
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
- **Ambiente de testes** separado de produção (banco e deploy). Hoje o E2E
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
  que carimba o grupo.
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
