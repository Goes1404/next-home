# Roadmap do Chatbot (Sofia) — 26/08/2026

> Prioridade decidida pela régua de sempre desta casa: primeiro o que foi
> **medido** doendo em produção, depois o que multiplica venda, por último o
> que é polimento. Cada item aponta o arquivo onde a mudança mora, para a
> sessão que for implementar não começar do zero.

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

1. **Preencher `nomes_alternativos` dos cadastros reais.** A correção de
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
   converter em envio).
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
4. **Rodar o eval da v21 e fechar a linha de base.** O prompt mudou nesta
   rodada e o eval não rodou (sem chave no sandbox). Regra da casa: score não
   pode cair vs. v20.

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
8. **Métricas de funil do bot no painel.** Conversas → qualificados (região +
   renda) → visita proposta → confirmada. Os dados já existem
   (`ia_interacoes`, `leads`); falta a tela. Régua do projeto: dado gravado e
   não exibido é indistinguível de dado perdido.

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
