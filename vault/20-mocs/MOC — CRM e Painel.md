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

## Performance
- [[o-site-e-lento-por-desenho-nao-por-peso]] — Início abre com 22 consultas (12 idênticas), 3 `getUser()` por requisição, Realtime + polling juntos; fase 4 do roadmap de performance (13/09)
- [[o-painel-carrega-por-rota-so-o-que-a-rota-usa]] — F4: Chat e ChatBase por next/dynamic no toque, sessão por getClaims(), contagem do funil deduplicada; o que ficou de fora e por quê (13/09)

## Relacionados
- [[MOC — Banco de Dados]] · [[MOC — Campanhas e Anti-ban]] · [[Home]]
- [[action-de-outro-build-vira-sem-conexao]] — 404/500 ao clicar é aba velha, não rede
- [[ordem-do-catalogo-no-site-tem-tela]] — Imóveis → Ordem no site: subir, descer e destaque; os 6 primeiros vão para a home (24/09)
- [[o-pedido-do-corretor-e-o-que-vai]] — o chat de arte parou de reescrever o pedido; a receita virou skill visível
- [[vendas-e-o-modulo-financeiro]] — F1 do financeiro: venda com co-corretagem, comissão por venda, distrato; só o gestor marca dinheiro recebido (0114, 25/09)
- [[link-de-anuncio-e-rodizio-aleatorio]] — sem especialista; link de anúncio sorteia e não repete o último do produto (0117, 26/09)
- [[vendas-e-o-modulo-financeiro]] — F2 a F8 (0115): extrato, meta em ritmo, ranking de VGV, desempenho, retorno de anúncio, roleta que aprende (26/09)
- [[oito-funcionalidades-de-26-09]] — imóvel encontra quem procurava, resumo do dia no WhatsApp, documentos e seleção pelo link, unidades, pós-visita e primeiro contato com lead de portal (0118-0120, 26/09)
- [[aprimoramentos-das-oito-funcionalidades]] — avisos quando o cliente age no link, seleção escolhida à mão, compatibilidade com dossiê e renda, reserva com prazo, espelho da construtora, resumo na hora do corretor, painel de uso (0121-0122, 26/09)
- [[fechar-o-ciclo-e-ligar-a-plataforma]] — primeiros passos e prontidão da equipe, proposta por link, confirmação da visita, indicação pós-venda, compradores até as chaves, relatório por construtora, metas da equipe (0123-0124, 26/09)
- [[plantas-do-editor-nunca-eram-salvas]] — o Salvar do editor dizia "tudo salvo" e não gravava as plantas (26/09)
