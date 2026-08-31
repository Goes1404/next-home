# Roadmap do Chatbot (Sofia) — 26/08/2026, revisto em 31/08

> Prioridade decidida pela régua de sempre desta casa: primeiro o que foi
> **medido** doendo em produção, depois o que multiplica venda, por último o
> que é polimento. Cada item aponta o arquivo onde a mudança mora, para a
> sessão que for implementar não começar do zero.

## Estado em 31/08/2026

O prompt está na **v25** — três versões além do que este arquivo descrevia.
A linha de base do eval de RESPOSTA está fechada e é comparável (mesmo
juiz `gpt-4.1`, mesmos 36 casos, mesmo denominador):

| versão | score | falhas duras | julgados |
|---|---|---|---|
| v23 | 90,3 | 2 | 36/36 |
| v24 | 92,0 | 1 | 36/36 |
| **v25** | **92,2** | **1** | 36/36 |

- **v24** consertou o detector de prazo, que reprovava a honestidade
  ("não tenho a data de entrega, eu confirmo com você" era cortado pelo
  guardrail — em produção, não só no eval).
- **v25** trocou a pergunta seca de renda por uma **escada de capacidade**
  (faixa → sozinho/conjunto → profissão → renda), e a profissão nunca vira
  renda deduzida.
- **Os pendentes de eval deste arquivo estão resolvidos:** as rodadas da
  v22, v23, v24 e v25 estão em `eval/resultados/`. O que NÃO rodou é o
  eval de **conversa**, parado na v20 — cinco versões sem a medição que
  pega o loop de repetição. É o pendente nº 1 daqui.

**O contexto que mudou tudo:** o número de WhatsApp está fora do ar desde
28/08 (ver H0.0 no `ROADMAP.md`). Nenhum item deste roadmap que dependa de
conversa real anda enquanto isso não voltar — e a medição de produção
confirma: 55 conversas com fala do bot desde 25/08, e só **3** com duas ou
mais falas do cliente.

## Entregue em 26/08 (esta rodada)

- **Nome de imóvel com typo em palavra curta é reconhecido.** "virta" acha o
  Vitra, "vitrra" também. Palavras de 5–6 letras não toleravam NENHUM erro —
  era daí que vinha o "só reconhece escrito certinho". Agora toleram um erro
  no miolo, com três guardas: primeira E última letra têm de bater, palavra
  comum do português nunca entra no fuzzy, e empate entre imóveis diferentes
  continua descartado. (`focoDaConversa.ts`)
- **A pergunta de região ficou específica**: "em qual região de Barueri você
  procura?" no lugar de "procura em que região?". Pergunta vaga recebe
  resposta vaga. (prompt v21, `aiAgent.ts`)
- **A região que o cliente fala entra sozinha no CRM.** O dossiê extrai
  `regiaoInteresse` da conversa e grava em `leads.regiao_interesse` — o mesmo
  campo que a ficha do lead e o painel de conversas já mostram. Nunca
  sobrescreve com vazio. (`dossierExtractor.ts` + `repositorio.ts`)

## Curto prazo (próximas 1–2 semanas)

1. **Preencher `nomes_alternativos` — 23 de 25 publicados seguem vazios**
   (medido em 31/08; os 2 preenchidos vêm do backfill da 0044, nenhum foi
   curado à mão). E o "bônus" de 26/08 — o aviso de campo vazio na tela do
   imóvel — **nunca produziu uma linha**: a última edição de QUALQUER
   empreendimento em produção é de 25/08 01h55, anterior ao próprio aviso e
   ao campo "Também conhecido como". Aviso dentro de tela que ninguém abre é
   indistinguível de aviso que não existe; se a curadoria não acontecer esta
   semana, o caminho é uma lista dos 23 no painel, não mais um aviso no
   editor. Nove dos 23 têm nome que é TÍTULO DE ANÚNCIO ("3 Dormitórios com
   Suite e 2 Vagas", "Melhor valor de metro da Região") — para esses o
   apelido não é opcional, é a única forma de o bot reconhecer o imóvel.
   **[ENTREGUE 31/08] A lista está no painel**, na tela de Imóveis
   (`ApelidosPendentes.tsx` + `apelidoPendente.ts`): os 23 de uma vez, com
   os 9 títulos de anúncio abertos no topo e os 14 nomes de verdade atrás de
   um clique, cada linha levando direto ao editor daquele imóvel. Mostra
   bairro e construtora ao lado — para "Melhor valor de metro da Região" o
   nome não diz nem qual imóvel é. Não custa consulta nova (a lista de
   imóveis já está carregada na tela) e some sozinha quando a curadoria
   acabar. **O que falta agora é só o trabalho humano: os apelidos são
   conhecimento do corretor, não dedução do código.**

   *Texto original:* **Preencher `nomes_alternativos` dos cadastros reais.** A correção de
   grafia não alcança nome comercial diferente do nome do cadastro ("Dom
   Parque" ≠ "Lançamento ao Lado do Parque") — isso é dado, não código. Passar
   pelos ~27 cadastros e registrar como cada um é anunciado.
   **[Bônus entregue 26/08]**: a tela do imóvel agora avisa quando o campo
   está vazio (o problema era invisível — a IA só falhava dias depois, no
   WhatsApp, longe de onde a correção mora).
2. **[ENTREGUE 26/08] Extrair `dormitorios_min` da conversa.** Feito no
   mesmo padrão da região: prompt do dossiê + persistência em `salvarDossie`
   (só quando há valor) + entrada no bloco "o que você já sabe" do prompt.
   O dossiê também passou a etiquetar crédito (credito_aprovado /
   precisa_assessoria_credito), estágio desejado e finalidade
   (moradia/investimento) nas exigências — a ficha já as exibe.
2b. **[ENTREGUE 26/08, medir na v22] Agir em vez de pedir licença.** Pedido
   do usuário: "posso te mandar as fotos?" vira "te mandei as fotos aqui
   embaixo" COM o anexo na mesma resposta. Regra 28 da v22: ação que é dela
   e não custa nada ao cliente (foto, planta, link) se executa e se anuncia;
   pergunta fica reservada ao que exige compromisso DELE (horário, ligação,
   dado pessoal). Pendente: rodar o eval da v22 e conferir nas conversas
   reais se o "posso...?" sumiu — instrução de prompt é probabilística, e se
   sobrar caso em produção o caminho é guarda determinística em
   `vozHumana.ts` (detectar pergunta de permissão + pedido de mídia e
   converter em envio). **Em 31/08 a conferência em produção continua
   impossível**: só 3 conversas com 2+ falas do cliente desde 25/08, e o
   número está fora do ar desde 28/08.
2c. **Aprimorar as lacunas da qualificação (pedido de 26/08).** O que resta
   estruturar: suítes e vagas como colunas (hoje são texto livre nas
   exigências), status de crédito e finalidade como campos próprios quando
   alguma tela precisar filtrar por eles, e a régua "convite de visita só
   com o básico em mãos" (região + o que procura — entrou no prompt v22)
   verificada no eval de conversa com um critério que a meça de verdade
   (lição da casa: regra nova sem critério que a leia é decorativa).
3. **Onda 2 do loop de repetição.** A v18 derrubou perguntas repetidas de 53
   para 36 no eval de conversa; o resto do loop está mapeado e continua sendo
   a queixa que mais mata conversa. (`repeticao.ts`, métricas em
   `metricasConversa.ts`)
3b. **[ENTREGUE 26/08] Renda antes de indicar imóvel.** O eval da v22
   flagrou a IA indicando imóvel com região, estágio e tipologia na mesa e
   NENHUMA pergunta de renda — a regra 4 do funil já estava no prompt e
   perdeu para as outras 28. Corrigido por construção: `funilQualificacao.ts`
   calcula a pendência e injeta um bloco curto e imperativo
   (`PENDÊNCIA DESTA CONVERSA — RENDA`) no prompt, no caminho único do
   `turnoDeAtendimento` (os quatro chamadores enxergam a mesma conversa).
   Conservador de propósito, porque repergunta é o defeito nº 1 daqui:
   não dispara se a renda está no dossiê, se o cliente já tocou no assunto,
   se a assistente acabou de perguntar, no começo da conversa, ou antes de
   região E tipologia. Prompt v23. **[Confirmado] o eval da v23 rodou
   36/36 (90,3) e a v25 refinou a pergunta numa escada de capacidade,
   fechando em 92,2 com uma falha dura.**
4. **[ENTREGUE] Linha de base do eval de RESPOSTA fechada** — v22 a v25
   rodadas, score subindo (90,3 → 92,0 → 92,2). **O que ficou no lugar
   dele, e é o pendente nº 1 deste arquivo: o eval de CONVERSA está parado
   na v20.** Cinco versões de prompt subiram sem a única medição que pega
   loop de repetição, desfile de imóveis e resposta que não responde.
   Rodar `npm run eval:conversa` na v25, em lotes de ≤4 personas (teto de
   10 min por comando), duas rodadas — uma só não separa regressão de
   variância.

## Médio prazo (próximo mês)

5. **[ENTREGUE 26/08] Região alimenta o ranking do catálogo.** A região do
   dossiê virou sinal persistente em `ranquearCatalogo`: bairro que casa
   soma 20, cidade soma 10 — menos que a menção explícita de agora (o
   assunto da vez manda), mais que o desempate editorial. Casamento nas
   duas direções com piso de 4 letras ("Centro de Barueri" acha bairro
   Centro E cidade Barueri, sem "de" casar com nada). 4 testes novos.
6. **[ENTREGUE 26/08] Follow-up com contexto, não genérico.** A instrução
   do runner agora carrega os ganchos do dossiê (região, dormitórios) e
   muda por tentativa: retomada com gancho concreto na 1ª, cutucada de UMA
   linha na 2ª (estilo da casa), sempre proibindo o "oi, tudo bem?".
   Função pura testada em `followupTexto.ts`.
7. **[ENTREGUE 26/08] Lembrete de visita na véspera.** Reusa a fila dos
   follow-ups com a coluna `tipo` (0054): o runner agenda sozinho o
   lembrete ~20h antes de toda visita com conversa de WhatsApp, revalida a
   agenda na hora do envio (visita desmarcada/movida descarta o lembrete)
   e a mensagem fala SÓ da visita. Três regras deliberadas: não conta no
   teto de 2 reengajamentos, resposta do cliente não o cancela (responder
   "ok" não desmarca visita), e a janela comercial do runner o segura para
   o horário certo. Data formatada no fuso de SP — a armadilha do
   calendário, com teste.
8. **Métricas de funil do bot no painel — as DUAS metades da frase antiga
   estavam erradas** (auditado em 31/08).
   - "Falta a tela" exagerava: já existe funil de 5 degraus alimentado pela
     view `whatsapp_funil_metricas`, em `/corretor/whatsapp` e como KPI em
     `/corretor/admin`. O que não existe é o funil com ESTA forma.
   - "Os dados já existem" subestimava, e é o erro caro: dos quatro degraus,
     **o do meio não tem dado nenhum**. `renda_mensal` está preenchida em 0
     de 112 leads e `regiao_interesse` em 1 — a interseção é zero. Uma tela
     construída hoje mostraria 123 → **0** → 46 → 2, e degrau zerado no meio
     de um funil não é medição, é ruído que ensina a ignorar a tela.
   - Achado de brinde: a tela que JÁ existe tem dois degraus permanentemente
     zerados (`leads_quentes` e `em_negociacao`) e ninguém reparou — ou
     seja, o projeto já tem no ar a demonstração do que acontece quando se
     monta funil sem dado.
   - **[ENTREGUE 31/08] O degrau mais barato foi aceso** (0072):
     `ia_interacoes.sugeriu_visita` tinha 46 linhas vivas e zero leitores no
     repositório inteiro. Agora é o degrau "Visitas propostas" da tela de
     WhatsApp — e a medida certa são **6 conversas**, não 46: a unidade do
     funil é a conversa, e contar interações multiplicaria o número por oito.
     Junto foi corrigido um erro de contagem que ninguém tinha visto: a
     visita saía de `etapa = 'visita_agendada'`, a etapa ATUAL, então o lead
     que visitava e AVANÇAVA sumia do degrau — um funil em que as visitas
     caem quando o negócio melhora. Agora é cumulativa (a data, que é o
     fato, ou a etapa de visita em diante).
   - **O que ainda falta é o degrau do meio**, e ele depende de conversa
     real: `qualificados (região + renda)` continua em 0 de 112.

## Longo prazo (quando o volume justificar)

9. **Crescer o golden dataset via 👍/👎.** A fila de revisão existe desde a
   0040; a régua de rótulos por semana decide quando o few-shot de
   `recuperacao.ts` fica realmente bom.
10. **Rodada completa do eval de conversa (16 personas) por versão de
    prompt**, em lotes de ≤4 (teto de 10 min por comando), com variância
    (3 rodadas) antes de declarar regressão.
11. **LGPD das conversas nunca liberadas.** Decisão de produto em aberto
    (registrada em MEMORIA): enquanto o número da instância for pessoal, o
    sistema grava conversa que a IA nunca vai atender. Retenção curta ou não
    persistir — decidir com o usuário, não sozinho.
12. **Entrada de imagem do cliente.** Cliente manda print de anúncio ou
    planta e pergunta "é esse?"; hoje só áudio tem caminho. Visão no Gemini
    resolveria o reconhecimento de imóvel por foto.
