---
title: Plataforma multi-grupo
tags: [infra, admin, decisao]
type: nota
status: seedling
custou: alto
codigo: docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md
created: 2026-10-18
updated: 2026-10-18
summary: Decisão de 18/10/2026 — o CRM vira produto vendido para imobiliárias e corretores independentes numa plataforma só, com vários grupos no mesmo banco. Substitui "uma instalação por cliente". A Next Home vira o grupo 1, a preço de custo.
---

# Plataforma multi-grupo

Substitui [[next-home-e-o-espelho-da-versao-geral]] (26/09). Desenho completo
em `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`.

**Por que mudou:** para corretor independente pagando por mês, um banco e um
projeto Vercel por cliente custam mais do que ele paga, e cada migration
viraria N migrations.

## O que ficou decidido (pelo Matheus)

- **Grupo** = unidade de cliente. Imobiliária = grupo com gestores e
  corretores. Corretor independente = grupo de uma pessoa. **Um login, um
  grupo**; quem quer os dois usa dois logins.
- **Gestor nunca lê conversa**, nem o administrador da plataforma. A **ficha
  do lead** precisa ser completa: vira requisito, não melhoria.
- **WhatsApp**: número pessoal do corretor pela Evolution, como hoje. O risco
  de banimento é do corretor, por contrato.
- **Sites**: um site no código respondendo por vários endereços (grupo
  resolvido pelo `Host`). Endereço gratuito + domínio próprio. Portfólio com
  conteúdo livre e layout fixo. Texto de cada imóvel próprio de cada site,
  por causa de conteúdo duplicado no Google.
- **IA por grupo**: nome, região, fala preço ou não, tom, regras da casa.
  Proteções e funil iguais para todos.
- **Saída do corretor**: etiqueta de origem do lead que ninguém edita. O que
  ele trouxe vai com ele; o que o grupo deu fica, e quem herda recebe só a
  ficha.
- **Planos**: todas as ferramentas em todos; muda só a quantidade. Medidor
  único que reserva antes de gastar. Essencial R$ 97, Profissional R$ 147,
  Imobiliária R$ 127/corretor (provisórios até medir custo real).
- **Catálogo compartilhado** (fase 6): base da plataforma, cópia por grupo,
  sugestões numa tela com uma linha por imóvel; a base muda por fonte oficial.
- **Entrada e cobrança manuais** por enquanto, pelo painel da plataforma.

## O que vale saber antes de começar

- **A resposta da IA é mais de dois terços do custo de qualquer plano.** No
  pior caso o Profissional empata (~R$ 144 de custo para R$ 147). Medir o
  custo real e o cache de prompt antes de publicar preço.
- **O banco fica em `ca-central-1`** (decisão de 18/10, por dar menos
  trabalho). A política de privacidade e o contrato precisam declarar a
  transferência internacional. Região de projeto Supabase não muda depois;
  rever isso só seria barato antes do segundo grupo.
- **A leitura pública pela chave `anon` vira vazamento** num banco único
  (catálogo e telefones de todos os grupos pelo PostgREST): passa a ser
  feita no servidor, escopada pelo grupo.
- As 158 migrations nunca rodaram num banco vazio; o ambiente de testes é
  onde isso se prova.
