---
title: MOC — CRM e Painel
tags: [moc, crm, painel]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-24
summary: Leads, funil, fila de trabalho, telas do corretor e do gestor.
---
# CRM e Painel — Map of Content

Diretriz de produto: corretor trabalha no CELULAR, mínimo de decisão, ~100
leads por corretor (gestor vê milhares via RLS). Reforma "Painel de Bolso"
F0–F6.

## Escala e consultas
- [[o-checklist-do-catalogo-e-as-categorias-sem-leitor]] — duas faixas por efeito; quatro campos sem leitor ficaram de fora (16/09)
- [[painel-paginado-no-banco]]
- [[contar-e-listar-sao-consultas-diferentes]]
- [[medir-carga-com-rollback]]

## Telas
- [[navegacao-do-painel-tem-regua]]
- [[a-caixa-de-abas-saiu-das-telas]]
- [[quadro-do-funil-e-lateral-de-novo]] — kanban lateral com filtros operacionais (11/09)
- [[rampa-de-etapa-e-o-teto-da-gama]] — paleta das etapas (09/09)
- [[tela-de-entrar-e-dividida]] — login em duas metades (09/09)
- [[consultor-imobiliario-no-painel]] — chat de portfólio e crédito para o corretor (09/09)
- [[movimento-do-painel-tem-regua]] — um momento de carga; o resto responde a gesto (07/09)
- [[o-painel-ganhou-profundidade-e-movimento]] — aurora, grão, cartão com sombra e foco de luz, herói de vidro SEM blur, transição de rota; medido: o blur custava 2,5x o quadro, e nada anda sozinho (24/09)
- [[placeholder-de-uma-linha-cabe-em-320px]] — 136px no composer, 234px no input; teto medido (11/09)
- [[o-historico-de-conversas-diz-quando]] — a data já vinha do banco e não era desenhada (11/09)
- [[o-consultor-em-balao-flutuante]] — o consultor a um toque, de qualquer tela (11/09)
- [[anotacoes-do-corretor]] — bloco de notas com lembretes (06/09)
- [[fila-do-inicio-e-uma-fila]]
- [[nome-util-do-lead-e-modulo-puro]]
- [[alerta-sempre-aceso-vira-paisagem]]
- [[barra-fixa-que-estoura-a-largura]]
- [[arte-de-ia-nao-e-midia-do-catalogo]] — a 0101 liga a arte ao imóvel sem tocar em `midias` (06/09)
- [[capa-de-empreendimento-nunca-e-nula]] — o `else` de "sem foto" era código morto (06/09)
- [[botoes-perigosos-atras-de-avancado]]

## Importar e cadastrar
- [[importar-conversa-do-whatsapp]] — o .zip de "Exportar conversa" vira lead; contato salvo na agenda vem sem telefone, de propósito (12/09)
- [[importacao-de-leads-le-os-formatos-que-o-corretor-tem]] — .txt da conversa, .vcf, .xlsx, foto/print e o CSV do Google Contatos
- [[lista-de-leads-sem-cabecalho-e-lida-pela-ia]] — lista .txt solta vai à IA; telefone, nome e e-mail só entram se estiverem no texto

## Dados do lead
- [[perfil-do-lead-abre-dentro-da-conversa]] — detalhes e ações sem abandonar o chat
- [[conversa-casa-com-lead-por-telefone]]
- [[tentativas-de-contato-sao-duas-contagens]]
- [[campanha-tambem-mexe-no-funil]]
- [[arquivar-e-excluir-sao-lugares-diferentes]]
- [[dado-gravado-e-nao-exibido-e-dado-perdido]]
- [[o-contexto-da-decisao-da-ia]] — a conversa em gaveta sobre a lista de Pessoas
- [[numeric-chega-como-string]]
- [[telefone-e164-e-coluna-gerada]]
- [[memoria-da-conversa-e-ficha-viva]] — a IA preenche a ficha, e o que o corretor edita fica protegido (0110)

## Administração (gestor)
- [[papel-nunca-ganha-grant-update]]
- [[acesso-de-corretor-so-existia-para-um]] — o lote da 0095 nunca rodou: 1 usuário no Auth para 8 corretores, e nenhum caminho de UI para trocar e-mail ou definir senha escolhida (12/09)
- [[adm-nao-le-conversa-alheia]] — perfis separados: o ADM tem tudo menos a conversa de outro corretor, que a RLS fecha (0134); só o ADM exclui lead e desconecta número (30/09)
- [[adm-exclui-lead-direto]] — excluir lead direto na lista ativa e na ficha, sem arquivar antes, com confirmação; corretor exclui os seus, ADM todos (0145, 02/10)
- [[nome-da-agenda-chega-como-pushname]] — nome salvo na agenda chega no mesmo pushName do perfil; diagnóstico compara com o nome da conversa (03/10, em teste)
- [[menu-do-painel-reorganizado]] — menu reorganizado: arte e vídeo em Marketing, Consultor em Assistente, Administração em três seções, telas de apoio viraram botões, cor por seção em cada tópico (30/09)

## Performance
- [[o-site-e-lento-por-desenho-nao-por-peso]] — Início abre com 22 consultas (12 idênticas), 3 `getUser()` por requisição, Realtime + polling juntos; fase 4 do roadmap de performance (13/09)
- [[o-painel-carrega-por-rota-so-o-que-a-rota-usa]] — F4: Chat e ChatBase por next/dynamic no toque, sessão por getClaims(), contagem do funil deduplicada; o que ficou de fora e por quê (13/09)
- [[rodada-de-26-09-parte-3]] — agenda .ics, portal do comprador, andamento da obra, parceiros, Gmail do corretor, marca da instalação (0125-0126, 26/09)

## Relacionados
- [[MOC — Banco de Dados]] · [[MOC — Campanhas e Anti-ban]] · [[Home]]
- [[action-de-outro-build-vira-sem-conexao]] — 404/500 ao clicar é aba velha, não rede
- [[ordem-do-catalogo-no-site-tem-tela]] — Imóveis → Ordem no site: subir, descer e destaque; os 6 primeiros vão para a home (24/09)
- [[catalogo-exportado-em-excel]] — Imóveis → Exportar Excel: o catálogo numa tabela, com leads por imóvel (06/10)
- [[lead-sem-resposta-sai-da-base-sozinho]] — 7 tentativas sem resposta + 30 dias: arquiva (nunca exclui), volta se responder; cartão mostra "3/7" (06/10)
- [[funil-completo-e-resumido]] — 10 etapas no banco, resumido (6 grupos) por botão; IA move Mensagem enviada → Em conversa → Qualificado (06/10)
- [[ia-escreve-e-o-corretor-manda]] — botão ✨ no funil e na lista: IA faz o rascunho, corretor revisa e envia com cota e espaçamento (06/10)
- [[o-pedido-do-corretor-e-o-que-vai]] — o chat de arte parou de reescrever o pedido; a receita virou skill visível
- [[vendas-e-o-modulo-financeiro]] — F1 do financeiro: venda com co-corretagem, comissão por venda, distrato; só o gestor marca dinheiro recebido (0114, 25/09)
- [[link-de-anuncio-e-rodizio-aleatorio]] — sem especialista; link de anúncio sorteia e não repete o último do produto (0117, 26/09)
- [[vendas-e-o-modulo-financeiro]] — F2 a F8 (0115): extrato, meta em ritmo, ranking de VGV, desempenho, retorno de anúncio, roleta que aprende (26/09)
- [[caixa-da-imobiliaria]] — caixa do dono: contas a pagar e receber, saldo e fluxo de 13 semanas; comissão e repasse vindos das vendas (0166, 06/10)
- [[resultado-do-mes-da-imobiliaria]] — DRE mensal pelo regime de caixa, com mês anterior, acumulado do ano e 12 meses (06/10)
- [[fiscal-da-imobiliaria]] — impostos estimados, comissões sem nota, RPA e DIMOB, com planilhas para o contador (0167, 06/10)
- [[contador-da-imobiliaria]] — fechar o mês, pacote em planilha e link do contador sem login (0168, 07/10)
- [[ia-do-financeiro]] — alertas do dinheiro sem IA e chat que só usa números calculados (0169, 07/10)
- [[oito-funcionalidades-de-26-09]] — imóvel encontra quem procurava, resumo do dia no WhatsApp, documentos e seleção pelo link, unidades, pós-visita e primeiro contato com lead de portal (0118-0120, 26/09)
- [[aprimoramentos-das-oito-funcionalidades]] — avisos quando o cliente age no link, seleção escolhida à mão, compatibilidade com dossiê e renda, reserva com prazo, espelho da construtora, resumo na hora do corretor, painel de uso (0121-0122, 26/09)
- [[fechar-o-ciclo-e-ligar-a-plataforma]] — primeiros passos e prontidão da equipe, proposta por link, confirmação da visita, indicação pós-venda, compradores até as chaves, relatório por construtora, metas da equipe (0123-0124, 26/09)
- [[plantas-do-editor-nunca-eram-salvas]] — o Salvar do editor dizia "tudo salvo" e não gravava as plantas (26/09)
- [[graficos-que-decidem]] — seis gráficos que levam a uma ação: passagem do funil, quem espera resposta, origem com custo, placar da equipe, procura por imóvel, ritmo da meta (28/09)
- [[nove-ajustes-de-frontend-de-30-09]] — contadores voltam como marcas no menu, barra de carregamento nos links, conversas em janela de 60/20 (30/09)
- [[tabela-de-precos-lida-pela-ia]] — a tabela da construtora (unidades) é lida pela IA; o menor valor só entra se estiver escrito no arquivo
- [[a-ia-so-responde]] — listas sugeridas no Início, resumo do lead na ficha, estado da IA em uma frase, nova paleta do funil (03/10)
- [[visita-remarcada-e-desmarcada-pela-conversa]] — visita combinada pelo corretor no chat vira sugestão de registro na fila do Início (0163, 06/10)
