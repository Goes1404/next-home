---
title: MOC — CRM e Painel
tags: [moc, crm, painel]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-11
summary: Leads, funil, fila de trabalho, telas do corretor e do gestor.
---
# CRM e Painel — Map of Content

Diretriz de produto: corretor trabalha no CELULAR, mínimo de decisão, ~100
leads por corretor (gestor vê milhares via RLS). Reforma "Painel de Bolso"
F0–F6.

## Escala e consultas
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

## Administração (gestor)
- [[papel-nunca-ganha-grant-update]]

## Relacionados
- [[MOC — Banco de Dados]] · [[MOC — Campanhas e Anti-ban]] · [[Home]]
- [[action-de-outro-build-vira-sem-conexao]] — 404/500 ao clicar é aba velha, não rede
