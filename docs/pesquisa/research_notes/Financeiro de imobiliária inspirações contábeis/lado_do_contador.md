# Lado do contador: o que o escritório de contabilidade precisa da imobiliária todo mês e como os sistemas contábeis importam isso

> Pesquisa feita em 29/10/2026. As fontes primárias foram a central de suporte da Domínio/Thomson Reuters, a ajuda da Alterdata, a ajuda da Omie (que documenta a exportação para Domínio, Questor, Prosoft e Contmatic), a especificação CSV da Contabit, a Receita Federal (via NetCPA), um ofício da Fenacon e a documentação da NFE.io sobre o ADN. Fortes, SCI, Nasajon, Acessórias e Contabilizei ficaram com pouca ou nenhuma fonte (ver Gaps).

## 1. O que o contador pede ao cliente todo mês (checklist e prazos)

### Takeaway
O pacote mensal é praticamente o mesmo em todas as fontes: extrato bancário, notas emitidas e recebidas, comprovantes de pagamento e de despesa, guias pagas, documentos de pessoal (folha, pró-labore, autônomos/RPA) e saldos a receber e a pagar por cliente ou fornecedor. As próprias fontes do setor recomendam que a entrega seja rastreável (protocolo ou software), e não arquivos soltos por e-mail ou WhatsApp.

### Cited Findings
- O cliente entrega ao contador o extrato bancário do mês e todos os comprovantes, como notas, recibos, faturas e comprovantes de despesa, inclusive os pagamentos feitos pela internet — [Jornal Contábil, "Lista de documentos que devem ser enviados mensalmente"](https://jornalcontabil.com.br/noticia/lista-de-documentos-que-devem-ser-enviados-mensalmente-para-a-contabilidade/)
- Também entram as notas fiscais de venda, de serviço e de demais receitas, além das de compras, serviços tomados, devoluções e aquisição de ativo — [Jornal Contábil, "10 documentos que devem ser entregues ao contador mensalmente"](https://jornalcontabil.com.br/noticia/10-documentos-que-devem-ser-entregues-ao-contador-mensalmente/); [Contábeis](https://www.contabeis.com.br/noticias/54594/quais-documentos-precisam-ser-entregues-mensalmente-ao-contador/)
- Outros itens da lista: guias de impostos e contribuições (INSS, FGTS, contribuição sindical), saldo de clientes a receber e de fornecedores a pagar ("por cliente, de preferência em EXCEL"), contratos de empréstimo com as parcelas pagas no mês e descontos de títulos e cheques — [Jornal Contábil](https://jornalcontabil.com.br/noticia/10-documentos-que-devem-ser-entregues-ao-contador-mensalmente/)
- O departamento pessoal é a área que mais pede documentos: recibos assinados de salários, pró-labore, férias e vale-transporte, além de faltas, horas extras e movimentação e recibos de autônomos — [Jornal Contábil](https://jornalcontabil.com.br/noticia/quais-documentos-que-precisam-ser-entregues-todo-mes-ao-seu-contador/); [Fenacon](https://fenacon.org.br/noticias/confira-quais-documentos-precisam-ser-entregues-todos-os-meses-para-a-contabilidade/)
- Boa prática citada: registrar as entregas em planilha de protocolo ou software e confirmar o que foi enviado, o que foi importado automaticamente e o que ainda precisa de esclarecimento ("essa rastreabilidade é mais útil do que encaminhar arquivos dispersos por e-mail ou aplicativo de mensagens"). A lista oficial é a combinada com o contador e varia conforme o regime e a atividade — [Ozai, checklist mensal](https://www.ozai.com.br/documentos-contabeis-que-devem-ser-enviados-para-a-contabilidade/)
- A Sage recomenda deixar claro para o cliente quais documentos são necessários, em que formatos e até quando — [Sage, organização de clientes do escritório](https://www.sage.com/pt-pt/blog/organizacao-clientes-escritorio-contabilidade/)

### Inferences
- Para uma imobiliária, o pacote mensal tem estes itens: (a) OFX de cada conta bancária; (b) XML das NFS-e emitidas, ou seja, as comissões; (c) XML ou PDF das notas tomadas e despesas com comprovante; (d) relatório de recebimentos (comissões recebidas por negócio) e de repasses (corretores, parceiros, proprietários na locação); (e) RPAs e recibos de corretores autônomos, notas de corretores PJ e pró-labore dos sócios; (f) contas a receber e a pagar em aberto no fim do mês, por contraparte.
- Os itens (d) e (f) são os que o CRM tem mais condição de gerar sem esforço. O relatório de saldo "por cliente, de preferência em Excel" (Jornal Contábil) vira exportação direta.
- Prazos típicos: costuma-se dizer que o contador pede os documentos até perto do dia 5 a 10 do mês seguinte, porque o DAS do Simples e o FGTS Digital vencem no dia 20 e o salário deve ser pago até o 5º dia útil (CLT art. 459). Esses prazos não foram confirmados em fonte nesta rodada e devem ser verificados.

### Gaps
- Não achei fonte única e oficial (CFC, Sescon) com o prazo-padrão de entrega de documentos ao escritório. Na prática ele é definido no contrato de prestação de serviços de cada escritório.
- Não achei checklist específico para imobiliária (com repasse a proprietário, caução, comissão dividida).

## 2. Layouts de importação de lançamentos (Domínio, Questor, Alterdata e outros) e o de-para do plano de contas

### Takeaway
Não existe um padrão de fato entre os sistemas, mas o núcleo é o mesmo em todos: **data, conta débito, conta crédito, valor, código de histórico e complemento/histórico, com documento e um identificador de agrupamento para partidas múltiplas**. O layout de terceiros mais usado é o **"Leiaute Domínio Sistemas com Separador"**: arquivo TXT delimitado por `|`, organizado em registros numerados. ERPs como a Omie geram um arquivo por sistema contábil (Domínio, Questor, Prosoft, Contmatic, Alterdata). O de-para pode ser feito de dois jeitos: o ERP já exporta com o código reduzido da conta do contador, ou exporta o código do próprio ERP ("Associar Débito/Crédito") e o contador relaciona as contas na importação.

### Cited Findings
**Domínio (Thomson Reuters)**
- O "Leiaute Domínio Sistemas com Separador" usa o separador `|`. Os campos são do tipo Caractere, Numérico, Data (dd/mm/aaaa) ou Decimal, este com número de casas decimais definido — [Domínio, solução 672](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=672)
- Registros do layout: `0000` identificação da empresa (CNPJ/CPF/CEI/CAEPF só com dígitos), `0010` clientes, `0020` fornecedores, `0100` produtos, `0200` contas contábeis, `0220` históricos contábeis, `0240` centros de custo, `1000/2000/3000` notas de entrada, saída e serviço, `5100/5200/5300` pagamentos e recebimentos dessas notas, `6000` lançamentos em lote — [Omie, Domínio com separador](https://ajuda.omie.com.br/pt-BR/articles/9009287-importando-os-lancamentos-contabeis-no-sistema-dominio-leiaute-com-separador); [Domínio 672](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=672)
- O registro `0200` (contas contábeis) traz "Código reduzido" (numérico), "Classificação contábil" e "Tipo" (A = analítica, S = sintética). O `0220` (históricos) traz Código e Descrição — [Domínio 672](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=672)
- Registro `0451`, "Lançamentos contábeis" (lançamento simples ligado a um cadastro), campos na ordem: 1 identificador fixo "0451"; 2 conta débito (num.); 3 conta crédito (num.); 4 valor (decimal, 2 casas); 5 código do histórico (num.); 6 descrição do histórico (caractere) — [Domínio 672](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=672)
- Caminho no Domínio: Utilitários > Importação > Importação Padrão > "Leiaute Domínio Sistemas com Separador". Seleciona-se o arquivo, marcam-se os documentos, clica-se em Importar, confere-se o resultado e clica-se em **Gravar** — [Omie](https://ajuda.omie.com.br/pt-BR/articles/9009287-importando-os-lancamentos-contabeis-no-sistema-dominio-leiaute-com-separador)
- A Omie gera um .zip com o arquivo completo (`Dominio_Layout_Padrao.txt`, registros 0000 a 6000) e com recortes: só recebimentos e pagamentos (5100/5200/5300), só o 6000, só o 6000 de recebimentos, só o 6000 de pagamentos, e versões sem as parcelas de notas. Os recortes servem para o contador importar apenas a parte que quer — [Omie](https://ajuda.omie.com.br/pt-BR/articles/9009287-importando-os-lancamentos-contabeis-no-sistema-dominio-leiaute-com-separador)
- Para lançamentos TXT exportados de outro escritório que também usa Domínio, o arquivo deve sair de Utilitários > Exportação > Lançamentos e entrar pelo conjunto "Lançamentos Contábeis em Lote (Leiaute Domínio Sistemas)" — [Domínio, solução 7584](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=7584)
- A Domínio também documenta integrações prontas de ERP para Domínio, como a da Conta Azul — [Domínio, solução 9817](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=9817)

**Questor**
- Caminho: Utilitários > Banco de Dados > Importação. Informa-se o **Leiaute** (arquivo modelo `.NLI`) e o **Arquivo** (CSV), e depois executa-se. O layout principal é o `LctoCtb` (todos os lançamentos), com variantes `LctoCtb_Pagamento` e `LctoCtb_Recebimentos`. O "Modelo C" não aceita centro de custo; o "Modelo C2" é a alternativa — [Omie, Questor Modelo C](https://ajuda.omie.com.br/pt-BR/articles/9020335-importando-os-lancamentos-contabeis-do-omie-no-sistema-questor-modelo-c)
- No Questor Cloud/Web vão dois arquivos: o de layout (`Questor_Layout_Modelo_Cloud`) e o de lançamentos (`LctoCtb_AAAAMM`), importados em "Banco de Dados Importação – Contabilidade" — [Omie, Questor Cloud](https://ajuda.omie.com.br/pt-BR/articles/10715158-importando-os-lancamentos-contabeis-no-sistema-questor-leiaute-cloud-e-modelo-c-cloud)
- Ou seja, o layout do Questor é configurável: o `.NLI` descreve as colunas do CSV. O cliente pode mandar o próprio NLI junto com o CSV — [Omie, Questor Modelo C](https://ajuda.omie.com.br/pt-BR/articles/9020335-importando-os-lancamentos-contabeis-do-omie-no-sistema-questor-modelo-c)

**Alterdata (Contábil / WCont)**
- Aceita TXT e Excel (.xls) com modelos de layout configuráveis. Caminho: aba Lançamentos > Importar lançamentos, escolhendo modelo, empresa, arquivo, período opcional e nome do novo lote. Na partida múltipla, as linhas são agrupadas por número de documento e a soma dos débitos precisa ser igual à dos créditos (exemplo: D conta 15 R$ 10,00; C 798 R$ 5,00 e C 796 R$ 5,00, todos no doc 123456). Não aceita importar para lotes de implantação de saldos, encerramento ou integração online — [Alterdata, "Tudo que você precisa saber sobre importar lançamentos"](https://ajuda.alterdata.com.br/x/ALAFBQ); [Alterdata, importar em TXT](https://ajuda.alterdata.com.br/bdcc/como-importar-lancamentos-para-o-sistema-contabil-em-txt-150435497.html)

**Prosoft e Contmatic**
- A Omie tem rotinas documentadas de exportação para Prosoft e Contmatic, o que indica que cada um tem layout próprio. O conteúdo dessas páginas não foi lido — [Omie, Prosoft](https://ajuda.omie.com.br/pt-BR/articles/12960626-importando-os-lancamentos-contabeis-no-sistema-prosoft); [Omie, Contmatic](https://ajuda.omie.com.br/pt-BR/articles/9010782-importando-os-lancamentos-contabeis-no-sistema-contmatic)

**CSV genérico (especificação Contabit, março de 2026), útil como modelo mínimo**
- CSV com separador preferencialmente `;`, uma linha por registro, sem fórmulas e sem caracteres especiais. Campos: Data (DD/MM/AAAA), Valor (2 casas, sempre positivo), Conta Débito, Conta Crédito, Código Histórico, Documento, Complemento, Centro de Custo Débito, Centro de Custo Crédito, **Associar Débito**, **Associar Crédito** (código externo para relacionamento) e **Transação** (agrupa várias linhas em um mesmo lançamento quando há múltiplos débitos ou créditos) — [Contabit, Especificação CSV para Integração Contábil](https://contabit.com.br/downloads/layout/contabil/csvintegracaocontabil.pdf)
- **De-para, cenário 1:** o ERP já exporta com os códigos do plano de contas do contador e a importação é direta (campos necessários: data, valor, conta débito, conta crédito, complemento ou documento). **Cenário 2:** o ERP tem plano próprio e exporta os códigos dele em "Associar Débito/Crédito", que "serão posteriormente relacionados ao plano de contas da Contabit durante o processo de importação" — [Contabit](https://contabit.com.br/downloads/layout/contabil/csvintegracaocontabil.pdf)
- A Omie centraliza essa parametrização num "Painel do Contador", que precisa estar configurado antes de gerar os arquivos, e mantém uma equipe de "Integração Contábil" só para isso — [Omie, Questor](https://ajuda.omie.com.br/pt-BR/articles/9020335-importando-os-lancamentos-contabeis-do-omie-no-sistema-questor-modelo-c)

### Inferences
- Desenho recomendado para o CRM: um modelo interno neutro de "lançamento" (data, valor, conta débito, conta crédito, código de histórico, histórico/complemento, documento, CNPJ/CPF da contraparte, centro de custo e id de transação). Sobre ele, **exportadores por sistema**: (1) Domínio com separador `|` (0000 + 0200/0220 + 6000 ou 0451); (2) CSV `;` estilo Contabit/Questor, entregando também um modelo NLI se for o caso; (3) Excel/TXT para Alterdata, agrupado por documento.
- A tabela de de-para deve ser editável pelo contador, por imobiliária: categoria do CRM (ex.: "Comissão de venda", "Repasse a corretor", "Repasse a parceiro", "Taxa de administração", "Marketing/portais") ligada ao código reduzido da conta, por sistema. Até o contador preencher, o CRM exporta o código interno em "Associar" (cenário 2) e o mapeamento acontece do lado dele.
- Exportar o cadastro de participantes junto (CNPJ/CPF de corretores e parceiros, como nos registros 0010/0020 do Domínio) reduz a digitação manual do contador.

### Gaps
- Não consegui ler os campos do registro `6000` (e de um possível `6100`) do layout Domínio: a página de suporte é longa e a parte final não veio na leitura. O próximo passo é baixar o arquivo-modelo no fim da solução 672.
- Faltam os layouts campo a campo de Fortes, SCI, Nasajon, Prosoft e Contmatic.
- Não achei layout aberto da Alterdata com a lista de campos (ela é configurável por modelo).

## 3. Importação de extrato OFX e conciliação contábil

### Takeaway
Nos sistemas contábeis, o OFX vira lançamento por **regras ligadas ao histórico do extrato**: um trecho do texto aponta para uma conta de contrapartida. O que o banco escreve na tag MEMO (ou NAME) do OFX é o que dirige a contabilização automática. Se o CRM conseguir que o histórico bancário (ou o próprio arquivo de lançamentos) já chegue identificado por negócio e categoria, o contador deixa de tratar cada linha à mão.

### Cited Findings
- O Domínio importa extratos em OFX, OFC ou Febraban 240 para registrar as transações e permitir a conciliação. O histórico vem da tag MEMO do OFX, ou da tag NAME quando não há MEMO — [Domínio, solução 238](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=238); [Domínio, solução 1880](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=1880)
- Configuração (Arquivos > Configuração para contabilizar extrato bancário): para cada conta contábil de banco cadastram-se regras com "Parte do histórico" (o histórico do extrato ou só o começo dele), tipo (Soma, Subtrai ou Ambos), documento opcional (para o caso de o mesmo histórico ir para contas diferentes), conta de contrapartida e histórico contábil. Para mais de uma conta usa-se "Vários débitos para vários créditos" — [Domínio, solução 1880](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=1880)
- Regeração (Utilitários > Regerar > Lançamentos de Extrato Bancário): por competência, conta e filial, regera "Todos" ou só os extratos "sem lançamentos contábeis", podendo deixar de fora os já conciliados ou alterados manualmente — [Domínio, solução 1880](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=1880)
- A Alterdata tem módulo de conciliação bancária com importação de extrato e conciliação automática — [Alterdata, conciliação: importação de extrato](https://ajuda.alterdata.com.br/bdcc/conciliacao-bancaria-como-realizar-a-importacao-de-extrato-bancario-57396319.html); [Alterdata, opções da conciliação automática](https://ajuda.alterdata.com.br/movbanc/conciliar-movimentos-bancarios/conciliacao-automatica/opcoes-da-conciliacao-automatica/informacoes-de-importacao)
- Do lado do ERP, a Omie permite associar um lançamento do extrato a vários lançamentos internos (1:N) — [Omie, conciliação 1:N](https://ajuda.omie.com.br/pt-BR/articles/10069800-conciliacao-bancaria-associando-um-lancamento-do-extrato-com-varios-lancamentos-no-omie)

### Inferences
- Há dois caminhos para a imobiliária. (A) Mandar o OFX bruto e deixar o contador montar as regras por histórico, o que falha com PIX, porque o MEMO costuma trazer só o nome do pagador. (B) **O CRM conciliar o OFX com os negócios e já exportar os lançamentos com a contrapartida certa**, no layout do sistema do contador. O caminho B é o que elimina a redigitação. O OFX ainda vai junto, para o contador conferir o saldo.
- Para a conciliação dar certo, cada recebimento de comissão no CRM precisa da data e do valor exatos do crédito bancário. Os repasses de uma mesma comissão para vários corretores formam um caso 1:N.
- "Conciliação contábil" no sentido do contador: o saldo da conta Banco no razão tem de bater com o saldo final do extrato no último dia do mês. O CRM pode mandar esse saldo junto no pacote.

### Gaps
- Não verifiquei como Questor, Fortes, SCI, Nasajon, Prosoft e Contmatic contabilizam o OFX.
- Não verifiquei se algum sistema contábil lê FITID ou campos estendidos do OFX além de MEMO e NAME.

## 4. NFS-e: importação de XML pelo contador e NFS-e Padrão Nacional (ADN)

### Takeaway
O ADN centraliza as NFS-e do padrão nacional e permite baixá-las por NSU, mas **hoje o acesso pela API exige o certificado digital de cada contribuinte**. O escritório não consegue usar procuração eletrônica: a Fenacon pediu essa mudança à Receita em junho de 2026. Na prática, o contador ainda depende de receber o certificado A1 do cliente, de um intermediário (NFE.io e similares) ou dos XMLs enviados pelo cliente. Um CRM que emite NFS-e e entrega os XMLs (emitidos e cancelados) no pacote mensal resolve isso.

### Cited Findings
- Ofício Fenacon OF.P.100/2026, de 10/06/2026, à Receita Federal e ao Comitê Gestor da NFS-e: "No modelo vigente, exige-se o uso do certificado digital exclusivo de cada contribuinte, não permitindo a utilização de autorizações outorgadas aos escritórios de contabilidade". A entidade diz que isso "inviabiliza a operação em escala" e pede procuração eletrônica nas APIs (mTLS), argumentando com LGPD (escritórios guardando milhares de .pfx), eficiência, desempenho e o fim de crawlers e scraping na interface web — [Fenacon, OF.P.0100/2026](https://fenacon.org.br/wp-content/uploads/2026/06/OF.P.0100-Viabilizacao-de-procuracao-eletronica-na-NFS-e-Nacional.pdf)
- A consulta pela API do Sistema Nacional exige que o certificado do solicitante seja de um ator da nota (prestador, tomador ou intermediário) — [Manual de contribuintes, API do Emissor Público Nacional v1.2, out/2025](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf/@@download/file) (conforme resumo da busca; o PDF não foi lido na íntegra)
- No ADN as notas ficam disponíveis por NSU incremental para cada CNPJ. A NFE.io consulta o ADN a cada cerca de 30 segundos a partir do último NSU, guarda o XML e oferece XML, PDF ou JSON. Eventos como cancelamento (101101) e substituição (105102) chegam como documentos próprios. O grupo IBS/CBS da reforma tributária aparece no XML (vale `null` nas notas anteriores à reforma). Capturar a nota não equivale a manifestá-la — [NFE.io, arquitetura da distribuição NFS-e inbound](https://nfe.io/docs/distribuicao-nfse-inbound-arquitetura/)
- O serviço cobre só as NFS-e do padrão nacional e evita "consultar cada prefeitura". Notas de municípios fora do padrão ficam fora do escopo — [NFE.io](https://nfe.io/docs/distribuicao-nfse-inbound-arquitetura/)
- No Domínio, as notas de serviço entram pelos registros `3000` (serviços) e `5300` (recebimentos de notas de serviço) do layout com separador, o que permite levar nota e baixa juntas — [Omie](https://ajuda.omie.com.br/pt-BR/articles/9009287-importando-os-lancamentos-contabeis-no-sistema-dominio-leiaute-com-separador)

### Inferences
- No pacote mensal da imobiliária: (1) XML de todas as NFS-e emitidas no mês, mais os eventos de cancelamento e substituição; (2) a lista das notas com o negócio de origem (venda ou locação), o valor de comissão bruta e a parte repassada. A lista é o que o XML não diz e o que o contador precisa para separar receita própria de repasse (ver seção 5).
- Para as notas recebidas, como as de corretores PJ e parceiros, o CRM pode pedir o XML ou a chave a quem emitiu e anexar ao repasse.
- Integrar direto com o ADN pelo CRM exige guardar o certificado A1 da imobiliária, o mesmo ônus que a Fenacon critica. Vale avaliar um intermediário (NFE.io, Focus, PlugNotas).

### Gaps
- Não confirmei o endpoint exato de distribuição por NSU (`/contribuintes/DFe/{NSU}` ou outro) no manual oficial.
- Não sei se, depois do ofício de jun/2026, a Receita já liberou a procuração eletrônica.
- Não verifiquei quais sistemas contábeis (Domínio, Questor etc.) já buscam NFS-e no ADN sozinhos.

## 5. Regime de competência na imobiliária: quando reconhecer a comissão e o que é receita bruta ou repasse (inclusive em co-corretagem)

### Takeaway
**Base tributária:** pela Solução de Consulta Cosit 153/2025, a comissão recebida em nome próprio entra inteira na receita bruta do Simples, **mesmo que parte seja repassada a corretor autônomo auxiliar**. Só fica fora o valor recebido "para mero repasse a corretores parceiros", quando um contrato firmado com todas as partes reconhece direitos próprios de cada um e há atuação conjunta. No Lucro Presumido, a comissão paga a corretores não é dedutível da receita bruta. Nos municípios, a base do ISS no contrato de associação (Rio, SP) tende a ser só a parte da imobiliária. **Momento do reconhecimento:** a comissão é devida quando há o "resultado útil" (o negócio fechado), o que costuma apontar para a assinatura do contrato que conclui a intermediação. Não achei norma contábil específica para imobiliária sobre isso.

### Cited Findings
- **Cosit 153/2025 (Simples Nacional):** os valores recebidos como comissão por serviço prestado em nome próprio integram a base. Isso vale mesmo quando a corretora usa corretor autônomo como auxiliar, e a receita bruta é a comissão inteira, sem deduzir o repasse. Ficam fora os valores recebidos "para mero repasse a corretores parceiros" se houver negócio jurídico em contrato firmado com todas as partes, se o contrato reconhecer a corretora e o corretor como titulares de direitos próprios e se a atuação for conjunta, de fato e de direito. O caso concreto envolvia corretagem de planos de saúde, não de imóveis, e serve por analogia — [NetCPA, Simples Nacional: corretagem (SC Cosit 153/2025)](https://netcpa.com.br/noticias/simples-nacional-corretagem-solucao-de-consulta/22475); [Normas Legais, SC Cosit 153/2025](https://www.normaslegais.com.br/legislacao/solucao-de-consulta-cosit-153-2025.htm)
- **Lucro Presumido/Real:** segundo a Receita (citada pelo blog), a comissão de corretagem na atividade imobiliária não pode ser deduzida da receita bruta para IRPJ, CSLL, PIS e Cofins — [Tributo Devido, "comissão de corretagem não é dedutível"](https://tributodevido.com.br/portal/comissao-de-corretagem-nao-e-dedutivel/); [Tributo Devido, comissão de venda em imobiliárias](https://tributodevido.com.br/portal/comissao-de-venda-em-imobiliarias/)
- **Fiscalização e Carf:** o fisco sustenta que a parte do corretor está embutida no preço do imóvel pago pelo comprador — [Conjur, comissão a corretores no setor imobiliário e no Carf (dez/2024)](https://www.conjur.com.br/2024-dez-04/comissao-a-corretores-no-setor-imobiliario-e-no-carf//?print=1)
- **ISS no Rio de Janeiro (Res. SMF 2902/2016):** no contrato de associação, a base do ISS da imobiliária é a parte da remuneração dela conforme a partilha combinada com o corretor associado. O pagamento do cliente deve ir direto a cada participante. Se o cliente paga tudo à imobiliária e ela assume despesas do corretor, a base pode ser o valor total — [Normas Brasil, Resolução SMF 2902/2016](https://www.normasbrasil.com.br/norma/resolucao-2902-2016-rio-de-janeiro_327817.html)
- **ISS em São Paulo:** o Parecer Normativo SF 01/15 tira os valores repassados ao associado da base do ISS da imobiliária (segundo a Migalhas). A prefeitura também tem soluções de consulta sobre o momento de emitir a NFS-e na corretagem — [Migalhas, corretor associado (Lei 13.097/2015)](https://www.migalhas.com.br/depeso/252984/o-corretor-de-imoveis-associado-a-lei-13097-de-19-de-janeiro-de-2015-a-figura-do-corretor-de-imoveis-associado-e-o-compliance-trabalhista); [Prefeitura SP, SC 01/2025](https://capital.sp.gov.br/documents/d/fazenda/sc-01-2025-pdf); [Prefeitura SP, SC 15/2025](https://capital.sp.gov.br/documents/d/fazenda/sc-15-2025-pdf)
- O ISS sobre corretagem imobiliária é devido ao município do estabelecimento prestador — [TAGD Law](https://tagdlaw.com.br/iss-sobre-corretagem-imobiliaria-e-devido-ao-municipio-do-estabelecimento-prestador/)
- **Co-corretagem entre imobiliárias:** a prática relatada em fórum de contadores é cada imobiliária emitir NFS-e sobre a parte que lhe cabe. Quando repassa a corretores, ela precisa da nota (ou recibo) deles. Em um relato de consumidor, a comissão foi dividida 50/50 e cada imobiliária emitiu a nota da sua parte (relato isolado, sem valor normativo) — [Contábeis, fórum: emissão de NF de serviço por imobiliária](https://www.contabeis.com.br/forum/tributos-estaduais-municipais/123120/emissao-de-nota-fiscal-de-servico-imobiliaria/); [Reclame Aqui](https://www.reclameaqui.com.br/leao-imoveis/imobiliaria-se-recusa-a-emitir-nota-fiscal-de-corretagem-apos-venda-de-imovel_oRUnaNn2COhHOTib/)
- **Momento:** a jurisprudência diz que a comissão de corretagem só é devida quando o corretor alcança o resultado previsto (aproximação útil e negócio concluído) — [Legjur, STJ](https://www.legjur.com/jurisprudencia/eme/250.6261.2787.8727)
- **CPC 47/NBC TG 47:** é a norma única de receita desde 2018, com o modelo de cinco etapas. A receita é reconhecida quando a obrigação de desempenho é satisfeita (transferência ao cliente), e não no recebimento. A norma também traz o conceito de **principal x agente**, que decide se a receita aparece bruta ou líquida — [Dootax, conceito de receita, principal e agente](https://dootax.com.br/conceito-de-receita/); [Contábeis, CPC 47 e loteamento](https://www.contabeis.com.br/artigos/76062/alerta-ao-setor-de-loteamento-e-o-cpc-47/)

### Inferences
- Pela lógica do CPC 47 aplicada à corretagem, a obrigação de desempenho (intermediar até o negócio fechar) se cumpre quando o negócio se conclui, normalmente na assinatura do compromisso de compra e venda. Aí nasce o direito à receita e um "comissão a receber", mesmo que o dinheiro entre depois (por exemplo, na escritura ou no repasse do financiamento). Isso é inferência: não achei fonte específica de imobiliária.
- Na prática, muitas pequenas imobiliárias no Simples ficam no **regime de caixa** para o DAS, que o Simples permite como opção. Nesse caso, o momento fiscal é o recebimento, e a contabilidade (competência) e a apuração (caixa) podem divergir. O CRM deveria guardar as duas datas por comissão: a data do fato gerador (assinatura) e a data do recebimento. (A possibilidade de regime de caixa no Simples não foi verificada nesta rodada.)
- Para a exportação contábil, cada comissão precisa sair separada em: (a) **parte própria** da imobiliária; (b) **parte de corretor associado ou autônomo auxiliar**, que pela Cosit 153 continua sendo receita bruta, salvo contrato tripartite, e vira custo ou despesa; (c) **parte de imobiliária parceira (co-corretagem)**, que, se a parceira emite a própria nota e o contrato prevê, não é receita da imobiliária e sim valor de terceiro a repassar (passivo transitório). O CRM precisa marcar em cada repasse se ele é "despesa com corretor" ou "valor de terceiro", e anexar o contrato que fundamenta a escolha.
- O ideal é a co-corretagem ser paga direto a cada imobiliária (split no pagamento), cada uma emitindo sua NFS-e. Se o valor transita por uma delas, o contrato entre todas as partes precisa estar documentado.

### Gaps
- Não achei norma, parecer do CFC ou ITG sobre o momento de reconhecer comissão imobiliária (assinatura x escritura x recebimento) nem sobre comissões sujeitas a distrato.
- Não achei solução de consulta da Receita específica para imobiliária x imobiliária em co-corretagem (a Cosit 153 é de corretora de planos de saúde).
- Não verifiquei a regra atual de Simples por caixa x competência.
- Não analisei os efeitos da reforma tributária (IBS/CBS a partir de 2026–2027) sobre corretagem e repasses.

## 6. Fechamento mensal: o que é "fechar o mês", bloqueio de período e correções depois do fechamento

### Takeaway
Para o contador, "fechar o mês" é conferir e lançar tudo (notas, extratos, folha), conciliar os bancos, apurar os impostos e **bloquear o período** no sistema. Os sistemas trazem trava por data. Reabrir é possível, mas pede motivo e obriga a reprocessar integrações e arquivos. Por isso, lançamento tardio do cliente custa retrabalho e pode exigir guia ou declaração retificadora.

### Cited Findings
- Alterdata, "Trava período": bloqueia os movimentos até a data informada e impede novos lançamentos nesse período. Reabrir libera de novo — [Alterdata, trava período](https://ajuda.alterdata.com.br/cond/contabil/lancamentos-contabeis/trava-periodo)
- Omie (Painel do Contador): o fechamento manual bloqueia alterações nos lançamentos. Se o período for desbloqueado e o cliente lançar algo novo, "será necessário realizar todo processo de integração/envio dos arquivos novamente" — [Omie, fechamento do período, Painel do Contador](https://ajuda.omie.com.br/pt-BR/articles/1923558-fechamento-do-periodo-painel-do-contador)
- OneFlow (Omie): reabrir o período exige informar o motivo. Recomenda-se finalizar só depois de conferir todas as informações — [Omie, finalizar ou reabrir período no OneFlow](https://ajuda.omie.com.br/pt-BR/articles/17590712-finalizando-ou-reabrindo-um-periodo-contabil-no-oneflow)
- CIGAM: o cadastro de "limites permitidos" impede incluir ou excluir lançamentos em períodos encerrados — [CIGAM wiki](https://www.cigam.com.br/wiki/index.php/Qual_%C3%A9_o_objetivo_do_cadastro_de_limites_permitidos%3F)
- No Domínio, a regeração de lançamentos de extrato permite não mexer no que já foi conciliado ou alterado à mão, o que protege o trabalho fechado — [Domínio, solução 1880](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=1880)
- Um checklist de fechamento cita o inventário do fim do mês para apurar o CMV (não se aplica a imobiliária) — [Ozai](https://www.ozai.com.br/documentos-contabeis-que-devem-ser-enviados-para-a-contabilidade/)

### Inferences
- O CRM deve ter seu próprio "fechamento de competência": ao gerar o pacote do mês, congelar a versão exportada (com hash e data) e mostrar qualquer mudança posterior como **ajuste do mês seguinte** ou como "retificação do mês X" explícita, com diff, em vez de alterar o passado sem avisar. Isso espelha a trava do sistema contábil e evita a reintegração completa que a Omie descreve.
- Os identificadores estáveis (id do lançamento ou transação) permitem ao contador reimportar só o delta, já que os campos Documento e Transação existem nos layouts.

### Gaps
- Não achei fonte normativa (CFC/ITG 2000) citada aqui sobre o prazo para retificar a escrituração. Não pesquisei ECD/ECF.
- Não achei descrição específica do fechamento de período no Domínio, no Questor ou no Fortes.

## 7. Dores do contador com dados bagunçados, o que torna um cliente "fácil" e o papel dos portais (Onvio, Gestta, Acessórias)

### Takeaway
A dor mais citada é **o cliente não mandar os documentos ou mandar fora do prazo**, apontado como causa nº 1 de retrabalho. Depois vêm a desorganização (arquivos soltos, vários períodos acumulados) e a comunicação ruim. Cliente "fácil" é o que entrega no prazo, completo, em formato importável e com rastreabilidade. Os portais (Onvio Portal do Cliente, Gestta) servem para pedir e receber documentos com controle de tarefas.

### Cited Findings
- Estudo da Univali com 251 respondentes: a principal causa de retrabalho nos escritórios é a falha dos clientes em fornecer os documentos contábeis, seguida das mudanças constantes na legislação tributária e trabalhista (conforme resumo da busca; o artigo não foi lido na íntegra) — [Univali, revista SCE](https://periodicos.univali.br/index.php/SCE/article/view/10046/5620)
- Dissertação da UFJF: nem todos os clientes entregam as informações em tempo hábil, o que compromete prazos e obrigações — [UFJF, repositório](https://repositorio.ufjf.br/jspui/bitstream/ufjf/9822/1/mairaalvesdeoliveira.pdf)
- Há clientes que não entregam no prazo e, às vezes, vários períodos se acumulam. Causas citadas: envio fora do tempo, desorganização interna e falta de disciplina — [Jornal Contábil, 5 dificuldades do contador](https://jornalcontabil.com.br/noticia/contador-5-dificuldades-dia-dia-no-escritorio/); [Jornal Contábil, erros na gestão de clientes](https://jornalcontabil.com.br/noticia/sera-que-voce-tambem-comete-estes-erros-na-gestao-de-clientes-do-seu-escritorio-contabil/amp/)
- Receber e organizar os documentos dos clientes é um desafio diário, com demora e dados desorganizados — [Keevo, desafios das operações de escritórios contábeis](https://keevo.com.br/blog-ec/desafios-operacoes-escritorios-contabeis)
- Fórum de contadores (enquete aberta, não é pesquisa): os problemas citados com clientes são atraso de documentos, falta de organização, falta de conhecimento financeiro e má comunicação — [Contábeis, fórum "relacionamento com os clientes"](https://www.contabeis.com.br/forum/sobre-o-portal-contabeis/153214/relacionamento-com-os-clientes/)
- **Onvio (Thomson Reuters/Domínio):** o escritório pode enviar solicitações de documentos a qualquer pessoa, mesmo sem acesso ao Onvio. Uma solicitação aceita quantos arquivos forem necessários. O usuário do Portal do Cliente precisa estar vinculado a um cliente para ver documentos e tarefas — [Thomson Reuters, solicitar informações no Onvio](https://www.thomsonreuters.com/es-ar/help/onvio/documents/requesting-information-in-onvio.html); [Domínio, perguntas e respostas Onvio](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=6475)
- O escritório pode registrar uma "solicitação geral" em nome do cliente, inclusive quando o cliente não tem acesso ao portal — [Domínio, solução 6066](https://suporte.dominioatendimento.com/central/faces/solucao.html?codigo=6066)
- **Gestta** (Thomson Reuters, integrado ao Domínio): controla qualquer atividade ou processo do escritório e permite cadastrar e acompanhar tarefas — [Thomson Reuters, Q&A integração Gestta–Contábil](https://images.engage.es-pt.thomsonreuters.com/Web/LALEYSAEIMPRESORA/%7Bfa3be1a4-eadc-479b-a994-f9e425ce049d%7D_TAX_PROF_BR_PDF_PERGUNTAS_E_RESPOSTAS_Base.pdf)
- A Fenacon cita o "compartilhamento de senhas" e os crawlers e scraping em portais públicos como práticas de risco que os escritórios usam hoje para obter documentos dos clientes — [Fenacon, OF.P.100/2026](https://fenacon.org.br/wp-content/uploads/2026/06/OF.P.0100-Viabilizacao-de-procuracao-eletronica-na-NFS-e-Nacional.pdf)

### Inferences
- Um cliente "fácil", do ponto de vista do contador, é aquele que (1) entrega até a data combinada todo mês; (2) manda tudo de uma vez num pacote único e completo; (3) usa formato que ele importa (layout do sistema dele, XML de NF-e/NFS-e, OFX); (4) já traz a classificação (de-para) e as contrapartes (CNPJ/CPF); (5) tem o banco fechando com o extrato; (6) não muda o mês já entregue sem avisar.
- O CRM pode virar o "cliente fácil" da imobiliária com: um botão "Gerar pacote do contador (competência MM/AAAA)" com checklist de completude (extratos de todas as contas, todas as NFS-e, todos os repasses com nota ou RPA, saldo a receber); entrega em ZIP ou por link com manifesto; e, opcionalmente, upload direto no Onvio, se houver API (não verificado).
- Os portais Onvio e Gestta funcionam como canal de recebimento. O formato importável é o que poupa o trabalho do contador.

### Gaps
- **Acessórias:** não achei fonte sobre o funcionamento (solicitação recorrente de documentos, protocolo, lembretes automáticos).
- **Contabilizei:** não pesquisei o modelo (como o cliente envia extratos e notas, integrações bancárias automáticas).
- Não verifiquei se Onvio ou Gestta têm API pública para um sistema de terceiro depositar documentos.
- Não achei pesquisa quantitativa nacional (CRC/Sebrae) sobre atraso de documentos. O dado da Univali é de um estudo acadêmico e eu vi apenas um resumo.
