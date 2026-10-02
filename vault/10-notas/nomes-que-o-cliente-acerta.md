---
title: Nomes que o cliente acerta — o checklist pedia apelido que não faz falta, e três nomes erravam o imóvel
aliases: [0136, apelido, royal barueri, copa 18 do forte, vitta]
tags: [ia, medicao]
type: nota
status: stable
custou: medio
codigo:
  - src/lib/imoveis/completudeDoCatalogo.ts
  - src/lib/imoveis/pendenciasDoCatalogo.ts
  - src/lib/whatsapp/focoDaConversa.ts
  - supabase/migrations/0136_nomes_que_o_cliente_acerta.sql
summary: Item 4 da prontidão para produção. Preço não sai do site da construtora (nenhuma das 21 publica), só da tabela de preços. O apelido só faz falta quando o nome é título de anúncio; o checklist deixou de cobrá-lo dos outros. Frases reais passadas pelo reconhecimento acharam três defeitos (copa/18 do Forte, Royal I × II, vitta → Vitra), corrigidos no código e na 0136.
updated: 2026-10-02
---

# Nomes que o cliente acerta (02/10/2026)

Item 4 da lista de [[revisao-antes-de-producao]]: "23 de 39 publicados sem
preço, 21 sem apelido".

## Preço: só pela tabela

- Baixei a página oficial dos 21 imóveis sem preço que têm site da
  construtora. **Nenhuma publica valor**: só formulário de simulação (o da
  RSF lista faixas do formulário, "R$ 100.000 à R$ 150.000", que não são
  preço). O caminho é a tabela de preços enviada pela tela de reajuste
  ([[tabela-de-precos-lida-pela-ia]]).
- Enquanto isso, imóvel sem "a partir de" não entra na indicação por renda
  ([[a-renda-da-ficha-nao-chegava-ao-atendimento]]).

## Apelido: só para nome de anúncio

- `focoDaConversa` reconhece o nome inteiro, a forma colada e a **palavra
  marcante** do nome ("beyond", "dellagio", "authoria"). Nome de verdade já
  basta; o apelido é para o nome que o cliente não tem como acertar.
- O checklist cobrava apelido de todo imóvel: 19 "incompletos" sem ganho.
  Agora a categoria (renomeada "Nome que o cliente reconhece") só falta
  quando `motivoDeUrgencia(nome)` acusa título de anúncio. `sem_apelido`
  saiu das pendências; sobrou `apelido_invisivel`.
- No catálogo publicado só um nome era anúncio: o Royal Barueri I.

## Três defeitos que só a frase real mostrou

| frase | antes | causa | correção |
|---|---|---|---|
| "tem copa e cozinha americana?" | Copa 18 do Forte | "copa" é cômodo | `copa`, `forte` em `COMUNS` + apelido "Copa 18" |
| "moro no 18 do Forte" | Copa 18 do Forte | bairro de 4 imóveis | idem |
| "me fala do royal barueri" | Royal Barueri II | o I se chamava "Royal Barueri - Shopping Barueri - Apartamento 1 a 3 Dorms" | renomeado "Royal Barueri" (slug igual) |
| "o royal barueri ii" | os dois Royal (desfile, sem foco) | "royal barueri" cabe em "royal barueri ii" | casamento exato engole o que está dentro dele, por posição |
| "vitta" | Vitra Alphaville | "vitta" é pulada por estar a 1 letra de "vista", e o aproximado acha o Vitra | apelido "Vitta" (rótulo inteiro sempre é registrado) |

- Termo com menos de 4 letras não é registrado, de propósito: o apelido
  "Joy" fica só como registro comercial.
- **Régua:** antes de cadastrar ou cobrar apelido, passe frases reais pelo
  `imoveisCitados` com os nomes de produção (script de dez linhas com
  `npx tsx`). O que decide é o que o reconhecimento faz, não a lista do
  checklist.

Relacionados: [[o-imovel-nao-tem-mais-corretor-dono]] ·
[[MOC — IA e Atendimento]] · [[MOC — Ingestão de Mídia]]
