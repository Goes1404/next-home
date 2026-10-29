# SaaS financeiros brasileiros para pequenas empresas (Conta Azul, Omie, Nibo, Bling, Granatum, Contabilizei): o que inspira o financeiro de um CRM de imobiliária

> Pesquisa feita em 29/10/2026. Fontes primárias: centrais de ajuda (ajuda.contaazul.com, ajuda.omie.com.br, intercom.help/niboajuda, aegro.com.br/suporte) e páginas oficiais de produto e de preço (contaazul.com, pluggy.ai). Reclame Aqui, B2B Stack e lojas de app entram como sinal de reclamação, não como estatística. Algumas perguntas ficaram sem fonte primária; estão marcadas em "Gaps". Itens sem link na seção "Inferências" são raciocínio meu e não fatos pesquisados.

## 1. Conciliação bancária: canais (OFX, Open Finance, API do banco, CNAB), lógica de match e agregadores

### Takeaway
Em 2026 o padrão é a conexão por Open Finance (normalmente via agregador como a Pluggy) com importação diária do dia anterior, mais o OFX como alternativa manual. O match é determinístico: valor exato, data com janela de ±3 a 5 dias, CPF/CNPJ e soma de grupos. O usuário confirma numa tela de duas colunas. A conciliação totalmente automática fica restrita ao match "exato" ou ao dinheiro que passa pela conta digital do próprio ERP. Um agregador custa no mínimo cerca de R$ 2.500/mês, o que é caro para quem está começando.

### Cited Findings
**Canais de entrada**
- Conta Azul: depois de conectar a conta, as movimentações são importadas automaticamente "todos os dias", e dá para conectar contas de bancos diferentes. A página lista "Open Finance", "OFX" e "importação de PDF com IA" como canais, mas não detalha nenhum deles. — [Conta Azul, conciliação bancária](https://contaazul.com/funcionalidades/conciliacao-bancaria)
- Conta Azul: quem recebe e paga pela própria Conta Digital da Conta Azul tem conciliação automática. — [Conta Azul, conciliação bancária](https://contaazul.com/funcionalidades/conciliacao-bancaria)
- Conta Azul: a importação por OFX continua disponível para quem não usa a conexão automática. — [Conta Azul, importar OFX](https://contaazul.com/funcionalidades/importar-arquivo-ofx/)
- Conta Azul + Banco do Brasil: a integração direta com o BB, anunciada como pioneira em open banking, é notícia antiga. — [Jornal Contábil](https://jornalcontabil.com.br/noticia/contaazul-integra-sua-plataforma-com-o-banco-do-brasil-para-facilitar-vida-das-pequenas-empresas/)
- Nibo: com a "Importação automática de extrato bancário" ativa, o sistema importa toda manhã as transações do dia anterior. Há dois modos:
  - **Open Finance via Pluggy**: só o administrador da conta autoriza, e a maioria das transações vem com CPF/CNPJ da contraparte, o que ajuda a conciliar. Transações de fim de semana podem vir com data diferente da do extrato.
  - **Conexão direta**: só para alguns bancos (Inter e Cora são citados) e exige credenciais de uma integração criada no banco.

  Na configuração o usuário informa a data "Importar a partir de" e o saldo nessa data, e a conta passa a exibir o selo "Conectada Open Finance". Há um limite de 4 consentimentos por mês por credencial e instituição. O acesso é somente leitura. — [Nibo Ajuda, automatizar contas bancárias](https://intercom.help/niboajuda/pt-BR/articles/7888649-como-automatizar-suas-contas-bancarias)
- Omie: a integração bancária automática do artigo de ajuda cobre só Caixa, Itaú e Safra. O caminho é Finanças > Movimentação de Contas Correntes > Importar Extrato > Buscar Automaticamente. — [Omie Ajuda, extrato integrado](https://ajuda.omie.com.br/pt-BR/articles/2495094-conciliacao-bancaria-com-o-extrato-do-banco-integrado-ao-omie). Conflito: o marketing da Omie diz que tem integração automática "para os principais bancos brasileiros" e OFX para os demais. O artigo de ajuda pode estar desatualizado. — [Omie, funcionalidade conciliação](https://www.omie.com.br/funcionalidades/conciliacao-bancaria/)
- Omie: os arquivos aceitos são OFX e "Money 2000"; CSV/XLSX só para Citibank e carteiras virtuais. O arquivo importado não fica guardado: para conciliar em etapas é preciso importar de novo, mas o que já foi feito continua salvo. O FAQ não menciona CNAB. — [Omie Ajuda, FAQ conciliação](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria)

**Lógica de match e sugestão**
- Omie classifica cada linha do extrato por indicador visual ("barrinhas"):
  - "Lançamento encontrado": mesma data e mesmo valor;
  - "Grupo parecido/muito parecido": a soma de vários lançamentos bate com o valor;
  - "Aproximado pelo valor": margem de ±10%;
  - "Aproximado pela data": mesmo valor, D-3 a D+3;
  - "Não encontrado".

  Quando há sugestão, ela aparece num painel lateral e o usuário clica em "Conciliar este lançamento". Quando não há, ele escolhe entre "Buscar e associar a um lançamento que já existe" (filtro de período e margem de valor, com aplicação de juros, multa ou desconto), "Adicionar como um novo lançamento" (para tarifas; só a categoria é obrigatória) ou "Adicionar uma nova conta a receber/pagar" (cria o título já baixado e conciliado). — [Omie Ajuda, extrato integrado](https://ajuda.omie.com.br/pt-BR/articles/2495094-conciliacao-bancaria-com-o-extrato-do-banco-integrado-ao-omie)
- Omie, conciliação automática:
  - exige CNPJ/CPF válido;
  - o tipo de documento tem de casar com o meio de pagamento (um título cadastrado como boleto e pago via Pix não concilia sozinho);
  - quando há vários títulos com o mesmo vencimento, ganha o de valor exato;
  - as categorias precisam ter o "Tipo de Gasto/Receita" configurado;
  - só considera os últimos 5 dias de extrato.

  — [resumo da busca sobre a Ajuda Omie, Omie.Cash](https://ajuda.omie.com.br/pt-BR/articles/6803720-guia-de-configuracoes-para-a-conciliacao-na-omie-cash-conta-completa)
- Omie: uma linha do extrato pode ser ligada a vários lançamentos (1:N). O caminho contrário (N:1) não existe; a alternativa é ignorar as linhas, lançar manualmente ou usar baixa parcial. Também não é possível conciliar receita com despesa, e as linhas ignoradas não deixam histórico visível. — [Omie Ajuda, FAQ](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria)
- Omie, convenção de ícones: cinza = sem baixa; vermelho = baixado mas não conciliado. "Data de Débito" (no banco) e "Data de Pagamento" (informada) são campos distintos em contas a pagar. — [Omie Ajuda, FAQ](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria)
- Aegro (ERP agro, citado como referência de UX atual): tem um "agente de conciliação" com dois níveis.
  - "Exato": valor ao centavo, data até 5 dias e candidato único dos dois lados.
  - "Sugerido": par provável.

  O usuário escolhe entre "Só quando for certeza" e "Também quando for provável". O agente roda a cada extrato novo vindo do Open Finance. O que ele não resolve fica pendente. Existe auditoria ("Ver execuções": lidos, conciliados, pendentes, falhas) e uma aba que mostra cada conciliação com o seu nível de confiança. Há também um artigo próprio sobre categoria sugerida pelo histórico. — [Aegro, agente de conciliação](https://aegro.com.br/suporte/financeiro/agente-de-conciliacao-bancaria-concilia-o-extrato-sozinho/); [Aegro, categoria pelo histórico](https://aegro.com.br/suporte/financeiro/categoria-sugerida-pelo-historico-na-conciliacao-open-finance/)
- Conta Azul: os lançamentos sugeridos ficam pendentes em Financeiro e o usuário confirma em "Conciliar". O marketing cita "IA para acelerar conciliação", "Regras para automatizar conciliação" e "Conciliação em lote", sem explicar como funcionam, e promete economia de "até 20h por mês" (número não verificado). — [Conta Azul, conciliação bancária](https://contaazul.com/funcionalidades/conciliacao-bancaria); [Conta Azul, tutorial](https://contaazul.com/tutoriais/como-fazer-conciliacao-bancaria-na-conta-azul)
- Nibo: a tela de conciliação tem duas colunas, com as transações do banco de um lado e as ações no sistema do outro. — [vídeo Nibo "Conciliação – Parte 1"](https://videohighlight.com/v/ZHEeq_2Gatg)
- Boa prática de regras (fonte genérica): regras específicas ficam acima das genéricas, porque a ordem importa. Também é preciso separar "categorizar" (criar um lançamento novo) de "conciliar" (vincular a um lançamento existente), para não duplicar. — [Beancount blog, bank feed rules](https://beancount.io/pt/blog/2026/05/17/bank-feed-rules-automate-transaction-categorization-recurring-payments-vendor-matching-without-books-drifting)

**Agregadores, custo e mercado**
- Pluggy, preços oficiais:
  - Plano "Dados" a partir de R$ 2.500/mês, com até 500 conexões ativas. Inclui Open Finance e acesso direto a contas, extratos, saldo, cartões e investimentos, além de webhooks, enriquecimento, categorização e identificação de recorrências.
  - Plano "Pagamentos" a partir de R$ 500/mês: iniciação de Pix, cobrança por QR/link, Pix Automático e cash management.
  - Excedente cobrado por requisição (valor não publicado). Teste de 15 dias em produção, sem cartão.
  - "MeuPluggy" gratuito, até 5 conexões, só para uso próprio e sem SLA.

  — [Pluggy, pricing](https://www.pluggy.ai/pricing)
- A Pluggy é o agregador por trás do Open Finance do Nibo. — [Nibo Ajuda](https://intercom.help/niboajuda/pt-BR/articles/7888649-como-automatizar-suas-contas-bancarias)
- Fontes secundárias dizem que a Pluggy atende mais de 250 ERPs e sistemas contábeis e se posiciona como substituta da importação manual de CNAB/OFX. — [Let's Money](https://www.letsmoney.com.br/noticias/pluggy-serie-a-embarcar-bancos-erps/); [PortalERP](https://portalerp.com/br/empresa/pluggy). A mesma linha de fontes cita licença ITP do BC e mais de 130 instituições. — [parse.gl](https://www.parse.gl/brands/pluggy-ai) (não verificado)
- A Conta Azul comprou a Mister Contador (anúncio de 24/07/2026), uma plataforma de automação de escrituração que processa extratos de mais de 160 bancos e é usada por mais de 3.000 equipes contábeis. — [Baguete](https://www.baguete.com.br/noticias/conta-azul-adquire-mister-contador)

### Inferências
- Para uma imobiliária com 1 a 3 contas PJ, Open Finance próprio via Pluggy (mínimo de R$ 2.500/mês) só se paga com dezenas de clientes conectados. A ordem que faz sentido:
  1. **OFX upload no celular/desktop** primeiro (custo zero);
  2. **conexão direta** com bancos digitais que oferecem API própria (Inter e Cora, como no Nibo);
  3. Pluggy só quando a base justificar.
- O algoritmo de match a copiar é o da Omie e da Aegro, que é determinístico e explicável: valor exato + janela de ±3 a 5 dias + CPF/CNPJ + candidato único resulta em "Exato" (pode ser automático). Valor ±10% ou soma de grupo resulta em "Sugerido" (pede confirmação). Isso combina com o chat do CRM, que só responde com números pré-calculados: a conciliação também não deve "adivinhar".
- Recebimentos de comissão costumam chegar como TED/Pix da construtora ou do vendedor, com CNPJ identificável. Vincular o CNPJ da contraparte à venda permitiria match de alta confiança.
- O gargalo "boleto pago via Pix não concilia" da Omie mostra que o match não deve depender do tipo de documento.
- O 1:N (um crédito pagando várias parcelas ou comissões) é importante. O N:1 pode esperar.

### Gaps
- Não achei documentação oficial de "regras de conciliação" do Conta Azul nem do Nibo (condições do tipo "descrição contém X → categoria Y"). Os dois só citam o recurso no marketing.
- Preços e complexidade de Belvo e Celcoin não foram pesquisados. Também não confirmei o valor do excedente por requisição da Pluggy.
- Não achei fonte sobre CNAB (retorno de boleto) nos produtos pesquisados para PME.
- A lista atual de bancos do Omie conflita entre a página de ajuda e o marketing.

## 2. Regime de competência x caixa: como mostram os dois e quais datas cada lançamento carrega

### Takeaway
Todos os produtos pesquisados guardam três datas por lançamento: competência, vencimento e pagamento/baixa, e às vezes uma quarta, a data de débito no banco. A DRE lê a competência e o fluxo de caixa lê a data de pagamento, em relatórios separados. Há exceções documentadas: juros, descontos e taxas entram na DRE pela data de caixa, e uma renegociação muda a competência.

### Cited Findings
- Conta Azul:
  - a DRE usa regime de competência, ou seja, a data em que o compromisso foi assumido, e não a de pagamento ou recebimento;
  - o Fluxo de Caixa usa a data de pagamento/recebimento;
  - exceção: "taxas, descontos, juros e perdas" seguem regime de caixa dentro da DRE;
  - numa renegociação, a competência passa a ser a data em que a renegociação foi gerada.

  — [Conta Azul Ajuda, como interpretar o DRE Gerencial](https://ajuda.contaazul.com/hc/pt-br/articles/7685448113165-DRE-como-interpretar-o-DRE-Gerencial)
- Conta Azul: as comissões do período entram em "Comissões Sobre Vendas" na DRE, tenham sido pagas ou não. — [Conta Azul Ajuda, grupos da DRE](https://ajuda.contaazul.com/hc/pt-br/articles/45703032716429-DRE-o-que-cada-grupo-de-receita-dedu%C3%A7%C3%A3o-e-custo-operacional-representa-no-DRE)
- Bling: a DRE usa o campo "data de competência" de contas a receber, contas a pagar e registros de caixa, e ignora lançamentos de caixa do tipo saldo. O fluxo de caixa usa a data efetiva da movimentação. Página acessada só pelo resumo da busca; o fetch retornou 403. — [Bling Ajuda](https://ajuda.bling.com.br/hc/pt-br/articles/360044185094)
- Omie: em contas a pagar, "Data de Débito" e "Data de Pagamento" são campos separados e aparecem na aba "Pagamentos". — [Omie Ajuda, FAQ](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria)
- Conta Azul (blog): despesa incorrida é registrada no período em que é gerada, e não quando é paga. — [Conta Azul blog, despesa incorrida](https://contaazul.com/blog/despesa-incorrida/)

### Inferências
- Modelo mínimo sugerido para cada lançamento do CRM:
  - `data_competencia`: para venda/comissão, a data da assinatura da escritura/contrato ou do aceite, conforme a política da imobiliária;
  - `data_vencimento`;
  - `data_pagamento`: quando foi baixado;
  - `data_extrato`: opcional, vinda da conciliação.

  O fechamento mensal e a DRE leem `data_competencia`; a projeção de 13 semanas lê `data_vencimento` dos abertos e `data_pagamento` dos realizados.
- Para imobiliária, a diferença entre competência e caixa é grande. A comissão "vendida" em março pode ser recebida em parcelas ao longo de meses, ou só depois do registro. Mostrar as duas visões lado a lado ("vendido no mês" x "entrou no caixa no mês") é provavelmente mais útil que uma DRE completa.
- Adotar a exceção da Conta Azul (juros e descontos pela data de caixa) evita retrabalho na competência.

### Gaps
- Não confirmei como Nibo e Granatum rotulam as datas na interface.
- Não achei fonte de como os produtos tratam o lançamento parcelado na DRE (competência única ou uma por parcela).

## 3. Plano de contas / categorias e centro de custo

### Takeaway
Os produtos para PME usam um plano gerencial de categorias em dois níveis, cada categoria ligada a um grupo fixo da DRE. O vínculo categoria → grupo da DRE é o que faz o relatório funcionar e é a principal fonte de erro. O plano contábil "de verdade" fica com o contador, que o importa ou mapeia via integração (por exemplo, Domínio). Centro de custo, projeto e cliente são dimensões opcionais.

### Cited Findings
- Conta Azul: a DRE gerencial é organizada pelo plano de contas e pode ser aberta por centro de custo, projeto ou cliente. A DRE contábil segue a Lei 6.404/76. — [resumo da busca sobre a Conta Azul Ajuda, Relatório DRE gerencial](https://ajuda.contaazul.com/hc/pt-br/articles/7322698456973-Relat%C3%B3rio-DRE-gerencial)
- Conta Azul: o grupo "Impostos Sobre Vendas" só é alimentado por lançamentos financeiros na categoria configurada para ele, e não pelos impostos das notas fiscais. As vendas caem automaticamente em "Receita de Vendas de Produtos e Serviços" e não podem ser movidas. — [Conta Azul Ajuda, grupos da DRE](https://ajuda.contaazul.com/hc/pt-br/articles/45703032716429-DRE-o-que-cada-grupo-de-receita-dedu%C3%A7%C3%A3o-e-custo-operacional-representa-no-DRE)
- Conta Azul: relatórios e gráficos podem ser vistos por período, com recebimentos por centro de custo e análises por tipo de operação financeira. Os lançamentos que chegam pela conexão bancária vêm "já categorizados". — [Conta Azul, página DRE/fluxo de caixa](https://contaazul.com/dre)
- Omie: para a conciliação automática funcionar, cada categoria precisa ter o "Tipo de Gasto/Receita" configurado. Os lançamentos são agrupados quando têm a mesma categoria, vendedor, projeto e departamento. — [Omie Ajuda, Omie.Cash](https://ajuda.omie.com.br/pt-BR/articles/6803720-guia-de-configuracoes-para-a-conciliacao-na-omie-cash-conta-completa); [Omie Ajuda, FAQ](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria)
- Domínio (Thomson Reuters) tem rotinas para exportar o plano de contas do escritório e importá-lo na Conta Azul. — [Domínio, exportar plano de contas para Conta Azul](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=9321); [Domínio, importar plano de contas](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=10281)
- BPOs parceiros da Conta Azul lançam contas a pagar e a receber "conforme plano de contas acordado" com o cliente. — [Conta Azul, parceiro BPO Lemon](https://contaazul.com/encontre-contador/contadores/bpo-financeiro-lemon-consultoria/)

### Inferências
- Proposta de árvore mínima para uma imobiliária de venda. Não tem fonte; é derivada dos grupos da DRE da Conta Azul:
  - **Receitas**: comissão de venda (própria), comissão de parceria recebida, outras receitas (avaliação, consultoria).
  - **Deduções**: impostos sobre faturamento (Simples/ISS), repasse de comissão a parceiro (co-corretagem), comissão de corretor. Na Conta Azul comissão fica em "Deduções", o que faz sentido para corretor autônomo.
  - **Despesas operacionais**: portais/anúncios, marketing, aluguel, pessoal fixo, sistemas, veículos/deslocamento, despesas bancárias.
  - **Financeiras**.
  - **Retirada de sócios** (fora da DRE).
- "Centro de custo" para imobiliária pequena é quase sempre "corretor" ou "equipe/loja". O CRM já tem o corretor na venda, então a dimensão sai de graça sem um cadastro extra de centro de custo. Projeto e departamento são overkill.
- Travar as categorias de sistema (como a Conta Azul faz com a receita de vendas) evita que o usuário quebre a DRE.

### Gaps
- Não obtive a árvore padrão completa de categorias de nenhum produto. As listas ficam dentro do app ou em artigos que não acessei.
- Não confirmei se Granatum tem centro de custo e DRE; só há páginas de comparação de terceiros.

## 4. DRE gerencial: estrutura e o que o dono olha

### Takeaway
A DRE gerencial da Conta Azul tem uma cascata fixa: Receita bruta → Deduções → Receita líquida → Custos → Lucro bruto → Despesas operacionais → Resultado operacional → Resultado financeiro → Lucro líquido. Depois disso vem uma linha "Investimentos e empréstimos" e o "Lucro/prejuízo final", que funciona como uma ponte para o caixa. Não há menção a EBITDA na ajuda.

### Cited Findings
- Grupos da DRE Conta Azul:
  - **Receitas Operacionais**: Receita de Vendas de Produtos e Serviços; Receita de Fretes e Entregas → Receita Bruta de Vendas.
  - **Deduções da Receita Bruta**: Impostos Sobre Vendas; Comissões Sobre Vendas; Descontos Incondicionais; Devoluções de Vendas → Receita Líquida de Vendas.
  - **Custos Operacionais**: CPV; Custo das Vendas de Produtos (opcional); Custo dos Serviços Prestados → Lucro Bruto.

  — [Conta Azul Ajuda, grupos da DRE](https://ajuda.contaazul.com/hc/pt-br/articles/45703032716429-DRE-o-que-cada-grupo-de-receita-dedu%C3%A7%C3%A3o-e-custo-operacional-representa-no-DRE)
- Sequência completa da Conta Azul:
  1. receitas operacionais;
  2. deduções;
  3. receita líquida;
  4. lucro bruto;
  5. lucro/prejuízo operacional;
  6. resultado financeiro;
  7. lucro/prejuízo líquido, depois de outras receitas e despesas não operacionais;
  8. "Investimentos e empréstimos", que subtrai parcelas de financiamentos, empréstimos e compra de máquinas;
  9. lucro/prejuízo final.

  A ajuda cita análise vertical e horizontal sem detalhar e não menciona EBITDA. — [Conta Azul Ajuda, como interpretar o DRE](https://ajuda.contaazul.com/hc/pt-br/articles/7685448113165-DRE-como-interpretar-o-DRE-Gerencial)
- Conta Azul: um depoimento de cliente diz que os relatórios podem ser editados antes da exportação. — [Conta Azul, página DRE](https://contaazul.com/dre)

### Inferências
- Para imobiliária, a DRE útil cabe numa tela de celular com 5 linhas: Comissões brutas → (−) impostos e repasses (parceiros + corretores) → **Receita líquida da imobiliária** → (−) despesas fixas → **Resultado do mês**, com uma linha de rodapé "retiradas dos sócios".
- CPV, fretes, devoluções e EBITDA são overkill: não há estoque e quase não há depreciação.
- A linha "Investimentos e empréstimos → Lucro final" da Conta Azul responde à pergunta que o dono de PME faz ("sobrou dinheiro?") sem misturar com a DRE contábil. Vale copiar a ideia como "Resultado depois de compromissos".

### Gaps
- Não achei fonte com dados sobre quais linhas os donos de PME realmente consultam (pesquisa de uso). Para despesas, resultado financeiro e IR/CSLL só obtive a cascata, não a lista de subgrupos.

## 5. UX de contas a pagar/receber: recorrência, parcelamento, anexos, baixa parcial, cobrança, lembretes

### Takeaway
Os padrões comuns são anexos por lançamento (XML, fotos, comprovantes), captura de boleto ou nota por IA (o "Conta AI Captura" da Conta Azul), cobrança por boleto/Pix/link com baixa automática quando o dinheiro passa pela conta digital do ERP, baixa parcial como saída para casos que não se encaixam e recorrência separada de parcelamento.

### Cited Findings
- Conta Azul: cada lançamento financeiro aceita anexos (duplicatas, foto de cheque, XML de NF, planilhas, recibos, segunda via). — [Conta Azul, contas a pagar](https://contaazul.com/funcionalidades/contas-a-pagar/)
- Conta Azul: o "Conta AI Captura" reconhece boletos, notas, recibos, extratos e faturas de cartão e gera lançamentos automaticamente. — [Conta Azul, tutorial Conta Azul IA](https://contaazul.com/tutoriais/como-fazer-lancamentos-atraves-de-importacoes-do-conta-azul-ia)
- Conta Azul: oferece cobrança recorrente para contratos mensais (lado receber) e cobrança automática. — [Conta Azul, contratos recorrentes](https://www.contaazul.com/funcionalidades/contratos-recorrentes/); [Conta Azul, cobrança automática](https://contaazul.com/funcionalidades/cobranca-automatica/)
- Conta Azul (app): cobra clientes por boleto, Pix ou link de pagamento. Os pagamentos baixam contas a pagar e a receber pela conciliação nativa. — [Conta Azul, CA de Bolso](https://contaazul.com/funcionalidades/ca-de-bolso)
- Omie: a baixa parcial é a alternativa quando várias linhas do extrato pagam um título só. Juros, multa e desconto podem ser aplicados na hora de conciliar um título ainda não baixado, mas ficam bloqueados se ele já estiver baixado (é preciso cancelar a baixa). — [Omie Ajuda, FAQ](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria); [Omie Ajuda, extrato integrado](https://ajuda.omie.com.br/pt-BR/articles/2495094-conciliacao-bancaria-com-o-extrato-do-banco-integrado-ao-omie)
- Padrão de mercado (fora dos produtos-alvo): recorrência tem número de repetições e intervalo; parcelamento divide um total, enquanto recorrência repete o mesmo valor; anexos de até 5 MB. — [Alterdata ERP4ME](https://ajuda.alterdata.com.br/koop/financeiro/lancamentos-financeiros/a-pagar-erp4me); [Mais Terapias](https://intercom.help/mais-terapias/pt-BR/articles/13398329-parcelamento-e-lancamentos-recorrentes)

### Inferências
- No celular, o fluxo de maior valor é "fotografar boleto ou comprovante → lançamento pré-preenchido → confirmar". Equivale ao Conta AI Captura, mas pode começar só pela leitura da linha digitável e do QR Pix, sem LLM.
- Na imobiliária, comissão parcelada da construtora e "sinal + saldo na escritura" pedem parcelamento com datas irregulares, não só intervalos fixos. Baixa parcial é obrigatória, porque a construtora frequentemente paga com retenção ou desconto.
- Cobrança por boleto ou Pix só faz sentido se a imobiliária emitir cobrança para o cliente final ou para o parceiro. Para venda, quem paga a comissão costuma ser a construtora ou o vendedor, por TED/Pix. Emitir boleto é **provavelmente overkill** na primeira versão. Um "Pix copia-e-cola para cobrar parceiro" é barato.

### Gaps
- Não achei a documentação oficial da Conta Azul sobre baixa parcial e sobre parcelamento ou recorrência em contas a pagar.
- Não pesquisei lembretes de vencimento (push, e-mail ou WhatsApp) nos produtos.

## 6. Fechamento do mês e integração com o contador

### Takeaway
O modelo dominante é que o contador tenha um painel próprio (Conta Azul Mais; Nibo Contador ou Portal do Cliente) com acesso aos clientes, e que os lançamentos sigam parametrizados para o sistema contábil do escritório. Domínio é o principal destino, com API para notas e contas a pagar e importação de lançamentos contábeis. O cliente envia documentos pelo app. Planilha é o mínimo, não o padrão.

### Cited Findings
- Conta Azul: escritórios e BPOs com CNPJ têm acesso gratuito ao Conta Azul Mais. No plano BPO o cliente não acessa o ERP; no Conta Azul Pro o cliente usa o ERP e os dados são exportados para sistemas contábeis como Domínio e Alterdata. A empresa afirma que exporta lançamentos contábeis e fiscais "parametrizados" para mais de 25 sistemas contábeis, com envio automático para o Domínio. — [resumo da busca sobre a Conta Azul, funcionalidades para contadores](https://contaazul.com/contadores/funcionalidades/); [Conta Azul, Domínio](https://contaazul.com/contadores/dominio/)
- Integração com o Domínio: ativada em Conta Azul Mais > Meus clientes > Integração com o Domínio. As notas emitidas na Conta Azul vão por API para o Domínio, e as contas a pagar lançadas no Domínio podem vir para a Conta Azul. Os lançamentos contábeis da Conta Azul são importados no Domínio em Utilitários > Importação > Importação Padrão. Conflito: o marketing diz que o envio é automático, mas a ajuda do Domínio descreve uma importação manual por período. — [Domínio, habilitar integração](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=8434); [Domínio, lançamentos contábeis da Conta Azul](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=9817); [Domínio, contas a pagar](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=10603)
- Nibo: o app "Nibo Empresa – Portal do Cliente" serve para o cliente enviar e receber documentos, acompanhar atendimentos e receber notificações, e exige cadastro prévio feito pela contabilidade. — [App Store, Nibo Empresa](https://apps.apple.com/app/id1564017101)
- Nibo: o "Nibo Impressora" recebe arquivos que caem na tela de conferência do Nibo Contador, e o "Nibo Assistente" monitora pastas e renomeia documentos já lidos pelo robô. — [Nibo Ajuda, Impressora](https://intercom.help/niboajuda/pt-BR/articles/6988406-nibo-impressora); [Nibo Ajuda, Assistente](https://intercom.help/niboajuda/pt-BR/articles/8417298-nibo-assistente)
- Uma vaga de emprego descreve o fluxo comum: "entrega de documentos fiscais e movimentação financeira para a contabilidade (Contabilizei)", com o ERP Conta Azul usado no dia a dia. Isso mostra a Contabilizei como **destino** dos dados, não como ERP financeiro. — [resumo da busca sobre uma vaga na Workana](https://www.workana.com/job/assistente-financeiro-com-experiencia-no-sistema-conta-azul)
- A Conta Azul comprou a Mister Contador, de automação de escrituração a partir de extratos, para o lado do contador. — [Baguete](https://www.baguete.com.br/noticias/conta-azul-adquire-mister-contador)

### Inferências
- O .xlsx de fechamento que o CRM já gera está no nível "mínimo aceitável". Duas melhorias de baixo custo:
  1. incluir, em cada linha, a categoria **mapeável** para o plano de contas do contador (uma coluna "conta contábil" que o contador preenche uma vez e o sistema lembra);
  2. anexar um ZIP com os comprovantes do mês.

  A integração com Domínio por API é overkill para a fase atual.
- Um "link de contador" somente leitura, sem login de usuário pago, imita o Conta Azul Mais e o Portal do Nibo com custo baixo e evita o e-mail de planilha.
- Imobiliárias de 1 a 15 corretores quase sempre têm contador terceirizado (Contabilizei ou escritório local). O financeiro do CRM deve ser **gerencial** e entregar dados ao contador, sem tentar fazer escrituração.

### Gaps
- Não achei a documentação oficial da Contabilizei sobre o que ela aceita como entrada (planilha, OFX, integração). A busca não retornou páginas da Contabilizei.
- Não confirmei o layout do arquivo de exportação da Conta Azul (CSV/TXT por sistema).

## 7. Mobile: o que fica no celular e o que fica só no desktop

### Takeaway
O app é um companheiro do ERP, não o produto inteiro. No celular o dono acompanha saldo, aprova, recebe notificações, cobra (boleto, Pix ou link) e paga em lote pela conta digital. Configuração, conciliação detalhada e relatórios ficam no desktop. O app depende de internet.

### Cited Findings
- App "Conta Azul de Bolso": acompanhar saldo, aprovar vendas, receber notificações, cobrar por boleto, Pix ou link, e baixa automática pela conciliação nativa. — [Conta Azul, CA de Bolso](https://contaazul.com/funcionalidades/ca-de-bolso)
- App Store: o app permite cobrar, receber e pagar direto pelo app com a Conta PJ da Conta Azul, inclusive pagamentos em lote. — [App Store, Conta Azul de Bolso](https://apps.apple.com/app/id1567614314)
- Sem internet não é possível usar o app. Um artigo de terceiros cita nota 4,1 no Google Play e 4,7 na App Store. — [resumo da busca sobre o blog da Conta Azul, app de bolso](https://contaazul.com/blog/app-conta-azul-de-bolso/)
- Nibo: o app do cliente é voltado à troca de documentos com o contador. — [App Store, Nibo Empresa](https://apps.apple.com/app/id1564017101)
- A página de conciliação da Conta Azul não diz que a conciliação é feita no app. — [Conta Azul, conciliação](https://contaazul.com/funcionalidades/conciliacao-bancaria)

### Inferências
- Como o CRM é mobile-first e os concorrentes empurram o financeiro "de verdade" para o desktop, a conciliação no celular pode ser diferencial. O formato seria uma fila de cartões "Este crédito de R$ X da Construtora Y em 12/10 é a comissão do Apto 302?", com botões [Sim] [Outro] [Ignorar]. Isso só funciona com match determinístico de alta confiança (seção 1).
- O que o dono faz no celular, pela lista da Conta Azul: ver saldo, aprovar, ser notificado e cobrar. Coincide com as regras de alerta e o chat que o CRM já tem.

### Gaps
- Não obtive listas oficiais de funcionalidades do app do Omie nem do Nibo, nem reviews de app que falem especificamente de conciliação no celular.

## 8. Dashboards: os 3 a 5 KPIs da tela inicial

### Takeaway
Não encontrei fonte primária que liste os KPIs da home de cada produto. O que está documentado é o que essas homes respondem: se o caixa vai faltar ou sobrar, se a empresa dá lucro, o saldo bancário, e o que vence ou atrasa.

### Cited Findings
- Conta Azul: a página "Fluxo de caixa e DRE" diz que o objetivo é saber se vai faltar ou sobrar caixa e se o negócio é lucrativo, com relatórios personalizáveis, visão por período e relatórios de inadimplência, pagamentos e vendas. — [Conta Azul, DRE/fluxo de caixa](https://contaazul.com/dre)
- No app Conta Azul de Bolso, o primeiro item é acompanhar o saldo, junto com notificações. — [Conta Azul, CA de Bolso](https://contaazul.com/funcionalidades/ca-de-bolso)
- Os sinais de alerta da DRE na ajuda da Conta Azul são lucro bruto baixo (custos altos ou margem reduzida), despesas operacionais elevadas e resultado líquido negativo. — [Conta Azul Ajuda, como interpretar o DRE](https://ajuda.contaazul.com/hc/pt-br/articles/7685448113165-DRE-como-interpretar-o-DRE-Gerencial)

### Inferências
- Proposta de home para imobiliária, derivada das perguntas acima e não de fonte:
  1. **Saldo hoje**, conciliado ou "digitado em DD/MM", deixando explícito de onde veio o número;
  2. **Comissões a receber nos próximos 30 dias** (e atrasadas);
  3. **Contas a pagar nos próximos 7 dias**;
  4. **Resultado do mês**, em competência, com "vendido" x "recebido";
  5. **Menor saldo projetado nas 13 semanas** e a data dele.

### Gaps
- Faltam capturas ou documentação das homes do Conta Azul, Omie, Nibo e Granatum em 2026. Não consegui acessar telas logadas.

## 9. Reclamações de usuários (Reclame Aqui, B2B Stack, Capterra, lojas)

### Takeaway
As reclamações recorrentes são de três tipos: integração bancária que "conecta mas não importa", cobrança, renovação automática e reajuste, e suporte lento. Sobre "complexidade" há sinais de que funções avançadas deixam a desejar. Para o Nibo, a amostra é pequena e negativa.

### Cited Findings
- Reclame Aqui, Conta Azul: selo RA1000 e nota média de 8,4/10 nos últimos 6 meses. Há uma reclamação aberta de conta C6 Bank vinculada que nunca importa extrato automaticamente, sem resposta no momento da coleta, e outras sobre importação bancária e conciliação na mesma lista. — [resumo da busca sobre o Reclame Aqui, Conta Azul](https://www.reclameaqui.com.br/empresa/contaazul/lista-reclamacoes/)
- Reclame Aqui, Conta Azul (2026): reclamações sobre renovação automática com reajuste expressivo, pedidos de estorno, migração de plano e cobrança indevida depois de falha na reativação de licença. — [RA, renovação com reajuste](https://www.reclameaqui.com.br/contaazul/cobranca-de-renovacao-automatica-de-assinatura-com-reajuste-expressivo-e-promessa-de-analise-nao-cumprida_VNtB6L-mqHd3MXcq/); [RA, cancelamento e estorno](https://www.reclameaqui.com.br/contaazul/solicitacao-de-cancelamento-e-estorno-de-renovacao-automatica-de-plano-com-valor-elevado_nWhkDdh8zeMFET37/); [RA, licença](https://www.reclameaqui.com.br/contaazul/conta-azul-cobranca-indevida-e-paralisacao-de-servicos-apos-falha-na-reativacao-de-licenca_A6mYSxb_IBz8yRZI/); [RA, migração de plano](https://www.reclameaqui.com.br/contaazul/dificuldade-de-migracao-de-plano-empresarial-e-falha-nos-canais-de-atendimento_CyO_iuEyKR4T5HNa/)
- Reclame Aqui, Conta Azul: uma reclamação de setembro de 2026 diz que o cliente não obteve resposta clara sobre como gerir o fluxo de caixa depois de uma mudança de regra. — [resumo da busca sobre o Reclame Aqui, Conta Azul](https://www.reclameaqui.com.br/empresa/contaazul/lista-reclamacoes/)
- Preço da Conta Azul em 2026: Controle (ME, faturamento de R$ 81 mil a R$ 360 mil/ano, 2 usuários) de cerca de R$ 349,90 a R$ 499,90/mês; Avançado (EPP, 5 usuários) de cerca de R$ 439,90 a R$ 579,90/mês; Performance (15 usuários) de cerca de R$ 799,90 a R$ 929,90/mês. A diferença é entre ciclo anual e trimestral; o texto extraído não deixa claro qual é qual. — [Conta Azul, conciliação/planos](https://contaazul.com/funcionalidades/conciliacao-bancaria)
- B2B Stack, Conta Azul: nota 4,2/5 em 18 avaliações. Os usuários elogiam a facilidade, mas dizem que "algumas funcionalidades mais complexas deixa a desejar". — [B2B Stack, Conta Azul](https://www.b2bstack.com.br/product/conta-azul/avaliacoes)
- B2B Stack, Omie: elogios à facilidade de conciliação bancária, mas queixa de demora do suporte em resolver. — [B2B Stack, Omie](https://www.b2bstack.com.br/product/omie/avaliacoes)
- B2B Stack, Nibo: só duas avaliações, média 2,5/5, uma delas chamando o sistema de "ferramenta inacabada e cheia de erros". A amostra é pequena demais. — [B2B Stack, Nibo](https://www.b2bstack.com.br/produto/nibo)
- Restrições que geram frustração, documentadas pela própria Omie: a conciliação automática só olha 5 dias para trás; boleto pago via Pix não concilia; N:1 não existe; o OFX não fica guardado. — [Omie Ajuda, FAQ](https://ajuda.omie.com.br/pt-BR/articles/6812438-perguntas-frequentes-conciliacao-bancaria)
- Granatum: preço de entrada citado por terceiros de R$ 151/mês, possivelmente desatualizado, com categorias de contas a pagar e receber, conciliação, fluxo de caixa e acesso mobile. — [B2B Stack, Granatum x Conta Azul](https://www.b2bstack.com.br/compare/granatum-vs-conta-azul)

### Inferências
- O risco nº 1 de qualquer conciliação automática é o "conectou mas não importou". O CRM deve mostrar sempre a "última importação: DD/MM HH:MM" e alertar quando passar de 48 horas sem extrato. Isso é coerente com as regras de alerta que já existem.
- O preço da Conta Azul (cerca de R$ 350 a R$ 930/mês) mostra o espaço de mercado: um financeiro gerencial embutido no CRM, sem NF-e nem estoque, entrega a maior parte do valor para uma imobiliária.
- As limitações da Omie viram requisitos: janela retroativa configurável (30 a 60 dias), match que ignora o tipo de documento, guardar o arquivo OFX importado e histórico dos itens ignorados.

### Gaps
- Não consegui ler reviews da Capterra BR nem das lojas de app em detalhe (as páginas não vieram no conteúdo). Não há estatística por tipo de reclamação.
- Não pesquisei Contabilizei no Reclame Aqui.
