---
title: MOC — CRM e Painel
tags: [moc, crm, painel]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-10-27
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
- [[marca-do-grupo-no-crm]] — nome, logo e endereços do painel por imobiliária; a Next Home não muda (21/10)
- [[plataforma-astro-solucoes-e-barra-da-empresa]] — plataforma vira Astro Soluções; topo mostra Astro | imobiliária, como TOTVS/SAP (28/10)
- [[app-no-celular-area-segura-login-e-abertura]] — app Android não corta mais (áreas seguras), login novo e abertura animada (29/10)
- [[login-por-usuario-senha-forte-e-validade]] — login por usuário, senha forte com checklist e troca a cada 90 dias (29/10)
- [[notificacoes-no-celular-e-poderes-do-adm]] — 4 avisos novos no celular e poderes do ADM da plataforma (29/10)
- [[contratar-plano-pela-pagina-da-astro]] — clicar no plano leva ao assistente de contratação; pedidos na Plataforma (29/10)
- [[suporte-e-contato-da-astro]] — Fale com a Astro, Suporte da Astro no painel e /plataforma/suporte (29/10)
- [[ficha-publica-do-imovel]] — /imovel/<grupo>/<slug> para imobiliária sem site e o montador único do link do imóvel (21/10)
- [[botoes-que-parecem-botoes]] — todo botão mostra que é botão sem o mouse; quatro estilos e guarda (09/10)
- [[anuncios-pagos-em-abas]] — Anúncios pagos em cinco abas por `?aba=`; `botao-solido` e `botao-aba` (26/10)
- [[lateral-recolhe-e-rola-sozinha]] — lateral rola por dentro, recolhe em ícones; cabeçalho do celular some ao rolar (09/10)
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
- [[lembrete-da-tarefa-chega-no-whatsapp]] — a tarefa da ficha do lead avisa no WhatsApp (14/10)
- [[documentacao-do-lead]] — listas por fase, conferir/recusar com motivo, guardar do WhatsApp, .zip (16/10)
- [[arquivo-grande-nao-passa-pela-server-action]] — o link de documentos sobe direto ao armazenamento (Vercel recusa > 4,5 MB), foto reduzida, link vencido, dica por item (16/10)
- [[conta-so-whatsapp]] — conta usada só como WhatsApp Web: todas as conversas, sem virar lead, texto guardado, IA desligada (0180, 17/10)
- [[conta-oculta]] — conta que trabalha e não aparece para ninguém: fora do site, roleta, ranking e telas da equipe; só o gestor a vê em "Contas ocultas" (0189, 19/10)
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
- [[telefone-com-55-que-a-planilha-corta]] — "5,51198E+12" não vira telefone; colar, link do Google e .xlsx trazem o número inteiro (09/10)

## Dados do lead
- [[fk-do-embed-de-leads-e-explicita]] — desde a 0206, `leads` tem duas FKs para `corretores`; embed sem `!leads_corretor_id_fkey` derruba lista e ficha com PGRST201 (22/10)
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

- [[administrador-da-plataforma-cria-acessos-do-grupo]] — o operador cria convite de corretor ou administrador no detalhe da imobiliária; titular define senha e completa dados (23/10); redefine senha de quem já tem login (28/10)
- [[primeiro-acesso-completa-ficha-administrativa]] — gestor pode receber acesso sem dados profissionais; completa nome, CRECI e WhatsApp no primeiro acesso e segue oculto do site/roleta (23/10)
- [[logins-da-aretz-com-senha-provisoria]] — acessos novos com troca de senha e preenchimento de CRECI/WhatsApp no perfil (23/10)
- [[leads-distribuidos-nos-grupos-da-aretz]] — a roleta mantém o dono; o grupo `NOME & ARETZ` recebe o aviso pelo número central (23/10)
- [[vinculo-do-corretor-no-grupo-e-lid]] — o corretor é reconhecido no grupo pelo par número↔@lid; grupo de dois corretores é recusado (26/10)
- [[retorno-da-ligacao-pelo-grupo]] — Aretz liga primeiro: roleta avisa no grupo, corretor conta a ligação por texto/áudio no grupo e a IA atualiza ficha, etapa e visita; lista das 18h ao gestor (27/10)
- [[audio-do-retorno-na-ficha-e-na-exclusao]] — player na ficha (link de 1 h no servidor) e o áudio sai na LGPD: ler o caminho ANTES de o lead sair (26/10)
- [[roleta-pula-whatsapp-desconectado-por-opcao]] — gestor pode transformar a preferência por conexão em filtro por imobiliária (23/10)

- [[plataforma-multi-grupo]] — produto multi-empresa: grupos, ficha no lugar da conversa, saída do corretor, planos (18/10)
- [[saida-do-corretor-e-etiqueta-de-origem]] — todo lead diz quem o trouxe (leads.trazido_por); na saída, os da imobiliária são redistribuídos e o corretor leva só a ficha dos dele (0200, 20/10)
- [[identidade-da-ia-de-cada-grupo]] — tela Administração > Assistente: o gestor dá nome, região e tom à IA da equipe (0199, 20/10)
- [[cota-de-respostas-da-ia-por-grupo]] — teto mensal de respostas da IA por grupo (plano ou ajuste da plataforma), contado por gatilho; no teto a IA cala com `cota_do_grupo` (0197, 20/10)
- [[saude-e-custo-da-ia-por-grupo]] — semáforo de saúde e custo da IA (R$, margem) por grupo em /plataforma; telemetria agregada por rpc (0211, 21/10)
- [[livro-do-consumo-da-ia]] — toda chamada paga de IA grava em `ia_consumo` (finalidade + quem paga); o custo da plataforma sai dele, por funcionalidade (0233, 29/10)
- [[plataforma-tipos-de-conta]] — /plataforma em duas seções (imobiliárias × independentes) com selo e filtro; criação por rotas separadas, mesma action/RPC (22/10)
- [[limites-do-plano-artes-videos-e-listas]] — teto mensal de artes, vídeos e mensagens de lista por plano, contado por gatilho (colunas novas em `uso_da_ia`); confere antes de gastar, lista que não cabe é recusada inteira, Next Home sem teto (0214, 22/10)
- [[numero-em-um-grupo-e-aceite-dos-termos]] — um número de WhatsApp só fica num grupo (gatilho por grupo, recusa com frase no pareamento e no webhook) e o painel pede o aceite dos termos no primeiro acesso (0198, 20/10)
- [[papel-nunca-ganha-grant-update]]
- [[acesso-de-corretor-so-existia-para-um]] — o lote da 0095 nunca rodou: 1 usuário no Auth para 8 corretores, e nenhum caminho de UI para trocar e-mail ou definir senha escolhida (12/09)
- [[cadastrar-corretor-pelo-painel]] — ficha e login de corretor novo pela tela de Contas (07/10)
- [[cadastro-e-marca-removidos-do-painel]] — cadastro novo, Meu site e Marca retirados por decisão do usuário; dados existentes permanecem (22/10)
- [[perfil-de-demonstracao-do-corretor]] — corretor fictício para apresentação, isolado e com script de remoção (07/10)
- [[painel-da-tela-de-vendas]] — indicadores e gráficos de VGV, comissão e imóveis na tela de Vendas (07/10)
- [[mascote-da-ia]] — o botão do consultor virou o mascote da IA, sem fundo (07/10)
- [[tela-de-trabalho-mostra-a-carteira-de-quem-abriu]] — o ADM via a carteira da equipe inteira nas telas de trabalho; agora toda lista/contagem recorta pelo usuário logado, e só o gestor pede outra carteira pela URL (19/10)
- [[adm-nao-le-conversa-alheia]] — perfis separados: o ADM tem tudo menos a conversa de outro corretor, que a RLS fecha (0134); só o ADM exclui lead e desconecta número (30/09)
- [[adm-exclui-lead-direto]] — excluir lead direto na lista ativa e na ficha, sem arquivar antes, com confirmação; corretor exclui os seus, ADM todos (0145, 02/10)
- [[nome-da-agenda-chega-como-pushname]] — nome salvo na agenda chega no mesmo pushName do perfil; diagnóstico compara com o nome da conversa (03/10, em teste)
- [[menu-do-painel-reorganizado]] — menu reorganizado: arte e vídeo em Marketing, Consultor em Assistente, Administração em três seções, telas de apoio viraram botões, cor por seção em cada tópico (30/09)

## Performance
- [[o-site-e-lento-por-desenho-nao-por-peso]] — Início abre com 22 consultas (12 idênticas), 3 `getUser()` por requisição, Realtime + polling juntos; fase 4 do roadmap de performance (13/09)
- [[o-painel-carrega-por-rota-so-o-que-a-rota-usa]] — F4: Chat e ChatBase por next/dynamic no toque, sessão por getClaims(), contagem do funil deduplicada; o que ficou de fora e por quê (13/09)
- [[menos-bytes-sem-perder-os-efeitos]] — 12/10: vídeo cortado ao trecho visível (-0,9 MB no celular), GSAP/Lenis fora do painel, supabase-js por import() (chat 1.019–1.056 → 708–749 KB), fotos em variantes WebP com loader próprio (0177)
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
- [[financeiro-fase-a-parcelas-e-distrato]] — Fase A: comissão em parcelas, repasse × direto, distrato só do gestor, imposto por competência, IRRF/INSS com vigência e fonte (0232, 29/10)
- [[oito-funcionalidades-de-26-09]] — imóvel encontra quem procurava, resumo do dia no WhatsApp, documentos e seleção pelo link, unidades, pós-visita e primeiro contato com lead de portal (0118-0120, 26/09)
- [[aprimoramentos-das-oito-funcionalidades]] — avisos quando o cliente age no link, seleção escolhida à mão, compatibilidade com dossiê e renda, reserva com prazo, espelho da construtora, resumo na hora do corretor, painel de uso (0121-0122, 26/09)
- [[fechar-o-ciclo-e-ligar-a-plataforma]] — primeiros passos e prontidão da equipe, proposta por link, confirmação da visita, indicação pós-venda, compradores até as chaves, relatório por construtora, metas da equipe (0123-0124, 26/09)
- [[plantas-do-editor-nunca-eram-salvas]] — o Salvar do editor dizia "tudo salvo" e não gravava as plantas (26/09)
- [[graficos-que-decidem]] — seis gráficos que levam a uma ação: passagem do funil, quem espera resposta, origem com custo, placar da equipe, procura por imóvel, ritmo da meta (28/09)
- [[nove-ajustes-de-frontend-de-30-09]] — contadores voltam como marcas no menu, barra de carregamento nos links, conversas em janela de 60/20 (30/09)
- [[tabela-de-precos-lida-pela-ia]] — a tabela da construtora (unidades) é lida pela IA; o menor valor só entra se estiver escrito no arquivo; PDF e prints (o tabelão da RSF) desde 13/10
- [[a-ia-so-responde]] — listas sugeridas no Início, resumo do lead na ficha, estado da IA em uma frase, nova paleta do funil (03/10)
- [[visita-remarcada-e-desmarcada-pela-conversa]] — visita combinada pelo corretor no chat vira sugestão de registro na fila do Início (0163, 06/10)
- [[agenda-visitas-com-historico]] — visita com linha própria espelhada do lead, trava de 60 min, IA lê ocupados de visitas, tela Visitas virou Agenda (0224, 27/10, não publicada)
- [[agenda-por-mensagem-do-corretor]] — módulo puro que lê "visita com a Ana sábado 10h" do corretor/gestor e devolve o pedido peneirado em -03:00; sim/não sem IA; textos de confirmação (27/10, sem integração)
- [[agenda-da-equipe-reunioes-e-cobranca]] — gestor vê a equipe com números do mês, visita passada a outro corretor, reunião/bloqueio que travam a IA, cobrança "aconteceu?" e comandos pelo WhatsApp (0225–0227, 27/10, não publicada)
- [[notificacao-no-celular-do-corretor]] — lead novo e avisos chegam como notificação no celular; o WhatsApp para si mesmo não toca (20/10)
- [[aviso-ao-corretor-diz-o-que-fazer]] — alertas do atendimento e resumo do dia: o que fazer primeiro, ficha numa linha, carência por motivo (20/10)
- [[metragem-da-planta-nao-tinha-campo]] — editor do imóvel sem campo de metragem; planta nova nascia com 80 m² inventados (20/10)
- [[controles-rapidos-do-inicio]] — pausar a IA e dividir os leads do anúncio direto no Início (20/10)
- [[icone-e-manifesto-por-grupo]] — ícone da aba e manifesto PWA por grupo

- [[pareamento-fetch-failed-na-primeira-conexao]] — "fetch failed" ao gerar o código do WhatsApp; pareamento pela resposta do create, 2 tentativas e motivo no log
- [[pareamento-depois-de-401-recomeca-a-instancia]] ⚠️ número tirado da conta pelo WhatsApp: toda reconexão dava 401; instância em close é apagada e recriada antes do código, e a tela avisa a recusa (27/10)
- [[conta-sem-vinculo-tem-botao-de-sair]] — login sem cadastro de corretor ficava preso em "Conta ainda não vinculada"; o cartão ganhou o próprio Sair (29/10)
