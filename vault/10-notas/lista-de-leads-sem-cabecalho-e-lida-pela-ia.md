---
title: Lista de leads sem cabeçalho é lida pela IA, e tudo é conferido contra o texto
aliases: [importar txt com IA, lista solta de leads, leitura por IA da importação]
tags: [crm, ia]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/leads/leituraPorIa.ts
  - src/lib/leads/leituraPorIa.test.ts
  - src/lib/leads/importacao.ts
created: 2026-09-28
updated: 2026-09-28
fonte: pedido do usuário em 28/09/2026 ("lista de leads txt não preenche o formulário de forma correta")
summary: Lista .txt sem cabeçalho ia para o leitor de tabela, que punha a linha inteira no telefone e perdia nomes. Agora vai primeiro ao gpt-4.1-mini (llm.ts), em pedaços, e só entra o telefone, o nome e o e-mail que existem no texto.
---
# Lista de leads sem cabeçalho é lida pela IA

**O erro, reproduzido com três listas no jeito que o corretor escreve:**

| linha da lista | o que o leitor antigo gravava |
|---|---|
| `Maria Silva - (11) 99876-5432 - quer 2 dorm no Vitra` | nome "Contato sem nome", telefone = a linha inteira |
| `1. Carlos Souza — whats 11 91234-5678, visita sábado` | nome "visita sábado" |
| `Nome: Roberto Alves` / `Telefone: …` (ficha em linhas) | nome e observação perdidos |
| `Pedro, 11 3456-7890 (fixo) / 11 99988-7766 (cel)` | contato sumia |

A lista solta não tem colunas. O que separa nome, telefone e observação é o
sentido da frase, e um modelo lê isso melhor que uma regra.

**A ordem agora:**

1. Conversa do WhatsApp e `.vcf` seguem com os leitores próprios.
2. Tabela **com cabeçalho** reconhecido (`temCabecalhoDeContatos`): leitor
   determinístico, sem chamada de IA.
3. Lista **sem cabeçalho**: `lerListaComIa`, via `chamarLlmJson` (o motor
   único, `gpt-4.1-mini`). O texto vai em pedaços de ~2.500 caracteres,
   cortados em linha em branco quando dá, para uma ficha não ficar partida.
   Quatro pedaços em paralelo.
4. Se a IA não responder, a escada antiga continua (linha a linha, regex,
   Gemini), com aviso para conferir cada contato.

**Por que é seguro deixar a IA preencher:** nada entra sem estar no texto.

- O telefone tem de existir na lista, comparado por dígitos na mesma linha.
  Aceita o `55` que o modelo acrescenta; recusa qualquer outro número. Um
  número inventado mandaria mensagem para um desconhecido.
- Cada palavra do nome tem de aparecer na lista (sem acento, sem caixa).
  Nome que não passa vira "Contato sem nome", nunca um palpite.
- O e-mail tem de estar escrito na lista.
- O corretor ainda revisa a lista antes de gravar (a tela já dizia "Lidos
  por IA — confira nome e telefone").

A guarda foi provocada: sem a conferência de telefone e nome, dois testes
reprovam.

**Ainda sem prova:** o ambiente de desenvolvimento não tem chave da OpenAI,
então o que está demonstrado é o mecanismo com a IA simulada. A leitura real
se confere importando uma lista em produção.

Relacionado: [[importacao-de-leads-le-os-formatos-que-o-corretor-tem]],
[[importar-conversa-do-whatsapp]].
