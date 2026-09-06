---
title: Reconhecer o nome do imóvel tem duas metades, e só uma é ortografia
aliases: [nomes_alternativos, Damerau-Levenshtein]
tags: [prompt, ia, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/focoDaConversa.ts, supabase/migrations/0044_nomes_alternativos_empreendimento.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Grafia se resolve com distância de edição apertada; nome comercial ("Dom Parque" para "Lançamento ao Lado do Parque") só com nomes_alternativos. O erro é assimétrico.
---
# Reconhecer o nome do imóvel: duas metades

**(1) Grafia** — "alfaville", "terraalta", "vrita alphaville": resolvida com
Damerau-Levenshtein de limiar apertado (0 erro até 6 letras, 1 até 10, 2
acima), primeira letra obrigatória igual, empate entre imóveis diferentes
descartado.

**O erro é assimétrico**: não achar custa uma resposta genérica; achar o
ERRADO faz a IA afirmar metragem e entrega de outro empreendimento.

**(2) Nome comercial ≠ nome do cadastro** — nenhuma distância de edição
alcança: "Dom parque" para "Lançamento ao Lado do Parque", "manacá Barueri"
para "More na Aldeia de Barueri" — imóveis NOSSOS que o bot tratava como de
outra imobiliária. Resolvido com `nomes_alternativos` (0044), campo "também
conhecido como" na tela do imóvel. Casar contra a descrição inteira seria pior:
ela carrega bairro, cidade e construtora.

## Três falsos positivos que viraram régua

- "quero algo de ALTA qualidade" → foco no Terra Alta;
- "prefiro uma VISTA boa" → foco no Vista AlphaGran;
- "moro perto DO PARQUE" → casava com "Dom Parque" (1 letra de distância).

Daí as três guardas: palavra comum não identifica imóvel sozinha (`COMUNS`),
n-grama que começa por preposição nunca é nome (`ABRE_FRASE`), termo curto não
tolera erro nenhum.

## Cadastro em triplicata

O mesmo Dom Parque estava cadastrado TRÊS vezes. Gêmeos (mesmo nome +
construtora + bairro) se fundem no cadastro mais completo, e as reservas do
foco nunca trazem um gêmeo. Imóveis DIFERENTES que dividem apelido continuam
ambíguos. Os duplicados foram **despublicados**, não apagados (0046) — apagar
destruiria `midias` por cascade, deixando arquivo órfão no bucket. Cuidado:
"More Aldeia de Bareuri" e "More na Aldeia de Barueri" parecem o mesmo e são
imóveis diferentes (EBEN × RSF).

## Relacionadas
- [[foco-da-conversa]]
