# Roadmap — Estúdio de Imagem com IA

> Objetivo: transformar `/corretor/imoveis/criar-imagem` de um gerador de
> prompt em um diretor criativo conversacional. O corretor descreve a intenção;
> a LLM entende o contexto, pergunta somente o que altera a peça, apresenta o
> plano e só então a imagem é gerada.

## Norte de produto

O produto não vende um campo de prompt. Ele entrega uma peça que o corretor
consegue publicar com segurança: adequada ao canal, fiel ao imóvel quando há
referência, clara sobre a finalidade e revisável antes de consumir crédito.

Princípios:

1. A **LLM conduz o briefing**; regras locais só validam segurança, formato e
   dados confiáveis.
2. Uma pergunta precisa alterar a decisão criativa. Pergunta genérica é
   formulário disfarçado.
3. Geração só acontece após o corretor revisar e aprovar o plano.
4. Imagem criada só é sucesso depois de carimbo, Storage, registro e galeria.
5. Qualidade é medida por casos reais e avaliação humana, não por “parece boa”.

## Fase 0 — Confiabilidade e diagnóstico (bloqueadora)

**Objetivo:** nenhuma imagem paga se perde e todo erro aponta para a causa.

- Aplicar `0108_storage_de_artes_ia.sql` no projeto Supabase real e conferir
  bucket `empreendimentos`: JPEG/PNG/WebP, limite de 16 MB.
- Rodar uma geração `low` e uma `medium`; registrar tamanho antes/depois do
  carimbo, MIME, caminho, resposta do Storage e linha em `imagens_geradas`.
- Criar identificador de geração; a tela mostra o código de falha e o servidor
  loga o mesmo código. Nunca expor segredo nem mensagem crua ao corretor.
- Separar desfechos: geração falhou, carimbo falhou mas arquivo foi guardado,
  Storage recusou, banco não registrou e timeout após geração.
- Se o tempo de geração + persistência ultrapassar 60 s, mover a execução para
  job assíncrono, com polling, como o vídeo; não esticar a função.

**Saída:** uma geração é recuperável e auditável; “500” deixa de ser diagnóstico.

## Fase 1 — Briefing conversacional dirigido por LLM

**Objetivo:** a LLM entende a intenção antes de escrever o prompt.

Trocar o atual “perguntas + prompt” por um contrato de briefing:

```ts
type BriefingDeImagem = {
  intencao: string;
  finalidade: "anuncio" | "feed" | "story" | "capa" | "whatsapp" | "outro";
  publico: string | null;
  imovel: { slug: string; fatos: string[] } | null;
  referencias: { papel: "base" | "estilo" | "inspiracao"; path: string }[];
  decisaoPendente: { pergunta: string; alternativas: string[] } | null;
  plano: { cena: string; mensagem: string; formato: string; restricoes: string[] } | null;
};
```

- A LLM recebe conversa, escolhas anteriores, imóvel identificado e papéis das
  referências; devolve **uma decisão pendente** ou um plano completo.
- Perguntas são contextuais: “para qual finalidade?” quando o canal muda a
  proporção; “o que deve continuar igual?” ao editar uma foto; “qual benefício
  destacar?” quando há imóvel mas não há mensagem. Ela pode decidir não
  perguntar.
- Finalidade determina tamanho e composição: Story 9:16, feed 4:5/1:1,
  WhatsApp horizontal/vertical conforme uso. O corretor vê essa escolha e pode
  mudar antes de gerar.
- A LLM nunca inventa fatos de catálogo, preço, prazo, metragem ou texto legal.
  Dados factuais entram por código; ressalva legal continua em carimbo.

**Saída:** cada proposta explica “o que entendi”, “para que serve”, “qual formato
vou usar” e “o que vai aparecer”.

## Fase 2 — Referências e plano visual

**Objetivo:** foto não é um anexo opaco; tem papel criativo explícito.

- Até quatro referências, cada uma com papel selecionável: **base** (imóvel),
  **estilo** (clima/composição) ou **inspiração**.
- A LLM não afirma enxergar arquivo que não recebeu. Quando houver visão no
  modelo de briefing, ela descreve a referência em texto revisável; antes disso
  pergunta o que preservar, alterar ou comunicar.
- A proposta apresenta um storyboard mínimo: assunto, enquadramento, luz,
  atmosfera, copy permitida e restrições. O corretor edita esse plano, não um
  bloco técnico indecifrável.
- `gpt-image-2` recebe `image[]` com os papéis escritos no prompt; foto real é
  reinterpretada, nunca prometida como edição pixel-idêntica.

## Fase 3 — Geração e acabamento publicável

**Objetivo:** a peça final é utilizável, não só uma imagem bonita.

- Gerar a imagem a partir do plano aprovado, mantendo prompt e briefing como
  versões imutáveis da geração.
- Oferecer variações orientadas: “mais premium”, “mais familiar”, “mais claro”,
  “outra composição” — cada uma volta ao briefing, nunca reinicia do zero.
- Texto de campanha, logo, telefone, CTA e ressalva são camadas determinísticas
  opcionais/obrigatórias conforme o caso; texto legal nunca depende do modelo.
- Download nos formatos corretos para o canal e histórico com “gerar outra
  assim”, incluindo referências e finalidade usadas.

## Fase 4 — Qualidade, aprendizado e operação

**Objetivo:** melhorar com evidência, não por opinião isolada.

- Reação por peça: publicada, ajustada fora, descartada, motivo do descarte.
- Dataset de 30–50 pedidos reais cobrindo fachada, ambiente, lançamento,
  edição de foto, Story, feed e WhatsApp.
- Avaliação humana com quatro critérios: aderência ao briefing, utilidade para
  o canal, fidelidade aos fatos/referência e segurança da copy.
- Painel de funil: briefing iniciado → plano aprovado → geração concluída →
  download/publicação. Tempo até primeira arte e taxa de regeneração indicam
  se as perguntas ajudam ou atrapalham.

## Ordem de entrega

| etapa | dependência | critério de aceite |
|---|---|---|
| F0 | acesso ao Supabase/Vercel | nenhuma arte paga fica sem causa rastreável |
| F1 | F0 | LLM produz pergunta contextual ou plano completo |
| F2 | F1 | finalidade e referências mudam visivelmente o plano |
| F3 | F2 | imagem aprovada é guardada, reaproveitável e publicável |
| F4 | F3 | decisões de UX são guiadas por 30+ casos reais |

## Fora de escopo inicial

- vídeo e carrossel (mantêm seus fluxos próprios);
- clonagem de layout de referência; e
- promessa de edição pixel-idêntica de foto real.
