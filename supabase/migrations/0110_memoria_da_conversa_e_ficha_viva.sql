-- 0110 — a memória da conversa e a ficha viva (11/09/2026)
--
-- Spec: docs/superpowers/specs/2026-09-11-memoria-da-conversa-e-ficha-viva-design.md
-- Plano: docs/superpowers/plans/2026-09-11-memoria-da-conversa-e-ficha-viva.md
--
-- Relatado assim: "ela não está conseguindo manter uma conversa e nem
-- entender quando o cliente não quer", e depois "faça a IA atualizar a ficha
-- do usuário melhor".
--
-- Três assuntos, e eles andam juntos porque saem do mesmo pedido:
--   1. a conversa passa a ter MEMÓRIA — o estado da negociação em prosa, que
--      sobrevive à janela de 40 falas (das quais até 27 são do corretor, na
--      medição de 11/09: o número é o WhatsApp pessoal dele);
--   2. o lead passa a ter um NÃO-PERTURBE que sobrevive à etapa;
--   3. o corretor passa a poder editar nome e e-mail. Hoje ele NÃO consegue:
--      o update passa pela policy e afeta zero linhas, calado — e todos os
--      55 leads que conversaram se chamam "WhatsApp 2461".
--
-- O número saiu 0110 e não 0109 porque a colisão previu-se e aconteceu no
-- mesmo dia: outra sessão criou 0108 e 0109 sem commitar, então `git ls-tree`
-- de origin não os mostrava.

alter table public.whatsapp_conversas
  add column if not exists memoria text,
  add column if not exists memoria_atualizada_em timestamptz,
  add column if not exists memoria_do_corretor boolean not null default false;

comment on column public.whatsapp_conversas.memoria is
  'O estado da negociacao em prosa curta: o que ele procura, quanto pode pagar, qual imovel escolheu, o que ja foi oferecido e RECUSADO, o que ficou combinado. Nao e transcricao - para isso existe whatsapp_mensagens. Escrita pela mesma extracao que ja produz o dossie, e editavel pelo corretor no painel.';

comment on column public.whatsapp_conversas.memoria_do_corretor is
  'A memoria atual foi escrita por uma PESSOA. A extracao seguinte preserva o texto dela e so acrescenta o que for novo: correcao que a proxima mensagem desfaz parece botao quebrado, e e assim que alguem para de corrigir.';

alter table public.leads
  add column if not exists nao_contatar_em timestamptz,
  add column if not exists nao_contatar_motivo text,
  add column if not exists campos_do_corretor jsonb not null default '[]'::jsonb;

comment on column public.leads.nao_contatar_em is
  'O cliente pediu para nao ser mais procurado. Separado de etapa=perdido de proposito: etapa anda e volta, e bastaria alguem arrastar o cartao para "Novo" para o numero de quem pediu para sair voltar a lista de transmissao. Fato e permissao moram em campos diferentes.';

comment on column public.leads.nao_contatar_motivo is
  'Em que familia a recusa caiu: desinteresse, ja_resolvido ou parada. E o que permite distinguir quem disse "ja comprei" de quem disse "me tira da lista".';

comment on column public.leads.campos_do_corretor is
  'Lista dos campos que uma PESSOA editou pelo painel. A IA nao escreve por cima deles. Quem escreveu um valor e um fato diferente do valor.';

-- O indice parcial existe porque a pergunta e sempre "quem NAO pode ser
-- contatado", e eles sao a minoria: indice total gastaria espaco para
-- responder a pergunta que ninguem faz.
create index if not exists leads_nao_contatar_idx
  on public.leads (nao_contatar_em)
  where nao_contatar_em is not null;

-- Grants.
--
-- Em `leads` o UPDATE e coluna a coluna desde a 0007: coluna nova editavel
-- pelo painel PRECISA de grant, senao a policy passa e o update afeta zero
-- linhas, em silencio. Quarta vez que esta armadilha aparece neste projeto.
--
-- `nome` e `email` entram agora porque NUNCA tiveram grant: medido em
-- 11/09/2026, o corretor nao conseguia renomear um lead pelo painel. E a IA
-- passa a escrever o nome, entao ele precisa poder corrigir o que ela errar.
grant update (nome, email, nao_contatar_em, nao_contatar_motivo, campos_do_corretor)
  on public.leads to authenticated;

-- Sobre o `anon`, e por que NAO ha revoke aqui.
--
-- A primeira versao desta migration trazia `revoke all (coluna) ... from
-- anon`, no espirito da 0077/0080/0082. Conferido depois de aplicar: NAO
-- FAZ NADA. As duas tabelas dao SELECT ao `anon` no nivel de TABELA, e o
-- Postgres nao desfaz um grant de tabela com um revoke de coluna -- o
-- privilegio continua ali, e `information_schema.column_privileges` continua
-- listando.
--
-- Revoke que nao revoga e pior que revoke nenhum: ele diz ao proximo leitor
-- que a coluna esta protegida quando nao esta. E o defeito do criterio
-- decorativo, que este projeto ja pagou quatro vezes.
--
-- O que de fato protege, conferido em pg_policies em 11/09/2026: NENHUMA
-- policy de SELECT alcanca o `anon` em `leads` nem em `whatsapp_conversas`
-- (as de SELECT sao `to authenticated`; a unica do `anon` e o INSERT do
-- formulario publico de lead). Com RLS ligada e sem policy, o grant de
-- tabela devolve zero linhas.
--
-- Tirar o SELECT de tabela do `anon` seria a segunda linha de defesa e NAO
-- entra aqui: mexe em duas tabelas centrais por um motivo que nao e o desta
-- migration. Fica registrado como trabalho proprio.
