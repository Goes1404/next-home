---
title: Me avise, favoritos, agenda no celular, portal do comprador, correções da IA, Gmail, parceiros e marca
tags: [crm, front, painel, whatsapp, ia, supabase, lgpd, decisao, arquitetura]
type: nota
status: growing
custou: medio
codigo:
  - supabase/migrations/0125_agenda_portal_correcoes_gmail_parceiros.sql
  - supabase/migrations/0126_token_da_agenda_fora_de_corretores.sql
  - src/lib/crm/alertaDeNovidade.ts
  - src/lib/crm/avisoDeNovidade.ts
  - src/lib/favoritos.ts
  - src/lib/comparacao.ts
  - src/lib/crm/agendaIcs.ts
  - src/app/api/agenda/[token]/route.ts
  - src/lib/crm/portalDoComprador.ts
  - src/app/(institucional)/portal/[token]/page.tsx
  - src/lib/whatsapp/correcoesDoCorretor.ts
  - src/lib/inbound/processarEmail.ts
  - src/lib/inbound/gmail.ts
  - src/lib/inbound/gmailCaixa.ts
  - src/app/(institucional)/parceiro/[token]/page.tsx
  - src/lib/marca.ts
  - src/lib/site.ts
  - docs/INSTALAR-NOVO-CLIENTE.md
created: 2026-09-26
updated: 2026-09-26
summary: Oito funcionalidades novas. O achado que importa é de segurança — `corretores` é pública para anon (policy "corretores sao publicos"), então o token da agenda .ics, que expõe nome e telefone de cliente, não podia morar lá; saiu para `corretor_agenda` na 0126 antes de qualquer link ser gerado. Outros: link de aviso de novidade usa `detalhes.avisados` como trava; a marca da instalação é UMA variável (`NEXT_PUBLIC_MARCA`) porque `site` é lido em 50 arquivos de forma síncrona; o Gmail do corretor usa escopo restrito (Workspace interno ou 7 dias em modo teste); webhook e Gmail compartilham `processarEmailDeLead`.
---

# Terceira rodada de 26/09

Continuação de [[fechar-o-ciclo-e-ligar-a-plataforma]].

## O que entrou

| Funcionalidade | Onde | Trava que importa |
|---|---|---|
| **Me avise quando surgir** | `/empreendimentos` (fim da lista) | um aviso por imóvel (`detalhes.avisados`), um por tique, depois da janela e com cota |
| **Favoritos e comparação** | coração no cartão e no herói; `/comparar?imoveis=a,b,c` | favoritos só no aparelho; vão no formulário e aparecem na ficha |
| **Agenda no celular** | Visitas → feed `.ics` | token em tabela fechada (ver abaixo); trocar o link invalida o antigo |
| **Portal do comprador** | ficha → "Portal do comprador"; `/portal/<token>` | um link por cliente, 4 anos; sem previsão cadastrada, não inventa data |
| **Andamento da obra** | tela do imóvel | foto só da galeria do próprio imóvel |
| **Corretor ensinando a IA** | Live Chat, depois do 👎 | correção só entra no prompt do MESMO corretor, escolhida por assunto |
| **Gmail do corretor** | Perfil → conectar | só leitura, só remetentes de portal; dedup por `email_message_id` |
| **Espelho para parceiros** | Admin → Parceiros; `/parceiro/<token>` | token conferido a cada chamada, 20 indicações/hora |
| **Marca** | Admin → Marca; `NEXT_PUBLIC_MARCA` | campo inválido é ignorado e o padrão fica |

## A armadilha: `corretores` é pública

A 0125 pôs `agenda_token` em `corretores`. Antes de usar, a conferência
`has_column_privilege('anon','public.corretores','agenda_token','SELECT')`
deu **true**: a tabela tem a policy "corretores sao publicos" porque a
página da equipe a lê. Com o token ali, qualquer visitante leria o link do
feed de visitas de todo corretor — nome e telefone de cliente. A 0126 tira a
coluna e cria `corretor_agenda` sem grant nenhum. Nenhum token chegou a ser
gerado. Guarda em `agendaIcs.test.ts`.

**Régua: credencial nunca mora numa tabela que o site público lê.** O mesmo
vale para `contas_email_google` (refresh token) e `parceiros.token`.

## Marca por variável, não por tabela

`site` é lido em 50 arquivos — metadados, JSON-LD, componentes de cliente —
de forma síncrona. Uma tabela obrigaria cada um a ficar assíncrono. A
variável é inlinada no build e vale igual no servidor e no navegador; como
cada cliente tem o próprio projeto Vercel ([[next-home-e-o-espelho-da-versao-geral]]),
trocar a marca é trocar a variável e redeployar. Os textos "Next Home"
fixos no site, no painel e nos prompts passaram a usar `site.nome` — com o
mesmo resultado nesta instalação, então o prompt não mudou de conteúdo. O
logotipo em texto virou `<Wordmark>`. `seo.test.ts` passou a medir título
em template com a marca.

## Gmail: o limite é do Google, não do código

`gmail.readonly` é escopo restrito. Workspace da imobiliária → app Interno,
sem verificação. Gmail pessoal → modo Teste, 100 usuários, **acesso vence a
cada 7 dias**. Publicar para qualquer conta exige auditoria paga. Ver
[[ligar-entradas-de-leads]].

A leitura anda do e-mail mais velho para o mais novo e a marca
(`ultima_leitura_em`) só avança até onde o teto deixou; caixa com erro vai
para o fim da fila e não avança a marca, para não perder o que chegou
enquanto estava desconectada.

Relacionadas: [[audio-do-cliente-era-arquivo-cifrado]] · [[MOC — CRM e Painel]]
