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
   pelos ~27 cadastros e registrar como cada um é anunciado. Bônus: um aviso
   na tela do imóvel quando o campo está vazio.
2. **Extrair `dormitorios_min` da conversa.** A coluna existe em `leads`,
   a ficha lê, e ninguém escreve — mesma família do defeito da renda e do
   orçamento (0 de 58 leads preenchidos até alguém ligar o fio). Uma linha no
   prompt do dossiê + persistência em `salvarDossie`.
3. **Onda 2 do loop de repetição.** A v18 derrubou perguntas repetidas de 53
   para 36 no eval de conversa; o resto do loop está mapeado e continua sendo
   a queixa que mais mata conversa. (`repeticao.ts`, métricas em
   `metricasConversa.ts`)
4. **Rodar o eval da v21 e fechar a linha de base.** O prompt mudou nesta
   rodada e o eval não rodou (sem chave no sandbox). Regra da casa: score não
   pode cair vs. v20.

## Médio prazo (próximo mês)

5. **Região alimenta o ranking do catálogo.** Hoje `catalogoRelevante.ts`
   pontua menções e faixa de orçamento; com `regiao_interesse` preenchida
   sozinha, dá para priorizar os imóveis da região do cliente antes mesmo de
   ele citar um nome — e a Sofia apresenta "o que existe ALI" com mais
   precisão.
6. **Follow-up com contexto, não genérico.** Os dois follow-ups (+24h/+72h)
   existem e consomem cota anti-ban; o texto ainda não usa o dossiê. "Vi que
   você procurava 3 dorm no centro de Barueri — abriu uma condição nova no X"
   converte mais que "oi, tudo bem?". (`0028` + `campaignQueue.ts`)
7. **Lembrete de visita.** Visita confirmada grava
   `leads.visita_agendada_em`, mas ninguém lembra o cliente na véspera —
   no-show é visita perdida do corretor. Um follow-up especial, fora da cota
   dupla, no dia anterior.
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
