---
title: A página do imóvel mostrava o cadastro cru — zero que era ausência, título repetido e o endereço do escritório
aliases: [0140, textoDoCadastro, 0 vaga, tagline repetida]
tags: [front, armadilha]
type: nota
status: stable
custou: medio
codigo:
  - src/lib/imoveis/textoDoCadastro.ts
  - src/lib/supabase/mappers.ts
  - src/components/empreendimento/Tipologias.tsx
  - src/components/empreendimento/BookDigital.tsx
  - src/components/empreendimento/Lazer.tsx
  - src/components/empreendimento/Hero.tsx
  - src/components/empreendimento/Sobre.tsx
  - supabase/migrations/0140_texto_da_pagina_do_imovel.sql
summary: Avaliando a página pública do imóvel (nota 7), cinco defeitos vinham de mostrar o cadastro sem ler. Zero de banheiro/vaga virava "0 banh."; a frase de destaque era o começo da descrição (título repetido ou cortado no meio); frases coladas do import; o Book prometia PDF que não existe e "acabamento de altíssimo padrão"; o Dellagio tinha o endereço do escritório da construtora.
updated: 2026-10-02
---

# A página do imóvel mostrava o cadastro cru

**Zero no cadastro é "ninguém preencheu".** 50 de 94 plantas tinham
`banheiros = 0` e 41 `vagas = 0`, e o cartão da planta escrevia "0 banh. ·
0 vaga". A ficha do prompt da assistente já omitia o zero; a tela não.
Hoje campo zerado some (`camposDaPlanta`).

**A frase de destaque era a descrição.** Nos imóveis importados de portal,
`tagline` era a primeira linha da descrição (aparecia duas vezes seguidas na
seção Sobre) ou os primeiros 160 caracteres cortados no meio da palavra. Em
outros, era só o nome com enfeite ("Lançamento em Barueri Breeze Home
Clube"), e o nome saía três vezes na mesma tela. `textoDoCadastro`, chamado
no mapper, resolve na leitura: frase igual ao 1º parágrafo sai da descrição;
começo cortado deixa de ser título; nome + até três palavras some; acima de
120 caracteres não é título. Fica no mapper para site, prompt e legenda
social receberem o mesmo texto. Medido contra os 39 publicados antes de
subir: as frases derrubadas eram todas ruins.

**Frases coladas** ("Osasco!Descubra", "Características:Academia",
"excelência,cada") são separadas só em fronteira inequívoca: "." exige três
minúsculas antes, para não quebrar "Jd.Esperança"; vírgula só entre letras,
para não mexer em "52,39".

**O cartão do Book prometia o que não existe**: "Formato PDF · Acesso
instantâneo" em todo imóvel (nenhum tem book) e "acabamentos de altíssimo
padrão", que é a promessa que o cliente confere na visita. O texto agora
depende de `bookUrl`.

**Endereço do escritório da construtora** (0140): o do Dellagio era o "Onde
estamos" do site da Atria. Ao trazer endereço do site da construtora,
conferir se não é o rodapé. O pino já estava certo; só o texto mentia.

Dois preços na mesma página (descrição "a partir de R$ 289 mil" contra
R$ 349.900 cadastrado no Breeze; o mesmo no Bless Parque) saíram da descrição.
A lista de lazer passou a duas colunas no celular: a página do Breeze caiu de
~13,6 mil para ~11,5 mil px.

**Pendente**: o Alpha Park View diz "2 ou 3 suítes", e uma das plantas
cadastradas é de 1 dormitório. Conferir com a construtora.

## Relacionados
- [[MOC — Front Público]] · [[catalogo-conferido-imagem-por-imagem]] · [[capa-de-empreendimento-nunca-e-nula]]
