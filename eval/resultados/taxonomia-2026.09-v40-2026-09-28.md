# Taxonomia de falhas — v40, 28/09/2026

Base: 16 personas simuladas (`npm run eval:conversa -- --sem-juiz --turnos=10`,
cliente `gpt-4o-mini`, agente `gpt-4.1-mini`, fixture de 10 imóveis regenerado
no mesmo dia e depois DESFEITO) + 1 conversa real de produção (9d731b8a, v39, 9 turnos).
Leitura humana, primeira falha de cada turno, categorias que saíram da leitura.

Ressalva: 9 das 16 conversas morreram na primeira rodada por **HTTP 429 (TPM de
200k no `gpt-4.1-mini`)** com 8 simulações em paralelo, e foram refeitas em
série. As refeitas já rodaram com parte das correções abaixo (foco e
cumprimento), então os números não são uma rodada limpa de v40.

| # | categoria | conversas (de 17) | exemplo | correção |
|---|---|---|---|---|
| 1 | Resposta enlatada da guarda anti-eco no lugar de responder | 10 (27 frases) | "Me conta um pouco mais do que você procura" a quem pediu o endereço 5x | `textoNoLugarDaRepeticao` recebe a fala do cliente: pergunta → pendência honesta; "robô ou humano?" → verdade + oferta do corretor; nunca pergunta dormitórios a quem já disse |
| 2 | Pergunta direta não respondida | 7 | "Vc tem apartamento de 2 dorm em Barueri" → "em qual região?" | `ehPergunta`: "você tem..." no começo é pergunta forte; "quero informações do X" é pedido |
| 3 | Leu errado a intenção | 5 | "pago 900 **hoje**, dá pra financiar" virou visita hoje; "tem algo que entregue ano que vem?" virou prazo do imóvel em foco | dia solto só agenda com contexto de visita; `pediuBusca` solta o foco; aceite de material vira `entregar_oferta`; "preciso falar/falo com ela" é saída suave; "vc não me mandou ainda" deixou de ser opt-out (v41) |
| 4 | Afirmação sem lastro | 5 | "região com ótima valorização" 4x; "visita confirmada terça 10h" sem o cliente aceitar | `afirmacoesSemLastro.ts`; `aceiteDeVisitaValido` descarta `confirmadaPeloCliente` que o planner não viu; prompt deixa de pedir "potencial de valorização" |
| 5 | Voz robótica | 6 | "Que bom receber seu oi!", "Oi Matheus, tudo bem?" no 3º turno, a mesma desculpa de preço 3x | `removerCumprimentoRepetido`, abertura nova em `ABERTURAS_DE_ROBO`, `sementeDoDesvio` |
| 6 | Perguntou o que o cliente já disse | 4 | "quantos dormitórios?" depois de "2 dorm"; "pronto ou na planta?" depois de "que entregue ano que vem" | "2 dorm"/"3 qtos" contam; "entrega/entregue" responde estágio |
| 7 | Foco errado ou nome não esclarecido | 3 | "da Next **Home**" travou foco no Breeze **Home** Clube; "vrita alphagran" → "não tenho essa informação" 10x | palavras da marca fora do índice; `palpiteDeNome` pergunta "você diz o Vitra?" |
| 8 | Visita sem imóvel | 1 | "combinado sábado 11h com a Sofia", sem imóvel; endereço pedido 6x | sem foco, `agendar`/`confirmar_visita` seguram o horário e perguntam qual imóvel; quem recebe é o corretor |
| 9 | Não coletou capacidade | 16 de 17 | renda/faixa perguntada em 1 conversa | pergunta de financiamento pede a renda; depois da visita confirmada, UMA pergunta de renda "pra levar a simulação" |
| 10 | Promessa sem ninguém do outro lado | 7 | "confirmo com o corretor e te trago" sem aviso ao corretor | `promessaDeRetorno.ts` + alerta `duvida_pendente` no webhook (com carência) |

Artefato, não defeito: o fixture regenerado não tinha o Terra Alta, que duas
personas citam (`elogiou-o-terra-alta`, `confuso-entre-dois`). Por isso ali a IA
disse "não está no catálogo", e o fixture voltou ao commitado.
**Não regenerar o fixture sem conferir os imóveis que as personas e os casos
golden citam.**

Ainda aberto (visto, não corrigido): cliente que insiste em desconto recebe a
mesma ficha em loop (a guarda corta frase a frase, mas sobra o suficiente para
parecer igual); a IA ecoa fato inventado pelo cliente ("tem vista pro mar");
renda dita (R$ 2.500) não é cruzada com o piso do imóvel (R$ 457 mil), e o
simulador de `lib/consultor/financiamento.ts` já sabe fazer essa conta.
