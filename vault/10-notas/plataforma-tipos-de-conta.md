---
title: Plataforma separa imobiliária de corretor independente (lista e criação)
tags: [admin, painel, decisao]
type: nota
status: seedling
custou: medio
codigo: [src/lib/plataforma/tiposDeConta.ts, src/lib/plataforma/documentos.ts, src/lib/plataforma/listaPorTipo.ts, src/app/plataforma/page.tsx, src/app/plataforma/SeloDoTipo.tsx, src/app/plataforma/grupos/novo/, src/app/plataforma/acoes.ts]
created: 2026-10-22
updated: 2026-10-22
summary: O dono pediu para identificar imobiliárias e corretores independentes de relance e criar cada um por um fluxo próprio. A lista /plataforma tem duas seções com selo (ícone, cor e texto) e filtro por link; a criação tem duas rotas e uma só action/RPC por baixo. Sem migration.
---

# Tipos de conta na plataforma

Pedido do dono (admin da plataforma, usa no celular): "identificar de forma fácil
as imobiliárias e os corretores independentes, e a criação de um independente
tem que ser diferente da de imobiliária".

## Decisões

- **Lista** `/plataforma`: seções "Imobiliárias (n)" e "Corretores independentes (n)",
  selo `SeloDoTipo` (ícone + cor + TEXTO; o texto fica em `text-titulo` para o
  contraste não depender da cor). Filtro Todos/Imobiliárias/Independentes é
  link `?tipo=` (funciona sem JS). Grupo 1 (Next Home) é imobiliária com selo extra "Casa".
  Cartão da imobiliária mostra corretores ativos e mensalidade; o do independente,
  corretor, CRECI, plano e mensalidade.
- **Criação em rotas separadas**, não `?tipo=`: `/plataforma/grupos/novo/imobiliaria`
  e `/novo/independente`; `/novo` é só a escolha. Motivo: cada formulário tem só
  os campos do seu tipo.
- **Uma regra só**: `criarImobiliaria` e `criarCorretorIndependente` montam o
  pedido (funções puras em `tiposDeConta.ts`) e caem em `criarGrupoValidado`,
  que é o antigo fluxo (RPC `criar_grupo` + ficha gestora + convite). Colunas que
  a RPC não recebe (razao_social, documento, creci, creci_tipo, mensalidade,
  dia_do_vencimento) entram num `update` logo depois; se falhar, o grupo é desfeito
  (passo `cadastro` no evento `grupo_desfeito`). **Sem migration.**
- **Independente = uma pessoa**: é gestor do grupo e contato de cobrança (contato
  em branco vira o primeiro acesso em `validarNovoGrupo`). Nome do grupo = nome do
  corretor (sem sufixo "— Corretor": o selo já diz o tipo). CPF em `documento`, sem razão social.
- **Preços** (`mensalidadeDoPlano`): Essencial 97, Profissional 147, Imobiliária
  127 x usuários; mensalidade em branco = a do plano; digitada vence.
- **Imobiliária**: o CRECI-J também vai na ficha do gestor (a ficha exige CRECI).
- CPF/CNPJ: máscara no campo, só dígitos no banco, dígitos verificadores em `documentos.ts`
  (o CHECK do banco só confere 11/14 dígitos).
- Sucesso: link do convite para copiar e botão "Mandar pelo WhatsApp" (wa.me com a mensagem pronta).

## Armadilha achada

A página de detalhe `grupos/[id]/page.tsx` da branch base tinha `SaudeNoDetalhe` e
`CustoDaIa` duplicados (merge); removidos aqui.

Relacionadas: [[plataforma-multi-grupo]], [[saude-e-custo-da-ia-por-grupo]].
