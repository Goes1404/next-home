# Financeiro de VENDA em sistemas de imobiliária (BR + referências internacionais)

> Pesquisa feita em 2026-10-29. Escopo: o lado do dinheiro na **venda** (comissão, split, repasse ao corretor, distrato), não a administração de locação.
> Aviso de método: a busca na web devolveu pouca documentação pública dos sistemas brasileiros. Os sites oficiais (Jetimob, Imobzi, Tecimob, Superlógica, CV CRM) descrevem o financeiro em linguagem de marketing. Algumas centrais de ajuda estão atrás de login (Kenlo/Freshdesk) ou bloquearam acesso (Superlógica HC deu 403). O site do Imoview redireciona para o app (app.imoview.com.br) e não foi lido. Capterra deu 403. Os detalhes mais concretos vêm da **Sienge** (ajuda pública), do blog Sienge e das páginas da Lone Wolf/Brokermint. Tudo o que não tem fonte está em "Inferências" ou "Lacunas".

## 1. Comissão de venda: registro (% / R$, parcelas, construtora), co-corretagem e split por papel

### Takeaway
Nos sistemas brasileiros voltados a imobiliária, a comissão de venda é **um campo dentro da negociação/fechamento**: comissões "a pagar e a receber" por negócio, com rateio entre corretores, inclusive terceiros ou parceiros. Regras ricas, como percentual por empreendimento, parcelas vinculadas ao recebimento e trava de duplicidade, só aparecem nos sistemas de **incorporadora** (Sienge, CV CRM). Nenhum sistema BR pesquisado documenta publicamente "tabela de comissão por papel" (captador / vendedor / gerente) do jeito que Brokermint/Lone Wolf documentam "commission plans".

### Cited Findings
- **Jetimob:** "Registre em cada negociação as comissões a pagar e a receber". A liquidação desses pagamentos é acompanhada "através do nosso módulo de gestão financeira", na seção "Controlar os honorários dos seus corretores". — [Jetimob – Gestão de vendas](https://www.jetimob.com/sistema-gestao-vendas-imoveis)
- **Jetimob:** a página de planos põe "comissões" dentro do módulo **opcional** "Gestão financeira" (fluxo de caixa, repasses, comissões, inadimplência). Nenhum plano de vendas (Lite / Pro / Enterprise) o lista como incluso. — [Jetimob – Planos](https://www.jetimob.com/planos)
- **Kenlo Imob:** ao incluir um responsável que não é usuário do sistema, escolhe-se o **tipo de comissão** (corretor, terceiro), e o primeiro tipo de comissão é obrigatório. Corretor terceiro pode ser adicionado na **ficha de captação** do imóvel para dividir comissão entre parceiros. — resumo de busca a partir de artigos de suporte da Kenlo ([fresh.kenlo.com.br](https://fresh.kenlo.com.br/support/solutions/articles/156000019948-imob-l-como-cadastrar-im%C3%B3veis)). O artigo completo exige login, então o conteúdo não foi verificado diretamente.
- **Kenlo:** no fechamento de venda ou locação, o Kenlo Imob envia ao Kenlo Locação (financeiro) **os dados do corretor e o rateio da comissão**. Nos planos Essencial e Econômico, isso se limita às informações da comissão da venda. A Kenlo recomenda cadastrar o CPF de todos os comissionados para evitar duplicidade. — snippet de busca do artigo "[Locação: o que é migrado do Kenlo Imob para o Kenlo Locação no fechamento de locações e vendas](https://fresh.kenlo.com.br/support/solutions/articles/156000019409-locac%C3%A3o-o-que-%C3%A9-migrado-do-kenlo-imob-para-o-kenlo-locac%C3%A3o-no-fechamento-de-locac%C3%B5es-e-vendas)". O artigo exige login e não foi lido na íntegra.
- **Kenlo (blog do fornecedor):** comissão de venda "costuma" ser 6% e só é repassada após a conclusão do negócio. Corretor de imobiliária de terceiros recebe em média 40% da comissão total. São números de marketing, sem metodologia. — [Blog Kenlo – comissão de corretagem](https://blog.kenlo.com.br/entenda-como-funciona-a-comissao-para-o-corretor-de-imoveis/)
- **Sienge (incorporadora):** a configuração de comissões fica **por empreendimento** (Comercial > Vendas > Comissões > Configurações). Ela tem duas regras novas:
  - **Base de autorização/liberação:** percentual, ou "condição de pagamento" do cliente. Com condição de pagamento, a parcela da comissão fica **bloqueada** até a condição ser paga totalmente. A barra "Percentual pago contrato" fica vermelha e vira verde quando a parcela é recebida.
  - **"Trava do corretor":** "o sistema não permitirá cadastrar mais de uma comissão para o mesmo corretor no mesmo contrato".
  - — [Ajuda Sienge – Comissões: novas configurações](https://ajuda.sienge.com.br/support/solutions/articles/153000201342-comiss%C3%B5es-disponibilizac%C3%A3o-de-novas-configurac%C3%B5es-para-o-sistema)
- **Sienge:** existe uma "Tela de Análise de Comissões" para conferir contratos com e sem comissão e achar lançamentos duplicados. — [Ajuda Sienge – Tela de Análise de Comissões](https://ajuda.sienge.com.br/support/solutions/articles/153000201337-como-funciona-a-tela-de-an%C3%A1lise-de-comiss%C3%B5es-)
- **Sienge (blog):** há dois modelos de pagamento:
  - **direto:** comprador ou vendedor paga corretor/imobiliária sem passar pelo caixa da incorporadora;
  - **faturado:** a incorporadora paga, "o modelo mais comum em lançamentos de empreendimentos".
  - Exemplo típico de 6%: 4% ao corretor vendedor, 1% à imobiliária parceira, 1% ao time interno.
  - Quando a entrada é parcelada, a comissão costuma ser parcelada também, mas "o ritmo de pagamento ao corretor nem sempre acompanha o ritmo de recebimento da incorporadora".
  - — [Sienge – Gestão de comissão de vendas](https://sienge.com.br/blog/gestao-de-comissao-de-vendas/)
- **CV CRM:** o "Mapa de Comissões" permite "Defina diferentes percentuais de comissão" e destina valores "automaticamente para pagamento de comissões de vendas aos seus colaboradores". Os processos de comissão aceitam "Configuração de pré-requisitos dentro dos processos" e "Ações totalmente automatizadas". O pagamento sai pelo **Avendre Pay**, para que "o valor certo seja pago para a pessoa certa, no momento certo". — [CV CRM – Gestão de Comissão](https://cvcrm.com.br/cv-vender/gestao-de-comissao/)
- **Superlógica / Arbo:** a ajuda pública explica a comissão **que a Arbo/Superlógica cobra da imobiliária**. Ela incide sobre a corretagem recebida, não sobre o valor do imóvel. Exemplo: venda de R$ 450 mil × 6% × participação contratual de 25% = R$ 6.750. Isso é o modelo de cobrança do fornecedor (revenue share sobre a comissão), não uma funcionalidade de split interno. — snippet de busca de [Superlógica HC – "Como é apurado o valor da comissão devida à Arbo?"](https://imobiliarias.superlogica.com/hc/pt-br/articles/32803953464215-Como-%C3%A9-apurada-o-valor-da-comiss%C3%A3o-devida-a-arbo). A página deu 403 no fetch e não foi verificada na íntegra.
- **Superlógica Imobi (CRM):** a tabela de planos lista só "Fluxo de proposta" na parte de vendas. "Comissão" não aparece na página de planos. — [Superlógica – Planos](https://superlogica.com/imobiliarias/planos/)
- **Parceria entre corretores (regra de mercado):** não há regra legal para o percentual nem para o número de corretores numa parceria. Quem propõe costuma definir o split e as partes precisam concordar. — [CRECI-ES – dicas de parceria](https://crecies.gov.br/5-dicas-para-o-corretor-de-imoveis-vender-mais-com-parcerias). O art. 724 do Código Civil trata da divisão quando mais de um corretor fecha o negócio. — [Conjur](https://www.conjur.com.br/2024-dez-04/comissao-a-corretores-no-setor-imobiliario-e-no-carf//?print=1)
- **Follow Up Boss (CRM, EUA):** no "Deal", primeiro se informa o valor da comissão. Depois se adiciona o **agent split** ou o **team split**: em percentual, se a comissão estiver preenchida, ou só em valor fixo, se o campo estiver vazio. — [FUB Help – Creating Deals](https://help.followupboss.com/hc/en-us/articles/360015220774-Creating-Deals) (via snippet de busca)

### Inferences
- O padrão BR para imobiliária pequena é: **negócio → lista de comissionados (pessoa + tipo/papel + % ou R$) → lançamentos no financeiro**. O split por papel (captador, vendedor, gerente, imobiliária) parece ser configurado à mão em cada negócio, não por tabela/plano. Isso abre espaço para diferenciação com "planos de comissão por papel" no estilo Brokermint.
- Três ideias do mundo incorporadora valem para uma imobiliária de venda que trabalha com lançamentos:
  - **parcelas da comissão vinculadas a parcelas recebidas** (bloqueio até o cliente ou a construtora pagar);
  - **trava de duplicidade** (um corretor por contrato);
  - **tela de conferência** de contratos sem comissão.
- O modelo de 6% do blog Sienge (4/1/1) mostra que, em lançamento, a imobiliária parceira recebe a parte menor. A imobiliária pequena precisa registrar a comissão **a receber da construtora** e, separadamente, o que repassa ao corretor.

### Gaps
- Não achei documentação pública de **Imoview**, **Union**, **Vista** ou **Tecimob** sobre como registrar comissão de venda. A página da Tecimob não menciona comissões. O Imoview não pôde ser lido, porque o site redireciona para o app.
- Não confirmei se algum sistema BR tem "tabela de comissão por papel" reutilizável (ex.: captador 10%, vendedor 40%, imobiliária 50%) ou overrides por negócio.
- Também não confirmei se algum sistema BR tem comissão com **sinal** separado das parcelas.

## 2. Repasse ao corretor: liberação, adiantamento, descontos, RPA × NF, extrato do corretor

### Takeaway
A liberação "só depois de receber" aparece de forma explícita e configurável só na **Sienge** (bloqueio da parcela da comissão até a condição de pagamento do cliente ser quitada). Os sistemas de imobiliária (Jetimob, Kenlo) só falam em "acompanhar a liquidação" no financeiro. O lado fiscal (RPA para pessoa física, NFS-e para PJ, corretor **não pode ser MEI**) não aparece como funcionalidade em nenhum sistema pesquisado. Isso é uma oportunidade clara de produto.

### Cited Findings
- **Sienge:** o controle da comissão pode ficar "na autorização" ou "na liberação", com base em percentual pago ou em condição de pagamento do cliente. A parcela fica bloqueada até o recebimento. Tentar autorizar antes gera aviso. — [Ajuda Sienge](https://ajuda.sienge.com.br/support/solutions/articles/153000201342-comiss%C3%B5es-disponibilizac%C3%A3o-de-novas-configurac%C3%B5es-para-o-sistema)
- **Sienge (blog):** no modelo de "comissão sobre recebimento", o pagamento acontece só quando a incorporadora recebe. Isso protege o caixa, mas precisa estar no contrato desde o início. Em vendas MCMV, "A comissão é paga apenas após a efetivação contratual com a CEF". — [Sienge blog](https://sienge.com.br/blog/gestao-de-comissao-de-vendas/)
- **Sienge:** a ajuda pública tem procedimento para excluir comissão lançada. Ele depende do status no Relatório de Comissões, e uma comissão cancelada precisa ser reativada antes de ser excluída. Isso indica um ciclo de status (previsão → autorizada → liberada → paga/cancelada). — [Ajuda Sienge – excluir comissões](https://ajuda.sienge.com.br/support/solutions/articles/153000201172-como-excluir-comiss%C3%B5es-lancadas-para-o-corretor-no-sienge-). Os nomes exatos dos status não foram confirmados.
- **CV CRM:** permite receber o "histórico de pagamentos" e "Saiba o destino de sua verba em tempo real". O pagamento é feito via Avendre Pay. — [CV CRM – Gestão de Comissão](https://cvcrm.com.br/cv-vender/gestao-de-comissao/)
- **Jetimob:** comissões a pagar por negociação, com liquidação acompanhada no módulo financeiro. Não há menção a extrato do corretor. — [Jetimob – vendas](https://www.jetimob.com/sistema-gestao-vendas-imoveis)
- **Kenlo:** o BI tem relatórios de desempenho dos corretores, incluindo **comissões recebidas**, com filtro por corretor ou tipo de transação e exportação para Excel. — snippet de busca de artigos de suporte da Kenlo ([kenlo.movidesk.com](https://kenlo.movidesk.com/kb/pt-br/Search?q=p%C3%A1gina+do+corretor)), não verificado na íntegra.
- **Fiscal – pessoa física:** corretor autônomo não emite nota fiscal. O pagamento da comissão deve vir acompanhado de **RPA**. — [CRECI-SC](https://www.creci-sc.gov.br/p/noticias/corretor-de-imoveis-precisa-emitir-nota-fiscal-entenda-as-regras-e-evite-problemas/2741/)
- **Fiscal – retenções no RPA:** quem paga retém **11% de INSS** (até o teto) e informa no eSocial. Também retém IR na fonte. — [Garcia Cont – RPA para corretor](https://garciacont.com.br/artigos/rpa-para-corretor-vendedor-autonomo-comissao-como-emitir). Fonte de escritório contábil, não oficial.
- **Fiscal – PJ:** o corretor PJ emite nota fiscal pelas comissões. O ISS cai no item 10.05 da LC 116/2003 ("Agenciamento, corretagem ou intermediação de bens móveis ou imóveis"). — [Alude – NF de comissão](https://www.alude.com.br/blog/nota-fiscal-de-comissao-imobiliaria)
- **Fiscal – MEI:** corretor de imóveis **não pode ser MEI** desde a Resolução CGSN 143/2018. — [contabilidade.com](https://contabilidade.com/blog/corretor-de-imoveis-pode-ser-mei-em-2026-veja-como-abrir-seu-cnpj-corretamente-e-pagar-menos-impostos/). Fonte secundária; conferir a resolução. **Isso corrige a premissa "NF do corretor PJ/MEI": MEI não é opção válida para corretor.**
- **Fiscal – comissão dividida:** cada corretor deve emitir documento proporcional à sua parte. Não se deve emitir o total e repassar "por fora". — resumo de busca a partir de fontes de blog contábil (listadas na [busca](https://www.instaninja.com.br/blog/como-emitir-nota-fiscal-para-comissao-imobiliaria-2026)). Fonte fraca.
- **Tributação da imobiliária:** a Solução de Consulta RFB nº 75/2024 diz que, no lucro presumido, a comissão paga a corretores **não pode ser deduzida** da receita bruta da imobiliária. — [Tributo Devido](https://tributodevido.com.br/portal/comissao-de-venda-em-imobiliarias/) (via snippet de busca)

### Inferences
- Um "extrato do corretor" no estilo BR mostraria **comissões previstas** (negócio fechado, cliente ou construtora ainda não pagou), **liberadas** (recebido, pronto para pagar), **pagas** e **estornadas**. A barra "percentual pago do contrato" da Sienge é uma boa metáfora visual para o corretor ver no celular.
- O sistema deveria saber o **regime do corretor** (PF com RPA, com retenção de INSS/IR, ou PJ com NFS-e) e calcular o líquido. Nenhum concorrente BR pesquisado documenta isso.
- Pelo achado da Receita, a comissão é custo, não dedução da receita, na visão fiscal da imobiliária no presumido. Isso afeta o DRE gerencial: a receita bruta é a corretagem cheia.

### Gaps
- Não encontrei nenhum sistema BR que documente **adiantamento** de comissão ao corretor ou **descontos** (taxas de mesa, marketing, multa) no repasse. No mundo americano isso é o "agent billing" da Lone Wolf (seção 3).
- Não confirmei se algum sistema BR **gera RPA** ou integra emissão de NFS-e do corretor.

## 3. Software de comissão no exterior (Brokermint/BoldTrail BackOffice, Lone Wolf Back Office, Dotloop, Follow Up Boss): modelo de dados e ideias que transferem

### Takeaway
O núcleo americano tem quatro entidades:
- **Commission Plan** (split, sliding scale, cap, fees), atribuído a agente ou time;
- **Transaction** com o detalhamento financeiro por agente;
- **CDA** (Commission Disbursement Authorization), o documento assinado pelo broker que autoriza o pagamento;
- **Ledger/statement do agente**, com o que ele recebeu e o que deve à imobiliária ("agent billing").

O cap ("depois de X pagos à imobiliária, o agente fica com 100%") é o conceito mais distintivo.

### Cited Findings
- **Brokermint:** os tipos de plano incluem "splits, sliding scales, caps, and fees". O sistema permite "Create, configure, and edit unlimited team or individual plans" e "Automatically apply commission plans to transactions". Também faz cálculo em tempo real por transação e por membro de time, rastreia "deposits and balances", gera **CDAs** e emite "commission statements showcasing detailed breakdowns to promote transparency". Sincroniza com **QuickBooks** para cheques e desembolsos de comissão. — [Brokermint – Commission automation](https://brokermint.com/real-estate-commission-automation/)
- **BoldTrail BackOffice** (nova geração do Brokermint): "Handle splits, fees, sliding scales, and unlimited commission plans". Também anuncia "seamless agent billing", "detailed ledgers for both agents and transactions", "next-day ACH disbursements", plano de contas completo, integração QuickBooks e report builder. — [BoldTrail BackOffice](https://boldtrail.com/backoffice/)
- **Lone Wolf Back Office:** aplica splits, fees, caps e ajustes "the moment a deal closes" e "Automates complex, multi-tiered splits". Caps, splits e fees são customizáveis por agente ou time. O sistema "Automatically generates agent invoices" (cobrança do agente). Tem trust accounting, em que "Every deposit, disbursement, and reconciliation is logged automatically". Folha EUA/Canadá, relatórios por deal, agente ou escritório, orçamento e forecast. — [Lone Wolf – Back office accounting](https://www.lwolf.com/resources/give-your-brokerage-full-control-with-back-office-accounting-software-built-for-real-estate)
- **Lone Wolf:** a aba "Agent Info" de cada transação "captures all of the financial information for the agent as it pertains to this transaction" (base commission, fees, taxes, deductions). O relatório "Annual Commission Summary" mostra comissões pagas e fees/despesas cobradas de um agente em até quatro anos. — snippets de [Lone Wolf Community – Transactions](https://lonewolf.my.site.com/s/article/LWBC-Transactions) e [Report index](https://community.lwolf.com/s/article/LWBC-report-index). O certificado SSL falhou no fetch direto.
- **Lone Wolf (review Capterra):** um usuário relata que, ao escolher "no commission plan" para lançar valor fixo, o sistema "always reverts back to 7/3". O plano padrão sobrescreveu o override. — snippet de [Capterra – Lone Wolf reviews](https://www.capterra.com/p/40368/Lone-Wolf/reviews/) (página deu 403 no fetch)
- **Dotloop:** o dotloop é sobretudo documento e assinatura. A comissão passa por um **template de CDA** "that auto-fills all the needed information from your transaction details" e por integrações (ex.: sync com QuickBooks quando o loop fecha). — [Dotloop blog – commission dashboard](https://www.dotloop.com/blog/2022/03/calculate-real-estate-commissions/); [Dotloop – accounting integrations](https://www.dotloop.com/blog/2019/07/popular-accounting-integrations/)
- **CDA (prática de mercado):** o broker assina o CDA antes do fechamento e autoriza o escrow a dividir os fundos, de modo que o agente recebe direto. — [Lion Drive Realty](https://liondriverealty.com/cda-cash-disbursement-authorization/). É o exemplo de uma corretora, não regra geral.
- **Exemplo de cap:** split 80/20 com cap de US$ 18.000. Depois que a corretora recebe US$ 18 mil no ano, o agente fica com 100%. — [The Close – commission splits](https://theclose.com/real-estate-commission-splits/) (via snippet)
- **Follow Up Boss:** o split do agente nos deals fechados alimenta o "Agent goal report", com "commission earned" no ano. — [FUB – Agent goal report](https://help.followupboss.com/hc/en-us/articles/9707663680407-Agent-goal-report-overview)
- **Preços Brokermint:** fontes de terceiros divergem (US$ 99–149/mês; US$ 49,90/usuário; "standard e professional" sem preço). **Não confiáveis.** — [itqlick](https://www.itqlick.com/brokermint); [softwarefinder](https://softwarefinder.com/accounting-software/brokermint)

### Inferences
Modelo de dados que transfere para o BR, já adaptado:
- `plano_comissao`: regras por papel, como captador, vendedor, gerente (override sobre a equipe) e imobiliária; percentual ou valor fixo; faixas (sliding scale por VGV acumulado); cap anual opcional.
- `negocio_comissao`: valor total a receber, origem (cliente, construtora ou parceiro), parcelas a receber.
- `participacao`: pessoa, papel, %, valor, override manual com justificativa.
- `autorizacao_pagamento`: o "CDA brasileiro", assinado ou aprovado pelo dono antes do pagamento.
- `lancamento_extrato_corretor`: crédito de comissão, débito de adiantamento/taxa, estorno.

Outras inferências:
- A lição do review da Lone Wolf é que **o override por negócio precisa prevalecer sobre o plano padrão e persistir**.
- "Agent billing" (a imobiliária cobra taxas do corretor) tem correspondente no BR: desconto de taxa de marketing, mesa ou anúncios no repasse. Isso entraria como débito no extrato.
- Trust/escrow accounting não se aplica igual no BR, porque não há escrow obrigatório na venda. O sinal pode passar pela imobiliária, então o "dinheiro de terceiros" ainda merece conta separada.

### Gaps
- Sem acesso ao help center oficial do Brokermint/BoldTrail para o esquema exato de plano (nomes de campos, como o cap é contabilizado, fluxo de aprovação do CDA).
- A documentação de mobile do agente (agent portal) não foi localizada.

## 4. Financeiro geral da imobiliária (contas a pagar/receber, fluxo de caixa, DRE, conciliação, NFS-e, boleto)

### Takeaway
Quase todos oferecem um financeiro genérico: contas a pagar e receber, fluxo de caixa, categorias e centros de custo. Os mais maduros (Superlógica, Imobzi, Kenlo Locação) foram construídos em torno da **locação**: boleto, conciliação, repasse ao proprietário, Dimob. Para venda, o financeiro costuma ser **módulo à parte ou opcional**. DRE quase não é citado explicitamente.

### Cited Findings
- **Jetimob:** a página do módulo financeiro descreve:
  - contas a pagar e receber;
  - relatórios "por categoria e centro de custo";
  - dashboards;
  - fluxo de caixa acessível pelo navegador do celular "sem necessidade de baixar aplicativo";
  - integração com vendas e aluguéis.
  - Não cita DRE, conciliação, boleto, Pix nem NFS-e. — [Jetimob – Gestão financeira](https://www.jetimob.com/sistema-gestao-financeira-imobiliaria)
- **Jetimob:** NFS-e aparece como "EM BREVE" na página de planos. O financeiro é módulo opcional. — [Jetimob – Planos](https://www.jetimob.com/planos)
- **Superlógica Imobi (ERP):** "Financeiro com conciliação", "Boletos integrados ao banco", "Nota fiscal integrada", "Geração da DIMOB", "Conta Corrente do Proprietário". O Enterprise traz "análise financeira e previsão orçamentária". O Enterprise PRO traz "Conta Corrente". Tudo isso tem orientação de locação. — [Superlógica – Planos](https://superlogica.com/imobiliarias/planos/)
- **Imobzi:** "Boleto, PIX e cartão gerados e conciliados automaticamente". Inadimplência "monitorada em tempo real". O produto é posicionado para negócios de receita recorrente (aluguel, assinaturas). — [Imobzi](https://www.imobzi.com/)
- **Tecimob:** "Controle Financeiro" com lançamentos de receitas e despesas, contas e cartões, fluxo de caixa e relatórios. Não menciona comissões. O plano parte de R$ 129,90/mês (site + CRM). — [Tecimob](https://tecimob.com.br/)
- **Kenlo:** "Locação" é produto ERP separado do CRM (Imob). — [Loft – comparativo (fonte concorrente)](https://loft.com.br/para-imobiliarias/comparativo/melhor-crm/). O produto de locação cobre "emissão de contratos, cobranças e notas fiscais até o controle de repasses e inadimplência". — via [Kenlo – comparativo](https://www.kenlo.com.br/comparativo/melhor-crm-imobiliario) (snippet)
- **Vista (hoje Loft):** comparativos de terceiros citam CRM de vendas com locação, "cálculo de comissões e conciliação bancária" e o **Vista Pay** para gestão financeira. A Vista foi comprada pela Loft. — [Fusões & Aquisições](https://fusoesaquisicoes.com/acontece-no-setor/loft-compra-vista-empresa-de-software-de-atendimento-e-gestao-imobiliaria/); snippets de comparativos (fonte fraca)
- **Dommus (concorrente) sobre a Superlógica:** a Superlógica tem conciliação bancária automatizada, retenção de IR e repasse a proprietários, mas não tem integração nativa com ERP financeiro. Fonte com interesse comercial. — [Dommus × Superlógica](https://www.dommus.com.br/dommus-ou-superlogica/)
- **Contraste com locação:** "repasse" nos sistemas BR quase sempre quer dizer **repasse ao proprietário** (Jetimob: "Automatizar suas cobranças e repasses"; Superlógica: conta corrente do proprietário), não repasse ao corretor. — [Jetimob – vendas](https://www.jetimob.com/sistema-gestao-vendas-imoveis); [Superlógica – Planos](https://superlogica.com/imobiliarias/planos/)

### Inferences
- Para uma imobiliária pequena de venda, o financeiro precisa ser bem menor que o da locação. Basta:
  - **comissões a receber** por negócio, com parcelas e pagador;
  - **comissões a pagar** a corretores e parceiros;
  - **despesas** (anúncios, portais, aluguel do escritório);
  - **fluxo de caixa projetado**, porque comissão de lançamento entra em parcelas meses depois.
- Boleto, conciliação e Dimob pesam pouco aqui.
- O DRE gerencial por mês (corretagem bruta − comissões pagas − despesas) é diferencial, porque nenhum concorrente BR o destaca.

### Gaps
- DRE explícito não aparece em nenhuma página pesquisada.
- Não confirmei se a NFS-e integrada (Superlógica, Kenlo) serve para a NF da **imobiliária sobre a corretagem de venda** ou só para a taxa de administração da locação.

## 5. Integração com contabilidade (exportações)

### Takeaway
Nos sistemas BR pesquisados, a integração contábil aparece pouco documentada. Há exportação para Excel (Kenlo BI), Dimob (Jetimob, Superlógica) e integração com ERPs de construtora (CV CRM ↔ Sienge). No exterior, o padrão é **sync com QuickBooks** (Brokermint, BoldTrail, Dotloop via integrações) ou contabilidade completa embutida (Lone Wolf, com plano de contas, trust e folha).

### Cited Findings
- **Jetimob:** "Gerar a DIMOB em pouco cliques". A página financeira cita genericamente "rotina contábil e tributária". — [Jetimob – vendas](https://www.jetimob.com/sistema-gestao-vendas-imoveis); [Jetimob – financeiro](https://www.jetimob.com/sistema-gestao-financeira-imobiliaria)
- **Kenlo:** relatórios de fechamento por corretor exportáveis para Excel. — snippet de suporte Kenlo (ver seção 2)
- **CV CRM:** integrações nativas com Sienge, Avendre e Alfamaweb, entre mais de 50 integrações. "Pagadoria" aparece no CV Integrar. — [CV CRM](https://cvcrm.com.br/); [CV CRM – Sienge](https://cvcrm.com.br/integracao/sienge/)
- **Dommus:** integração nativa com seis ERPs (Sienge, Totvs, UAU, MEGA, Siecon, Informakon). É autodeclarado. — [Dommus](https://www.dommus.com.br/dommus-ou-superlogica/)
- **Brokermint:** "Seamlessly sync with QuickBooks". — [Brokermint](https://brokermint.com/real-estate-commission-automation/)
- **Lone Wolf:** plano de contas, trust accounting, folha com W-2/T4 e e-file. — [Lone Wolf](https://www.lwolf.com/resources/give-your-brokerage-full-control-with-back-office-accounting-software-built-for-real-estate)

### Inferences
- Para imobiliária pequena no BR, o "QuickBooks" equivalente é o **contador externo**. A exportação útil seria uma planilha ou CSV mensal com receitas de corretagem (com NF emitida), comissões pagas (com RPA/NF e retenções) e despesas por categoria. A Dimob não se aplica a intermediação de venda da mesma forma que à locação. Conferir com contador.

### Gaps
- Não achei layout de exportação contábil documentado (ex.: arquivo para Domínio/Alterdata/Contmatic) em nenhum sistema BR pesquisado.

## 6. Distrato: estorno/reversão de comissão

### Takeaway
Nenhum sistema de imobiliária pesquisado documenta publicamente um fluxo de "estorno de comissão por distrato". A Sienge tem status de comissão com **cancelamento** (e reativação) e procedimento de exclusão. Juridicamente, a regra geral favorece o corretor: a comissão segue devida se o distrato não decorre de falha dele. O estorno, portanto, é exceção, decidida caso a caso.

### Cited Findings
- **Sienge:** comissões têm status. Cancelar é possível, e uma comissão cancelada precisa ser reativada antes de excluída. — [Ajuda Sienge – excluir comissões](https://ajuda.sienge.com.br/support/solutions/articles/153000201172-como-excluir-comiss%C3%B5es-lancadas-para-o-corretor-no-sienge-)
- **Sienge (blog):** pela Lei do Distrato, a comissão continua devida se o comprador desiste, desde que o corretor tenha feito a intermediação. Incorporadoras precisam prever isso no custo de vendas e no fluxo de caixa. — [Sienge blog](https://sienge.com.br/blog/gestao-de-comissao-de-vendas/)
- **STJ (REsp 1.783.074):** o corretor tem direito à comissão se o negócio se desfaz por fatores alheios à sua atividade. Não é devida se o arrependimento decorre de falta de diligência do intermediador. — [STJ – notícia](https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/Corretor-tem-direito-a-comissao-se-venda-do-imovel-nao-se-concretizou-por-motivo-estranho-a-sua-atividade.aspx)
- **Lei 13.786/2018 (distrato):** no distrato, as quantias são devolvidas ao comprador **deduzida a comissão de corretagem**. Segundo a LinkPay, a construtora pode reter a corretagem, algo em torno de 5% a 6% do valor pago. — [Jusbrasil](https://www.jusbrasil.com.br/artigos/nova-lei-dos-distratos-como-fica-a-comissao-de-corretagem/671739370); [LinkPay](https://linkpay.com.br/lei-dos-distratos/)

### Inferences
Para o produto, o distrato deveria:
1. cancelar as **parcelas futuras** de comissão a receber (construtora ou cliente);
2. manter o que já foi pago, salvo decisão;
3. permitir **estorno parcial** como lançamento de débito no extrato do corretor, se a imobiliária tiver acordo de devolução;
4. registrar o motivo (desistência do comprador, crédito negado, falha do corretor).

Isso se apoia na lógica de status da Sienge e na regra do STJ.

### Gaps
- Não encontrei como Jetimob, Kenlo, Superlógica ou CV CRM tratam o estorno quando a comissão já foi paga ao corretor.

## 7. Mobile: o que o corretor vê sobre dinheiro no celular

### Takeaway
A documentação pública é fraca. A Jetimob diz que dashboards de vendas por corretor, equipe e empreendimento e o fluxo de caixa funcionam no navegador do celular. CV CRM, Imobzi, Superlógica e Tecimob têm apps, mas nenhum documenta uma tela "minhas comissões / quanto tenho a receber" para o corretor. No exterior, a transparência fica nos **commission statements** (Brokermint) e no **goal report** com comissão ganha no ano (Follow Up Boss).

### Cited Findings
- **Jetimob:** dashboards de vendas por corretor, equipe e empreendimento "inclusive pelo seu tablet ou smartphone". O fluxo de caixa fica acessível no navegador do celular sem app. — [Jetimob – vendas](https://www.jetimob.com/sistema-gestao-vendas-imoveis); [Jetimob – financeiro](https://www.jetimob.com/sistema-gestao-financeira-imobiliaria)
- **Tecimob:** o app não cita funções financeiras. — [Tecimob](https://tecimob.com.br/)
- **CV CRM:** apps (Google Play/App Store) levam "gestão comercial ao celular", sem especificar comissão. — [CV CRM](https://cvcrm.com.br/)
- **Superlógica Imobi:** oferece app para corretores (rodízio de leads, IA). Não há menção a comissões. — [Superlógica Imobi](https://imobi.superlogica.com/) (via snippet). A Dommus, concorrente, afirma que a Superlógica não documenta app para a equipe comercial. — [Dommus](https://www.dommus.com.br/dommus-ou-superlogica/)
- **Brokermint:** commission statements com detalhamento "to promote transparency". — [Brokermint](https://brokermint.com/real-estate-commission-automation/)
- **Follow Up Boss:** "commission earned" do agente no ano, a partir dos splits de deals fechados. — [FUB](https://help.followupboss.com/hc/en-us/articles/9707663680407-Agent-goal-report-overview)

### Inferences
- Há espaço vazio no mercado BR para uma tela mobile do corretor com:
  - **a receber** (previsto × liberado);
  - **recebido no mês e no ano**;
  - cada negócio com status da parcela, na linha da barra "% pago" da Sienge;
  - progresso até o cap/meta, na linha do goal report do FUB.
- Isso se alinha à diretriz "painel mobile-first" do projeto.

### Gaps
- Não consegui ver telas reais dos apps (Imoview, Kenlo, Jetimob) nem reviews de loja sobre a parte financeira.

## 8. Faixa de preço em que o financeiro entra; reviews e reclamações

### Takeaway
O financeiro de venda é **add-on ou plano superior** na maioria: Jetimob tem "Gestão financeira" opcional; Kenlo vende Locação separada; na Superlógica, o ERP e o CRM têm planos separados e a conta corrente só vem no Enterprise PRO. Preços públicos são raros e vêm sobretudo de comparativos de concorrentes. Reviews específicos sobre comissão não foram obtidos (Reclame Aqui e Capterra bloquearam ou não retornaram).

### Cited Findings
- **Jetimob:** planos Lite (250 imóveis, 1 usuário), Pro (750 imóveis, 5 usuários) e Enterprise (5.000 imóveis, 10 usuários), sem preço na página. O financeiro é módulo opcional. — [Jetimob – Planos](https://www.jetimob.com/planos). O comparativo da Loft (concorrente, jul/2026) cita "a partir de R$229/mês no anual" e "ERP completo incluso (repasses, reajustes)". — [Loft – comparativo](https://loft.com.br/para-imobiliarias/comparativo/melhor-crm/). Note a contradição com a página de planos da Jetimob, que trata o financeiro como opcional.
- **Kenlo:** "a partir de R$2.964/ano no plano Prime", segundo a Loft. Outro comparativo cita R$ 247/mês no anual, R$ 317/mês, implantação não publicada e fidelidade de 12 meses. — [Loft](https://loft.com.br/para-imobiliarias/comparativo/melhor-crm/); [imobisoft (snippet)](https://imobisoft.com.br/blog/melhor-crm-imobiliario). As fontes divergem.
- **Loft/CRM (ex-Vista):** R$ 129,90/mês para 1 usuário; R$ 65/usuário/mês até 30 usuários. A administração de locação é add-on. — [Loft](https://loft.com.br/para-imobiliarias/comparativo/melhor-crm/). Comparativos antigos citam Vista "a partir de R$99,90" e "R$ 150 a R$ 1,6 mil por mês". — snippets, fonte fraca.
- **Tecimob:** a partir de R$ 129,90/mês, sem fidelidade, teste de 7 dias. — [Tecimob](https://tecimob.com.br/)
- **Superlógica:** os preços não são publicados ("Experimente grátis" no ERP, "Fale com um consultor" no CRM). Conta Corrente só no Enterprise PRO. — [Superlógica – Planos](https://superlogica.com/imobiliarias/planos/)
- **Superlógica/Arbo:** cobra participação sobre a corretagem recebida pela imobiliária (exemplo: 25% da comissão). — [Superlógica HC (snippet)](https://imobiliarias.superlogica.com/hc/pt-br/articles/32803953464215-Como-%C3%A9-apurada-o-valor-da-comiss%C3%A3o-devida-a-arbo)
- **Review Lone Wolf:** o override de plano de comissão não persiste e "always reverts back to 7/3". — [Capterra (snippet)](https://www.capterra.com/p/40368/Lone-Wolf/reviews/)

### Inferences
- Preço de entrada de CRM de venda gira em torno de **R$ 130–230/mês** (Tecimob, Loft, Jetimob), mas sem financeiro de comissão. Um CRM que inclua comissão e extrato do corretor no plano básico tem argumento competitivo para a imobiliária pequena de venda.
- O modelo "revenue share sobre corretagem" (Arbo/Superlógica) existe e é uma referência de precificação alternativa, embora sensível.

### Gaps
- **Reclame Aqui:** não consegui extrair reclamações sobre financeiro ou comissão de Superlógica, Jetimob, Kenlo ou Imoview.
- **Capterra/G2:** só um review da Lone Wolf, via snippet. Não houve reviews de Brokermint.
- **Imoview, Union e Vista:** sem preço nem detalhes financeiros verificados.
