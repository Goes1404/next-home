# Regras fiscais, tributárias e legais do financeiro de uma imobiliária de intermediação de venda e de seus corretores (Brasil, out/2026)

> Nota de método: pesquisa feita em 29/10/2026. O texto da LC 214/2025, da LC 123/2006 e da Lei 6.530/78 no planalto.gov.br só foi lido de fato na Lei 6.530 (a página da LC 214 veio truncada e o download direto foi bloqueado). Por isso, vários pontos da reforma tributária se apoiam em fontes secundárias (blogs de contabilidade e consultorias) e estão marcados como "confirmar no texto legal". Itens tirados do conhecimento prévio e sem fonte achada nesta pesquisa estão em **Inferências** ou **Lacunas**, nunca em "Cited Findings".

## 1. Regime tributário da imobiliária: Simples Nacional (anexo, Fator R, alíquotas) × Lucro Presumido, e como estimar o imposto do mês

### Takeaway
Corretagem de imóveis no Simples Nacional cai no **Anexo III sem Fator R**. O Fator R só pesa para a *administração* de imóveis de terceiros (Anexo III ou V) e para a avaliação de imóveis. No Lucro Presumido a carga sobre a receita de serviço fica entre **~11,33% e ~16,33%**: IRPJ e CSLL com presunção de 32%, PIS e COFINS cumulativos de 3,65%, e ISS de 2% a 5%. Desde 2026, a LC 224/2025 sobe a presunção em 10% sobre a receita anual que passar de R$ 5 milhões.

### Cited Findings
- Corretagem de imóveis é Anexo III da LC 123/2006 e não depende do Fator R, porque o Fator R só manda para o Anexo V as atividades do art. 18, §5º-M, e a corretagem não está entre elas. Já a taxa de administração de imóveis de terceiros depende do Fator R: Anexo III com folha ≥ 28% da receita bruta, Anexo V abaixo disso. Há divergência entre fontes sobre o dispositivo exato: guias antigos citam o art. 18, §4º, III — [ContabilEasy, "Imobiliária no Simples Nacional: Fator R e Anexo III em 2026"](https://contabileasy.com.br/imobiliaria-no-simples-nacional/)
- O Rotina Fiscal enquadra "somente corretagem na compra e venda de imóveis" no Anexo III e cita o art. 18, §4º, III ("corretagem de imóveis desde que observado o disposto no inciso XV do art. 17") e o §5º-F da LC 123. Avaliação de imóveis vai ao Anexo V/Fator R. A página parou de ser atualizada em 31/12/2024 — [Rotina Fiscal, Corretagem de imóveis](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis)
- ISS da corretagem: item **10.05** da lista da LC 116/2003 ("Agenciamento, corretagem ou intermediação de bens móveis ou imóveis"). Em São Paulo o código de serviço é 06297. A página cita alíquota de 5% para não optantes do Simples (em SP) — [Rotina Fiscal](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis)
- Carga no Lucro Presumido para corretagem: as fontes dão faixas de 13,33%–16,33% e de 11,33%–16,33%. A base de IRPJ e CSLL é 32% da receita de serviços — [ContabilEasy](https://contabileasy.com.br/imobiliaria-no-simples-nacional/); [Contabilidade.com](https://contabilidade.com/blog/quanto-um-corretor-de-imoveis-paga-de-imposto-veja-a-tributacao-como-autonomo-simples-nacional-e-lucro-presumido/)
- **LC 224/2025** (sancionada em 26/12/2025, em vigor desde 01/01/2026): os percentuais de presunção do Lucro Presumido sobem 10% **somente sobre a receita bruta anual acima de R$ 5 milhões**. Para serviços, 32% vira 35,2% sobre o excedente. O controle é trimestral e proporcional (R$ 1,25 milhão por trimestre), então a majoração pode aparecer antes do fim do ano. Regulamentação: Decreto 12.808/2025 e IN RFB 2.305/2025. A regra está sendo contestada na Justiça (mandados de segurança) — [Contábeis, "Lucro presumido terá aumento de 10% na base do IRPJ e CSLL em 2026"](https://www.contabeis.com.br/noticias/75261/lucro-presumido-tera-aumento-de-10-na-base-do-irpj-e-csll-em-2026/); [Conjur, 07/01/2026](https://www.conjur.com.br/2026-jan-07/a-lei-complementar-no-224-2025-e-o-esvaziamento-progressivo-do-lucro-presumido//?print=1); [Fortes Advogados, 27/01/2026](https://www.fortes.adv.br/2026/01/27/alteracoes-no-lucro-presumido-a-partir-de-2026-o-que-muda-na-pratica/)
- Uma empresa do Simples Nacional que tem só pró-labore também transmite eSocial e DCTFWeb, a DEFIS anual e, em SP, TFE e DAI (declaração de responsabilidade de agentes e corretores) — [Rotina Fiscal](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis)

### Inferences
- **Tabela do Anexo III (redação da LC 155/2016, de conhecimento prévio; não consegui ler o planalto nesta pesquisa, confirmar antes de codificar):**

  | Faixa | RBT12 | Alíquota nominal | Parcela a deduzir |
  |---|---|---|---|
  | 1 | até R$ 180.000 | 6,00% | 0 |
  | 2 | 180.000,01–360.000 | 11,20% | 9.360 |
  | 3 | 360.000,01–720.000 | 13,50% | 17.640 |
  | 4 | 720.000,01–1.800.000 | 16,00% | 35.640 |
  | 5 | 1.800.000,01–3.600.000 | 21,00% | 125.640 |
  | 6 | 3.600.000,01–4.800.000 | 33,00% | 648.000 |

  Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12. O DAS do mês = receita do mês × alíquota efetiva. O RBT12 é a receita bruta dos 12 meses *anteriores* ao período de apuração. No Anexo III a CPP (INSS patronal) já está dentro do DAS. Por isso a imobiliária do Simples **não** paga os 20% patronais sobre o RPA de autônomos, mas continua retendo os 11% do autônomo (ver §3). Também de conhecimento prévio, confirmar.
- **Estimativa mensal no Lucro Presumido (modelo para o módulo):** PIS 0,65% e COFINS 3,00% sobre a receita do mês (cumulativo). ISS conforme o município (mínimo constitucional de 2%, máximo de 5%). IRPJ trimestral: 15% × (32% × receita do trimestre), mais adicional de 10% sobre a parte da base presumida acima de R$ 60 mil no trimestre. CSLL trimestral: 9% × (32% × receita). Sem adicional, a carga federal fica em 4,8% + 2,88% + 3,65% = 11,33%, e somando o ISS chega a 13,33%–16,33%, o que bate com as faixas citadas. Acima de R$ 5 milhões por ano, usar 35,2% de presunção sobre o excedente (LC 224/2025).
- Para o módulo financeiro, o número que importa é a **receita que a imobiliária reconhece** (ver §2). Se ela reconhece a comissão cheia em vez da sua cota-parte, o RBT12 do Simples sobe de faixa e todos os tributos incidem também sobre o que vai para o corretor.

### Gaps
- Não li o texto oficial do art. 18 da LC 123 (planalto bloqueou o acesso), então o dispositivo exato da corretagem no Anexo III (§4º, III ou §5º-B) fica por confirmar.
- Não confirmei se a parcela de ISS no DAS do Anexo III tem limite de 5% de alíquota efetiva para a corretagem (regra geral do Simples para a parcela do ISS).

## 2. Receita bruta da imobiliária: comissão inteira ou só a cota-parte? Corretor associado (Lei 13.097/2015) e co-corretagem

### Takeaway
A Lei 13.097/2015 incluiu os §§2º–4º no art. 6º da Lei 6.530/78 e criou o **corretor associado**. É um contrato de associação registrado no sindicato, em que as partes "ajustam critérios para a partilha dos resultados" e que "não implica troca de serviços, pagamentos ou remunerações" entre imobiliária e corretor. A leitura do mercado é que cada parte é tributada sobre a sua cota, e daí vem a prática de cada um emitir nota da própria cota-parte. Mas **não achei Solução de Consulta COSIT** que confirme a exclusão da cota do associado da receita bruta da imobiliária. Uma proposta legislativa com essa regra expressa (PLS 365/2017) sugere que ela não está explícita em lei. Na reforma tributária (IBS/CBS a partir de 2027), fontes secundárias citam regra expressa da LC 214 (art. 255, §§3º–4º): cada corretor paga só sobre a parte da comissão que fica com ele.

### Cited Findings
- Texto legal (Lei 6.530/78, art. 6º, redação da Lei 13.097/2015) — [Planalto, Lei 6.530/78](https://www.planalto.gov.br/ccivil_03/leis/l6530.htm):
  - §1º: a pessoa jurídica precisa ter como sócio-gerente ou diretor um corretor de imóveis inscrito individualmente.
  - §2º: "O corretor de imóveis pode associar-se a uma ou mais imobiliárias, mantendo sua autonomia profissional, sem qualquer outro vínculo, inclusive empregatício e previdenciário, mediante contrato de associação específico, registrado no Sindicato dos Corretores de Imóveis ou, onde não houver sindicato instalado, registrado nas delegacias da Federação Nacional de Corretores de Imóveis."
  - §3º: imobiliária e associado "coordenam, entre si, o desempenho de funções correlatas à intermediação imobiliária e ajustam critérios para a partilha dos resultados da atividade de corretagem, mediante obrigatória assistência da entidade sindical."
  - §4º: "O contrato de associação não implica troca de serviços, pagamentos ou remunerações entre a imobiliária e o corretor de imóveis associado, desde que não configurados os elementos caracterizadores do vínculo empregatício previstos no art. 3º da CLT".
- O PLS 365/2017 (Senado) **propõe** que a cota-parte destinada ao corretor associado não entre no cômputo da receita bruta da imobiliária. É texto de projeto, não de lei vigente confirmada — [Senado, documento do PLS](https://legis.senado.leg.br/sdleg-getter/documento?dm=7209888)
- Em julho de 2026, o CRECI-ES e a entidade sindical publicaram uma "Nota conjunta – esclarecimento corretor associado". Pelo resumo da busca, ela diz que a associação é opcional para as duas partes e precisa ser registrada no sindicato. O PDF é escaneado e não consegui extrair o texto — [CRECI-ES, nota conjunta 2026](https://crecies.gov.br/wp-content/uploads/2026/07/NOTA_CONJUNTA_-ESCLARECIMENTO_CORRETOR_ASSOCIADO.pdf)
- Jurisprudência trabalhista recente vem consolidando a validade dos contratos de associação quando a autonomia é real — [Monitor Mercantil](https://monitormercantil.com.br/corretores-de-imoveis-e-imobiliarias-autonomia-profissional-e-a-consolidacao-jurisprudencial-dos-contratos-de-associacao/). A Lei 13.097 foi criticada por gerar insegurança sobre vínculo empregatício — [Jornal Contábil](https://jornalcontabil.com.br/noticia/corretores-de-imoveis-nova-lei-traz-inseguranca-vinculo-empregaticio/)
- Risco previdenciário: houve decisão da Câmara Superior de Recursos Fiscais (CARF) mantendo cobrança de contribuição previdenciária sobre comissões de corretores, e também decisão do CARF afastando a tributação de comissões recebidas por corretores. O tema é litigioso — [IRIB](https://www.irib.org.br/?p=104211); [COAD, "Decisão do Carf afasta tributação de comissões recebidas por corretores"](https://www.coad.com.br/home/noticias-detalhe/84318/decisao-do-carf-afasta-tributacao-de-comissoes-recebidas-por-corretores)
- IBS/CBS (a partir de 2027), por fonte secundária: LC 214/2025 art. 255, §§3º e 4º, regula a intermediação com vários corretores. "Cada corretor recolhe o IBS e a CBS apenas sobre a parte da comissão que efetivamente ficar com ele". Ficam de fora os valores pagos pelo cliente diretamente a outros corretores e os repasses entre corretores. Na administração, a base é só a taxa de administração, não o aluguel — [Radar da Reforma Tributária, publicado em 14/04/2026, atualizado em 10/09/2026](https://radardareformatributaria.com/corretor-imoveis-ibs-cbs-tributacao-intermediacao-reforma-tributaria/)

### Inferences
- **Modelo de dados recomendado:** cada comissão deve guardar (a) o valor bruto pago pelo cliente, (b) o rateio por beneficiário (imobiliária, corretor associado, corretor autônomo via RPA, imobiliária parceira na co-corretagem) e (c) quem fatura cada parte: nota da imobiliária só pela sua cota, nota ou RPA do corretor pela dele, e eventualmente pagamento direto do cliente a cada um. A "receita bruta" tributável da imobiliária depende de **como o dinheiro e as notas circulam**:
  - Associado com nota própria (ou cliente pagando cada um diretamente): a imobiliária tende a reconhecer só a sua cota.
  - Imobiliária recebe 100% e paga o corretor por RPA: a comissão cheia é receita dela e o pagamento ao corretor é despesa/custo, com retenções (ver §3).
  - Essa distinção decide faixa do Simples, base de PIS/COFINS/ISS e, a partir de 2027, a base de IBS/CBS.
- Co-corretagem entre duas imobiliárias: por analogia, cada imobiliária fatura e tributa a sua parte. O art. 255 da LC 214 (fonte secundária) vai nessa direção para IBS/CBS. Para ISS, PIS/COFINS e IRPJ não achei norma específica.
- Como o §4º condiciona a ausência de "pagamentos ou remunerações" à falta dos elementos de vínculo da CLT (subordinação, habitualidade, onerosidade, pessoalidade), o módulo não deveria tratar o associado como "folha" (metas impostas, jornada). Isso é risco trabalhista e previdenciário, não só fiscal.

### Gaps
- **Não encontrei Solução de Consulta COSIT** específica sobre a exclusão da cota-parte do corretor associado da receita bruta da imobiliária (IRPJ, CSLL, PIS/COFINS, Simples). Buscar no sistema Normas da RFB ("corretor associado" "receita bruta") antes de fixar a regra no produto.
- Não consegui ler o texto da nota conjunta do CRECI-ES de jul/2026 (PDF escaneado).
- Tratamento de ISS municipal para a cota-parte: depende de cada município (ex.: a Resolução SMF 2.902/2016 do Rio apareceu na busca e não foi lida).
- O texto oficial do art. 255 da LC 214 não foi conferido no planalto.

## 3. Corretor autônomo pago por RPA: INSS, IRRF 2026, ISS, eSocial/EFD-Reinf; MEI; corretor PJ

### Takeaway
No RPA a imobiliária **retém 11% de INSS** do autônomo (limitado ao teto de 2026, **R$ 8.475,55**). Se não for do Simples Anexo III, paga também **20% patronal**. Retém ainda o IRRF pela tabela progressiva com o **redutor da Lei 15.270/2025**, que zera o imposto até R$ 5.000/mês e reduz entre R$ 5.000,01 e R$ 7.350. O RPA é informado no **eSocial (S-1200/S-1210)**, não na EFD-Reinf. **Corretor de imóveis não pode ser MEI.** Corretor PJ emite NFS-e.

### Cited Findings
- **Lei 15.270/2025**, em vigor desde jan/2026: IRRF zerado para rendimentos mensais até R$ 5.000,00, redutor decrescente entre R$ 5.000,01 e R$ 7.350,00, e tabela tradicional acima disso. A tabela progressiva (faixas, alíquotas, parcelas a deduzir) **não mudou**; o redutor é aplicado depois do cálculo convencional. Faixa isenta da tabela mensal: R$ 2.428,80 — [Alterdata, "Como funciona o novo cálculo do IRRF em 2026"](https://ajuda.alterdata.com.br/dpbase/como-funciona-o-novo-calculo-do-irrf-em-2026-e-como-ficara-no-sistema-308710172.html); [DIEESE, Nota Técnica 290/2026](https://www.dieese.org.br/notatecnica/2026/notaTec290isencaoIR.pdf); [Contabilizei, mudanças para autônomos](https://www.contabilizei.com.br/contabilidade-online/isencao-imposto-de-renda-ate-5-mil-mudancas-para-autonomos/)
- **Teto do INSS 2026: R$ 8.475,55** (Portaria Interministerial MPS/MF nº 13, de 09/01/2026). Salário mínimo 2026: R$ 1.621,00 — [Marra CLT, Teto INSS 2026](https://www.marraclt.com.br/salario/teto-inss-2026-tabela-aliquotas-desconto-folha)
- A empresa que contrata autônomo desconta e recolhe **11% de INSS** sobre a remuneração, limitado ao teto. A Reforma Tributária não muda essa regra — [Contabilizei, Cálculo RPA 2026](https://www.contabilizei.com.br/contabilidade-online/calculo-rpa-recibo-pagamento-autonomo/); [Trivium Contábil, RPA](https://triviumcontabil.com.br/recibo-de-pagamento-autonomo-rpa/)
- Fluxo do RPA: a tomadora registra o bruto, aplica as retenções (INSS, IRRF e, quando cabível, ISS), recolhe e paga o líquido. O pagamento é informado no eSocial — [Trivium Contábil](https://triviumcontabil.com.br/recibo-de-pagamento-autonomo-rpa/)
- **eSocial × EFD-Reinf:** segundo o Manual da EFD-Reinf v2.1.2.1, os rendimentos do trabalho, com ou sem vínculo, vão **somente ao eSocial** (S-1200 para a remuneração, S-1210 para o pagamento, que alimenta o IRRF). A EFD-Reinf entra só em exceções (beneficiário no exterior, sem CPF etc.) — [Econet, "Onde informar RPA: eSocial ou EFD-Reinf" (dez/2025)](https://blog.econeteditora.com.br/onde-informar-rpa-esocial-ou-efdreinf.md); [Portal SPED Brasil, fórum](https://portalspedbrasil.com.br/?p=7371)
- **MEI:** corretor de imóveis não pode ser MEI, porque a corretagem é profissão regulamentada (CRECI) e não está na lista de ocupações permitidas. A alternativa é ME no Simples (Anexo III). Um projeto de lei de 2022 queria permitir o MEI para corretores, sem confirmação de aprovação — [Contabilizei, "Corretor de imóveis não pode ser MEI"](https://www.contabilizei.com.br/contabilidade-online/corretor-imoveis-mei/); [Jornal Contábil](https://jornalcontabil.com.br/noticia/dia-do-corretor-de-imoveis-este-profissional-pode-ser-mei/); [Meu Contador Online](https://www.meucontadoronline.com.br/blog/corretor-de-imoveis-pode-ser-mei/)

### Inferences
- **Cálculo do RPA no módulo (base legal de conhecimento prévio, confirmar):**
  1. INSS do autônomo: 11% × bruto, limitado a 11% × R$ 8.475,55 = R$ 932,31 por mês, somando todas as fontes pagadoras do mês (o corretor que recebe de várias imobiliárias informa as retenções das outras). Base: art. 4º da Lei 10.666/2003.
  2. INSS patronal: 20% × bruto, **sem teto** (art. 22, III, da Lei 8.212/91), para Lucro Presumido ou Real. No Simples Anexo III, já está dentro do DAS.
  3. IRRF: base = bruto − INSS retido (− dependentes, ou desconto simplificado mensal quando mais vantajoso). Aplica-se a tabela progressiva e depois o redutor da Lei 15.270/2025. O fato gerador é o **pagamento** (regime de caixa), por isso o redutor considera o total pago ao beneficiário no mês pela mesma fonte.
  4. ISS: o autônomo inscrito no município costuma pagar ISS fixo anual. Se não comprovar inscrição, alguns municípios obrigam a tomadora a reter ISS sobre o RPA. É regra municipal (LC 116, art. 6º, e leis locais).
- Na imobiliária do Simples, o RPA a corretor custa **bruto + 0%** de encargo patronal. Na do Presumido, **bruto + 20%**. Esse é um dos principais argumentos de custo entre RPA, associado com nota própria e corretor PJ, e o módulo pode simular os três.
- Corretor PJ (ME no Simples Anexo III) emite NFS-e da sua parte. Por ser optante do Simples, não sofre retenção de IRRF de 1,5% nem de INSS da imobiliária pagadora (ver §8).
- **Fim da DIRF:** de conhecimento prévio (não confirmado nesta pesquisa), a DIRF foi extinta a partir do ano-calendário 2025 e as informações passaram para eSocial e EFD-Reinf. Ver §9.

### Gaps
- Não achei fonte primária desta rodada para os 20% patronais sobre contribuinte individual, para a alíquota de 11% (Lei 10.666) ou para os valores exatos do redutor (fórmula R$ 978,62 − 0,133145 × rendimento, de conhecimento prévio, **não verificado**). Conferir na Lei 15.270/2025 antes de codificar.
- A regra de retenção de ISS do autônomo varia por município. Não pesquisada para o município do cliente.

## 4. NFS-e Padrão Nacional: obrigatoriedade 2026, emissor nacional, Simples Nacional, layout IBS/CBS

### Takeaway
A LC 214/2025 obrigou **todos os municípios** a aderirem ao padrão nacional da NFS-e até **01/01/2026**. Eles podem usar o emissor nacional ou manter emissor próprio compartilhando os dados com o Ambiente de Dados Nacional (ADN), sob pena de suspensão de transferências voluntárias. Para **ME/EPP do Simples**, uma resolução do CGSN tornou obrigatório emitir pelo **Emissor Nacional**, com data reportada de 01/09/2026, depois adiada para **01/11/2026** segundo fonte não oficial. Confirmar.

### Cited Findings
- Todos os municípios devem aderir ao padrão nacional da NFS-e até 01/01/2026 (LC 214/2025). Há duas formas: autorizar a emissão no ambiente nacional ou manter emissor próprio e compartilhar os documentos com o ADN. Sanção: suspensão de transferências voluntárias e reflexos no seguro-receita da transição do IBS — [Contábeis, "NFS-e nacional será obrigatória para municípios a partir de 2026"](https://www.contabeis.com.br/noticias/71679/nfs-e-nacional-sera-obrigatoria-para-municipios-a-partir-de-2026/); [TCE-RS](https://tcers.tc.br/noticia/adesao-ao-padrao-nacional-da-nfs-e-e-obrigatoria-e-prazo-limite-se-aproxima/); [CNM](https://cnm.org.br/comunicacao/noticias/cnm-publica-nota-tecnica-que-reforca-a-importancia-sobre-adesao-dos-municipios-a-nfs-e-nacional)
- Os municípios não precisam extinguir de imediato os seus sistemas próprios, mas precisam compartilhar as notas com o ambiente nacional — [TOTVS, "NFS-e Nacional: o que ninguém te explica"](https://www.totvs.com/blog/fiscal-clientes/nfs-e-nacional-o-que-ninguem-te-explica-sobre-adesao-operacao-e-reforma-tributaria/)
- **Simples Nacional:** a Resolução CGSN nº 189/2026 torna obrigatória, a partir de 01/09/2026, a emissão no padrão nacional, **exclusivamente pelo Emissor Nacional**, para ME/EPP optantes prestadoras de serviço sujeito a ISS. Um texto mais recente diz que a Resolução CGSN nº 191 adiou para **01/11/2026**. **Não verificado em fonte oficial** — [Meu Contador Online, NFS-e Nacional 2026](https://www.meucontadoronline.com.br/blog/nfs-e-nacional-2026-mudancas/); [Contábeis, artigo 77741](https://www.contabeis.com.br/artigos/77741/nfs-e-nacional-obrigatoriedade-prazos-e-impacto-contabil/)
- O prazo de adequação ao novo leiaute do DANFSE foi prorrogado para 03/08/2026 (fonte única) — [Meu Contador Online](https://www.meucontadoronline.com.br/blog/nfs-e-nacional-2026-mudancas/)
- Fato gerador e local da operação no IBS/CBS: para "serviço de administração e intermediação de bem imóvel", o local da operação é "o local onde o imóvel estiver situado" (LC 214/2025, art. 11, II) — [Planalto, LC 214/2025](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm)

### Inferences
- Para o módulo financeiro de uma imobiliária pequena do Simples, a integração mais direta é a **API do Emissor Nacional** (Sefin Nacional / ADN, gov.br/nfse), que dispensa integrar dezenas de prefeituras. Se a obrigatoriedade CGSN de 01/11/2026 se confirmar, emitir por emissor municipal deixa de ser opção para ME/EPP.
- O código de serviço da NFS-e nacional segue a lista da LC 116 (subitem 10.05 para corretagem). Como o local do IBS/CBS é o do imóvel (art. 11, II), a nota precisa carregar o município do imóvel, que pode ser diferente do município da sede.

### Gaps
- Não conferi no gov.br/nfse o texto das Resoluções CGSN 189/2026 e 191/2026, nem a lista oficial de municípios aderidos.
- Não achei detalhes oficiais dos campos de IBS/CBS no leiaute da NFS-e (grupo IBSCBS, cClassTrib, CST). Consultar as notas técnicas do portal NFS-e.

## 5. Reforma tributária (LC 214/2025): fase de teste 2026, regime de bens imóveis para corretagem, impactos 2027+ no Simples

### Takeaway
Em 2026, CBS 0,9% e IBS 0,1% aparecem destacados na nota sem recolhimento efetivo, desde que as obrigações acessórias sejam cumpridas. O **Simples Nacional está dispensado em 2026** e só destaca a partir de 2027. Intermediação e administração de imóveis estão no **regime específico de bens imóveis**, com **redução de 50% nas alíquotas** (art. 261, fonte secundária), fato gerador no **pagamento** da comissão e base = parte da comissão que fica com cada corretor. Em 2027 a CBS entra cheia e PIS/COFINS acabam. O ISS só é extinto em 2033. A opção do Simples pelo regime "híbrido" (IBS/CBS fora do DAS) tinha janela até **30/09/2026**.

### Cited Findings
- 2026, ano-teste: CBS 0,9% e IBS 0,1% (arts. 343 e 346 da LC 214), destacados na nota sem aumento efetivo de carga se as obrigações acessórias forem cumpridas. **Simples Nacional e MEI dispensados em 2026**, destaque só a partir de 2027. A nota técnica da NF-e prevê produção para optantes do Simples em 04/01/2027 — [reformatributaria.com, "Empresas do Simples Nacional não estão obrigados às alíquotas teste de IBS/CBS em 2026"](https://www.reformatributaria.com/empresas-do-simples-nacional-nao-estao-obrigados-as-aliquotas-teste-de-ibs-cbs-em-2026/); [CRC-MG, Adequações NF-e 2026](https://crcmg.org.br/wp-content/uploads/2025/07/Adequacoes-NF-e-para-2026-CRC-MG.pdf)
- Divergência: uma fonte fala de carga adicional temporária compensável com outros tributos. As demais dizem que não há cobrança efetiva em 2026 — [Escola Superior ESN](https://escolasuperioresn.com.br/?p=9774); [Trivium Contábil](https://triviumcontabil.com.br/ibs-e-cbs-quando-comeca/)
- Opção do Simples por apurar IBS/CBS fora do DAS (regime regular/"híbrido", que gera crédito ao tomador PJ): prazo citado de **30/09/2026**, com efeito em 2027. Sem a opção, IBS/CBS seguem dentro do DAS. Em 2027 a CBS fica cheia, PIS/COFINS são extintos e o IBS segue em 0,1%. A alíquota cheia definitiva depende de resolução do Senado — [Meu Contador Online, "Alíquota do IBS e da CBS em 2027"](https://www.meucontadoronline.com.br/blog/aliquota-do-ibs-e-da-cbs-quanto-empresa-vai-pagar-em-2027/); [Contmatic](https://simplifique.contmatic.com.br/blogs/simples-nacional-ibs-cbs-reforma-tributaria-2026)
- Regime de bens imóveis, por fonte secundária: art. 252, IV, inclui intermediação e administração. Art. 263, VI: o contribuinte é o prestador (corretor ou imobiliária). Art. 254, IV: o fato gerador ocorre no **pagamento** da comissão, cada parcela é um fato gerador e comissão não paga não gera fato gerador. Art. 255, §§3º–4º: vários corretores, cada um tributado pela sua parte. Art. 261: **redução de 50%**. A alíquota de referência estimada é de 26,5%, o que daria ~13,25% efetiva. O próprio site marca isso como "a confirmar" — [Radar da Reforma Tributária (corretor)](https://radardareformatributaria.com/corretor-imoveis-ibs-cbs-tributacao-intermediacao-reforma-tributaria/); [Radar da Reforma, redução de 50%](https://radardareformatributaria.com/aliquota-reduzida-50-imoveis-reforma-tributaria-ibs-cbs-lc214/)
- A redução de 50% é **na alíquota**, não na base: "a comissão não é cortada pela metade". Também não reduz o crédito sobre entradas — [Radar da Reforma, erros de cálculo](https://radardareformatributaria.com/corretor-imoveis-calculo-ibs-cbs-erros-2027-reducao-50/); [A1 Conta](https://a1conta.com.br/ibs-cbs-incorporacao-imobiliaria/)
- Corretagem e taxa de administração migram do ISS para IBS/CBS com alíquota reduzida em 50% no regime regular — [apresenta.me, Reforma tributária no mercado imobiliário 2026–2027](https://apresenta.me/blog/reforma-tributaria-no-mercado-imobiliario-em-2026-e-2027/)
- Locação, cessão onerosa e arrendamento têm redução de 70% (art. 261, parágrafo único). A LC 227/2026 alterou o capítulo de imóveis — [Radar da Reforma](https://radardareformatributaria.com/aliquota-reduzida-50-imoveis-reforma-tributaria-ibs-cbs-lc214/); [Levy & Salomão, guia imobiliário atualizado (mar/2026)](https://www.levysalomao.com.br/files/publicacao/anexo/20260304190446_guia-atualizado-imobiliario.pdf)
- Corretor PF: por fonte secundária, não é contribuinte automático. Depende de critérios de receita e escala do regime regular e ainda aguarda regulamentação. Pessoas jurídicas são contribuintes independentemente do volume — [Radar da Reforma](https://radardareformatributaria.com/corretor-imoveis-ibs-cbs-tributacao-intermediacao-reforma-tributaria/)

### Inferences
- **Para a imobiliária do Simples que fica no DAS** (o caso típico): em 2027 nada muda no cálculo do DAS, e a partilha interna troca PIS/COFINS por CBS. A redução de 50% do regime de imóveis *não* se aplica dentro do DAS, que tem alíquota própria. O módulo só precisa do destaque informativo na NFS-e a partir de 2027.
- **Se a imobiliária optou pelo regime regular de IBS/CBS** (prazo de 30/09/2026 já passou na data desta pesquisa), o módulo vai precisar apurar IBS/CBS em regime de **caixa** (fato gerador no pagamento), com alíquota reduzida em 50% sobre a cota da imobiliária, e controlar créditos.
- Cronograma de conhecimento prévio (não confirmado aqui): ISS e ICMS caem 10%/20%/30%/40% em 2029–2032 e são extintos em 2033; o IBS sobe na mesma proporção.

### Gaps
- **Texto oficial dos arts. 251–270 da LC 214/2025 não verificado** (planalto truncado/bloqueado). Os números dos artigos (252, 254, 255, 261, 263) vêm de fonte secundária. Também não verifiquei as mudanças da LC 227/2026 no capítulo.
- A alíquota de referência efetiva de 2027 (CBS) e a situação regulamentar do corretor PF como contribuinte (art. 21 e seguintes) seguem em aberto.
- Não confirmei em fonte oficial o prazo e a forma da opção do Simples pelo regime regular de 2027.

## 6. DIMOB

### Takeaway
A DIMOB (IN RFB 1.115/2010) **continua exigida em 2026**. É obrigatória para PJ e equiparadas que intermediam aquisição, alienação ou aluguel de imóveis, inclusive a imobiliária de venda. O prazo é o **último dia útil de fevereiro**: DIMOB 2026 (ano-calendário 2025) venceu em 27/02/2026, e a DIMOB 2027 (ano-calendário 2026) vence em **26/02/2027**. A multa citada é de R$ 5.000 por mês-calendário de atraso. Não achei notícia de extinção ou substituição.

### Cited Findings
- Base legal: IN RFB nº 1.115/2010. Obrigatória para "pessoas jurídicas e equiparadas" que intermediarem aquisição, alienação ou aluguel de imóveis — [Rotina Fiscal](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis)
- A obrigação é do intermediário (imobiliária ou administradora), não do proprietário PF — [GeraContratos, DIMOB 2026](https://geracontratos.com.br/recursos/como-declarar-dimob-2026)
- Prazo: último dia útil de fevereiro. DIMOB 2026 até 27/02/2026, 20h (Brasília). Uma fonte diverge e fala em 28/02 — [Direto Legaliza](https://diretolegaliza.com/?p=7045); [GeraContratos](https://geracontratos.com.br/recursos/dimob-2026-guia)
- DIMOB 2027 (ano-calendário 2026): prazo em 26/02/2027 — [ContaJá, DIMOB 2027](https://contaja.com.br/blog/dimob/)
- Multa por atraso: R$ 5.000 por mês-calendário. A denúncia espontânea pode afastar ou reduzir a multa — [Contábeis](https://www.contabeis.com.br/noticias/32618/prazo-para-entrega-da-dimob/); [GeraContratos](https://geracontratos.com.br/recursos/dimob-2026-guia)
- Corretor PJ também pode estar obrigado à DIMOB — [Meu Contador Online, DIMOB 2026 para corretor PJ](https://www.meucontadoronline.com.br/blog/dimob-2026-2/)

### Inferences
- Para venda intermediada, a DIMOB pede por operação: dados do vendedor e do comprador (CPF/CNPJ), data, valor da operação, valor da **comissão**, endereço e inscrição do imóvel. De conhecimento prévio, conferir o leiaute vigente da IN 1.115/2010. O módulo deveria guardar esses campos por negócio fechado e gerar o arquivo ou relatório anual.
- Com corretor PJ ou co-corretagem, cada PJ intermediadora tende a declarar a sua participação. Isso exige saber quem é o intermediário declarante em cada negócio.

### Gaps
- Nenhuma fonte oficial da RFB foi consultada nesta rodada sobre o leiaute 2026/2027 ou sobre eventual substituição da DIMOB por dados da NFS-e nacional ou da reforma. Não achei menção de extinção, mas é ponto a monitorar.

## 7. CRECI/COFECI e Lei 6.530/78: comissão, recebimento, contrato de intermediação

### Takeaway
A Lei 6.530/78 reserva a intermediação na compra, venda, permuta e locação ao corretor inscrito (art. 3º) ou à PJ inscrita no CRECI, que precisa de sócio-gerente ou diretor corretor (art. 6º, §1º). O COFECI baixa as normas de ética e elabora o **contrato-padrão de corretagem, de observância obrigatória** (art. 16, V e VI). Os percentuais de comissão (6% a 8% em venda urbana, por exemplo) vêm de **tabelas regionais** de CRECI e sindicatos, não da lei federal.

### Cited Findings
- Art. 3º: "Compete ao Corretor de Imóveis exercer a intermediação na compra, venda, permuta e locação de imóveis". Parágrafo único: atribuições também exercíveis por "pessoa jurídica inscrita nos termos desta lei". Art. 4º: a inscrição é objeto de Resolução do COFECI. Art. 6º, caput: a PJ inscrita tem os mesmos deveres e direitos da PF — [Planalto, Lei 6.530/78](https://www.planalto.gov.br/ccivil_03/leis/l6530.htm)
- Art. 16, compete ao COFECI: "V – baixar normas de ética profissional; VI – elaborar contrato padrão para os serviços de corretagem de imóveis, de observância obrigatória pelos inscritos". Art. 17, aos CRECIs: decidir inscrições e manter o registro de PF e PJ — [Planalto, Lei 6.530/78](https://www.planalto.gov.br/ccivil_03/leis/l6530.htm)
- Registro do profissional e do contrato social da imobiliária no CRECI é obrigação recorrente da imobiliária — [Rotina Fiscal](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis)

### Inferences
- De conhecimento prévio, **não verificado nesta rodada**: o Código Civil, arts. 722–729, regula o contrato de corretagem. O art. 725 diz que a remuneração é devida quando o resultado útil é obtido, mesmo que o negócio se desfaça depois por arrependimento. O art. 728 diz que, com vários corretores, a remuneração é paga em partes iguais salvo ajuste. O art. 726 garante comissão ao corretor com exclusividade mesmo sem a sua mediação. Isso importa para o financeiro, que deve tratar comissão a receber *no resultado útil* e prever distrato e inadimplência.
- O módulo deve permitir comissão percentual configurável por negócio, sem embutir um percentual "legal", e anexar a autorização ou contrato de intermediação.

### Gaps
- Não consultei resoluções do COFECI (código de ética, Resolução 326/92; resoluções sobre autorização de venda e contrato-padrão) nem tabelas de honorários de CRECIs ou sindicatos. Os percentuais típicos de comissão ficam sem fonte nesta nota.
- Não pesquisei se o COFECI exige que a comissão seja recebida pela PJ ou permite pagamento direto ao corretor.

## 8. Retenções na fonte quando o pagador é PJ (construtora ou incorporadora paga a imobiliária)

### Takeaway
Quando uma PJ (construtora, incorporadora) paga comissão ou corretagem a outra PJ, incide **IRRF de 1,5%** (RIR/2018, Decreto 9.580/2018, art. 718, I), retido pela fonte pagadora. A retenção **não se aplica se a imobiliária é optante do Simples**. **Não há retenção de CSRF (PIS/COFINS/CSLL 4,65%) sobre corretagem**, porque a corretagem não está na lista de serviços do art. 30 da Lei 10.833/2003. Esse ponto se apoia em fóruns e fichas técnicas, não em norma lida.

### Cited Findings
- Decreto 9.580/2018, art. 718, I: alíquota de 1,5% sobre as importâncias pagas ou creditadas por PJ a outras PJ a título de comissões, corretagens ou mediação de negócios. Quem retém é a PJ pagadora. A retenção não se aplica quando a prestadora é do Simples, mas alcança a empresa do Simples quando ela é a *tomadora*. A própria página tem trecho inconsistente ("apenas para empresas não optantes") — [Rotina Fiscal](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis)
- CSRF: a ficha de corretagem indica "Não". Fóruns contábeis dizem que não cabe CSRF sobre comissões — [Rotina Fiscal](https://www.rotinafiscal.com.br/tributos-e-declaracoes/atividades-economicas/corretagem-de-imoveis); [Contábeis, fórum "nota fiscal comissão imobiliária"](https://www.contabeis.com.br/forum/tributos-federais/119039/nota-fiscal-comissao-imobiliaria/); [Contábeis, fórum CSLL/IRPJ comissão](https://www.contabeis.com.br/forum/tributos-federais/117251/csll-e-irpj-comissao-de-vendas/)
- DARF 8045 aparece como código do IRRF sobre comissões e corretagens/"outros rendimentos". Há fórum que chama o 8045 de "auto-retenção" (beneficiário recolhe), o que contradiz a retenção pelo tomador. Conferir no Manual da EFD-Reinf — [Buscador NCM, DARF 8045](https://buscadorncm.com.br/darf/8045); [Portal SPED Brasil](https://portalspedbrasil.com.br/?p=17793); [Portal SPED Brasil](https://portalspedbrasil.com.br/?p=18150)

### Inferences
- A divergência do "8045 auto-retenção" provavelmente vem do art. 719 do RIR/2018 (auto-retenção de comissões em certas atividades, como agências de viagem e publicidade), não do art. 718, I. Para corretagem paga por construtora, a regra é retenção pela pagadora. É inferência a confirmar no RIR.
- No **módulo**: no recebimento de comissão de lançamento paga por construtora, se a imobiliária for do Presumido, registrar o valor líquido recebido (bruto − 1,5% de IRRF) e o IRRF como **antecipação compensável** com o IRPJ do trimestre. Se for do Simples, a nota deve informar a condição de optante para evitar retenção indevida. Dispensa de retenção de IRRF quando o valor é ≤ R$ 10,00 (de conhecimento prévio).
- A PJ pagadora informa a retenção na EFD-Reinf, série R-4000 (R-4020, pagamentos a PJ). De conhecimento prévio.
- ISS: o município da construtora pode exigir retenção na fonte pelo tomador conforme a lei local (LC 116, art. 6º). Não verificado para corretagem.

### Gaps
- Não li os arts. 718/719 do RIR/2018 nem o art. 30 da Lei 10.833/2003 e a IN SRF 459/2004 em fonte oficial. A conclusão "sem CSRF" vem de ficha técnica e fóruns.
- Retenção de INSS de 11% sobre nota de PJ (cessão de mão de obra, art. 31 da Lei 8.212) não se aplica à corretagem por inferência, mas não foi confirmada.

## 9. Informe de rendimentos para corretores autônomos

### Takeaway
A imobiliária que paga corretor PF por RPA continua obrigada a fornecer o **comprovante (informe) de rendimentos** anual, com bruto, INSS retido e IRRF. Desde a extinção da DIRF, os dados vão à Receita pelo **eSocial (S-1200/S-1210)**. Nesta rodada não achei fonte que detalhe o informe pós-DIRF.

### Cited Findings
- Rendimentos do trabalho com ou sem vínculo (o RPA de autônomo) são informados só no eSocial: S-1200 para a remuneração e S-1210 para o pagamento e o IRRF, segundo o Manual da EFD-Reinf v2.1.2.1 (dez/2025) — [Econet](https://blog.econeteditora.com.br/onde-informar-rpa-esocial-ou-efdreinf.md)
- O pagamento a autônomo via RPA é informado ao eSocial pela tomadora — [Trivium Contábil](https://triviumcontabil.com.br/recibo-de-pagamento-autonomo-rpa/)

### Inferences
- De conhecimento prévio, **não verificado**: a DIRF foi extinta para fatos a partir de 01/01/2025, e o informe de rendimentos continua devido ao beneficiário até o último dia útil de fevereiro do ano seguinte, no modelo da IN RFB 2.060/2021. Com a isenção de 2026, a maioria dos RPAs pequenos terá IRRF zero, mas o informe ainda precisa listar rendimento bruto e INSS retido. Ele também é a base para o corretor conferir a declaração pré-preenchida.
- O módulo deve agregar por CPF e ano: bruto pago, INSS retido (11%) e IRRF retido. Esses números saem dos próprios RPAs, sem depender do contador.

### Gaps
- Não confirmei em fonte oficial a extinção da DIRF, o prazo atual do informe nem o modelo vigente (IN RFB 2.060/2021 ou sucessora).
- Não achei regra específica sobre informe para o corretor *associado* com nota própria (em tese não há, porque a imobiliária não paga rendimento a ele, mas não confirmei).
