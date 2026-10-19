# Roteiro de produção da fase 1 (multi-grupo)

Este roteiro leva a fase 1 da plataforma multi-grupo para produção sem tirar a
Next Home do ar. **Quem executa é você, Matheus**: no SQL Editor do Supabase
(projeto `prhhrqyubjcafvucirri`), no painel da Vercel, no GitHub e num
terminal com o repositório. Nenhuma sessão do Claude aplica nada em produção.

O que sobe, na ordem:

| Passo | O quê | Código no ar durante o passo |
|---|---|---|
| 0 | Fotografia e conferências antes de tudo | antigo |
| 1 | Migration **0181** (tabela `grupos`, grupo dos corretores) | antigo |
| 2 | Migration **0182** (`grupo_id` em toda tabela) | antigo |
| 3 | Migration **0183** (chaves únicas e funções por grupo) | antigo |
| 4 | Migration **0184** (isolamento por policy, views, Storage) | antigo |
| 5 | **Deploy** do código da branch `fase-1-multi-grupo` | antigo → novo |
| 6 | Conferências com o código novo | novo |
| 7 | Migration **0185**, de 24 a 48 horas depois | novo |
| 8 | Fechamento | novo |

Por que nesta ordem:

- O código **antigo** funciona com 0181, 0182, 0183 e 0184 aplicadas. A 0183
  mantém a assinatura antiga do sorteio do `/wa`, e a chave pública continua
  gravando lead até a 0185.
- O código **novo** precisa da 0183 (sorteio com grupo, conferência de slug e
  e-mail livres, tipo `repasse`). E o build da Vercel lê produção pela chave
  publicável: **sem a 0182, o build quebra** (`generateStaticParams` de
  `/empreendimentos/[slug]` lê `grupo_id`). Por isso as migrations vêm antes
  do deploy.
- A 0185 apaga o que só o código antigo usa. Depois dela, voltar o código para
  a versão anterior pelo rollback da Vercel derruba o clique pago e o
  formulário. Por isso ela é a última e espera um ou dois dias.

Tempo estimado do passo 0 ao 6: de uma hora e meia a duas horas. O passo 7
leva uns 15 minutos, em outro dia.

---

## Antes de começar: o que você precisa ter

- Acesso ao SQL Editor do projeto `prhhrqyubjcafvucirri` (Supabase).
- Acesso ao painel da Vercel (projeto `next-home`) e ao GitHub (Actions do
  repositório).
- Um terminal com o repositório, na branch `fase-1-multi-grupo` atualizada.
  No PowerShell, use `curl.exe` (o `curl` sozinho é outro comando do
  PowerShell). No Git Bash, `curl` funciona e `NUL` vira `/dev/null`.
- Um celular de teste cujo número já é **lead cadastrado** na carteira de um
  corretor com WhatsApp conectado, com a IA ligada na conversa. Desde a 0111,
  número sem lead não é respondido. Se não tiver um, use a palavra-chave de
  ativação desse corretor a partir do seu número.
- O `user_id` de um **gestor** e o de um **corretor comum** (a consulta está no
  passo 0.5).
- Um lugar para anotar números: use a planilha no fim deste documento.

## Regras que valem em todo o roteiro

1. **Horário de pouco tráfego.** Cedo, antes das 8h, ou à noite depois das
   22h. Avise a equipe (principalmente quem tem o número conectado) de que
   pode haver um ou dois minutos em que mensagens do WhatsApp ficam sem
   resposta (ver passo 2) e de que vão chegar leads com o
   nome `TESTE ROTEIRO`.
2. **Uma migration por vez.** Abra o arquivo em
   `supabase/migrations/`, copie **o arquivo inteiro** (de `-- 0181:` até o
   `commit;` final), cole numa aba nova do SQL Editor e clique em **Run**. Não
   edite nada no texto. Se o editor pedir confirmação de "destructive
   operation", confirme.
3. **Cada migration é uma transação só** (`begin;` no começo, `commit;` no
   fim). Se der erro, **nada foi aplicado**. Nesse caso rode, numa aba nova:
   ```sql
   rollback;
   ```
   (se responder que não há transação, tudo bem) e depois a conferência do
   passo, para confirmar que nada mudou.
4. **Teto de espera de 5 segundos.** Toda migration começa com
   `set local lock_timeout = '5s'`. Se aparecer `canceling statement due to
   lock timeout` ou `deadlock detected`, não é defeito: a tabela estava
   ocupada. Rode a consulta C1 (abaixo), espere um minuto e aplique de novo,
   igual. Até três tentativas. Na terceira falha, pare e chame o Claude.
5. **Antes de cada migration, rode a C1** (transações abertas).
6. **O SQL Editor mostra só o resultado da última consulta.** Por isso cada
   conferência deste roteiro é **um** `select` só. Rode uma por vez. A
   exceção são as consultas "como uma pessoa" (C3, C3b e a 3d): as três
   linhas vão juntas, e o resultado que aparece é o do `select` do fim.
7. **SQL manual que grava evento da plataforma** em `admin_eventos` (sem
   grupo) precisa trocar de papel, porque a 0182 deixou de aceitar o
   `postgres` para isso. O molde é:
   ```sql
   begin;
   set local role service_role;
   insert into public.admin_eventos (acao, detalhes)
   values ('<ação permitida pelo check da tabela>', '{"origem":"plataforma"}');
   commit;
   ```
   Este roteiro não precisa gravar evento nenhum. A regra fica aqui para o caso
   de alguém querer registrar algo à mão durante a janela.
8. **Nunca use `git push --force`.** Se um push for recusado, pare.
9. **O SQL Editor não registra a migration no histórico** do Supabase
   (`list_migrations`). Isso já é o estado conhecido do projeto: o histórico
   está dessincronizado desde agosto de 2026 e ninguém confia nele (ver
   `docs/MEMORIA.md`, seção Supabase). A conferência de cada passo é que diz se a migration está
   aplicada.

---

## Consultas que se repetem

### C1. Transações abertas (antes de cada migration)

```sql
select pid, usename, application_name, state,
       now() - xact_start as transacao_aberta_ha,
       left(regexp_replace(query, '\s+', ' ', 'g'), 100) as consulta
  from pg_stat_activity
 where datname = current_database()
   and backend_type = 'client backend'
   and pid <> pg_backend_pid()
   and xact_start is not null
 order by xact_start;
```

**Esperado:** nenhuma linha, ou só linhas com `transacao_aberta_ha` de poucos
segundos.

> **Pare aqui se** alguma transação está aberta há mais de 30 segundos. Espere
> dois minutos e rode de novo. Se a mesma transação continuar lá depois de
> cinco minutos, não aplique: anote o `pid` e a `consulta` e chame o Claude.

### C2. Totais do banco (sem RLS)

```sql
select
  (select count(*) from public.leads)              as leads,
  (select count(*) from public.whatsapp_conversas) as conversas,
  (select count(*) from public.whatsapp_mensagens) as mensagens,
  (select count(*) from public.empreendimentos)    as imoveis,
  (select count(*) from public.corretores)         as corretores,
  (select count(*) from public.midias)             as midias,
  now()                                            as medido_em;
```

**Esperado depois de cada passo:** cada número igual ao da medição anterior
(a última C2 anotada na planilha), mais o que entrou de verdade nesse
meio-tempo (os leads de teste contam), menos o que alguém da equipe
**excluiu** de verdade no mesmo período. Nenhuma migration deste roteiro
apaga linha dessas tabelas; uma queda só pode vir de exclusão feita no
painel.

Arquivar **não** diminui nada (o lead continua na tabela, só ganha
`arquivado_em`). O que diminui: excluir lead (ADM ou o próprio corretor;
leva junto, em cascata, as conversas e as mensagens dele), excluir imóvel
despublicado (leva as mídias dele) e remover foto da galeria. A foto de teste
do 4c entra e sai, e não muda `midias` no fim.

**Se algum número diminuiu, não pare logo: veja se a queda se explica.**
Troque `MEDIDO_EM_ANTERIOR` pelo `medido_em` da última C2 anotada e rode:

```sql
select
  (select count(*) from public.leads              where created_at > timestamptz 'MEDIDO_EM_ANTERIOR') as leads_novos,
  (select count(*) from public.leads              where arquivado_em > timestamptz 'MEDIDO_EM_ANTERIOR') as leads_arquivados,
  (select count(*) from public.whatsapp_conversas where created_at > timestamptz 'MEDIDO_EM_ANTERIOR') as conversas_novas,
  (select count(*) from public.whatsapp_mensagens where created_at > timestamptz 'MEDIDO_EM_ANTERIOR') as mensagens_novas,
  (select count(*) from public.empreendimentos    where created_at > timestamptz 'MEDIDO_EM_ANTERIOR') as imoveis_novos,
  (select count(*) from public.corretores         where created_at > timestamptz 'MEDIDO_EM_ANTERIOR') as corretores_novos;
```

Para cada tabela, `excluidos = anterior + novos − atual`. `leads_arquivados`
fica de fora da conta (arquivar não muda o total); serve só para você não
confundir arquivamento com exclusão. `midias` não tem `created_at`: a queda
dela só se explica por foto removida ou imóvel excluído na janela.

- Se alguém da equipe confirmar que excluiu essa quantidade (`excluidos`)
  nesse período (pergunte no grupo de quem
  estava trabalhando; os leads `TESTE ROTEIRO` só são excluídos no passo 8),
  a queda está explicada: anote na planilha e siga. Uma queda em
  `conversas`/`mensagens` explicada por lead excluído também vale.
- Se ninguém excluiu, ou a quantidade não bate com o que foi excluído, **pare**:
  alguma coisa apagou linha que ninguém pediu. Não aplique a próxima
  migration e chame o Claude com as duas C2 e o resultado acima.

Para não precisar fazer essa conta, peça à equipe, no aviso do passo 0.3, que
não exclua nada (leads, imóveis, fotos) durante a janela; arquivar pode.

### C3. O que uma pessoa enxerga (com RLS)

Troque `COLE_O_USER_ID` pelo `user_id` da pessoa (passo 0.5). Rode as três
linhas juntas.

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"COLE_O_USER_ID","role":"authenticated"}';
select current_user                                    as papel,
       public.corretor_atual()                         as corretor,
       public.eh_gestor()                              as gestor,
       (select count(*) from public.leads)             as leads,
       (select count(*) from public.whatsapp_conversas) as conversas,
       (select count(*) from public.empreendimentos)   as imoveis,
       (select count(*) from public.corretores)        as corretores,
       (select count(*) from public.pessoas_do_corretor) as pessoas;
```

**Esperado:** `papel = authenticated`. Os números são a sua referência:
anote-os.

> **Pare aqui se** `papel` vier `postgres`. O editor rodou as linhas
> separadas, e os números são do banco inteiro, não da pessoa. Não use esse
> resultado.

Nada nessa consulta grava. O `set local` vale só para ela.

### C3b. A mesma consulta, a partir do passo 1

Depois da 0181 existe `grupo_atual()`. Acrescente uma coluna:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"COLE_O_USER_ID","role":"authenticated"}';
select current_user                                    as papel,
       public.grupo_atual()                            as grupo,
       public.corretor_atual()                         as corretor,
       public.eh_gestor()                              as gestor,
       (select count(*) from public.leads)             as leads,
       (select count(*) from public.whatsapp_conversas) as conversas,
       (select count(*) from public.empreendimentos)   as imoveis,
       (select count(*) from public.corretores)        as corretores,
       (select count(*) from public.pessoas_do_corretor) as pessoas;
```

**Esperado:** `grupo = 00000000-0000-0000-0000-000000000001` e os mesmos
números de antes.

### C4. Log do Postgres (Supabase → Logs → Logs Explorer)

```sql
select timestamp, event_message
from postgres_logs
where regexp_contains(event_message,
  'grupo_id inferido|grupo_id obrigatório|grupo da linha difere|linha-mãe inexistente|não é tratada pelo carimbo|não muda: só a transferência')
order by timestamp desc
limit 100
```

**Esperado:** só linhas `grupo_id inferido pelo grupo único em <tabela>`. Elas
são **normais** enquanto só existe a Next Home: aparecem quando uma linha
chega sem dizer o grupo e sem uma linha-mãe preenchida (imóvel, item de lazer,
parceiro, campanha, lead do formulário antes de a roleta escolher o dono,
evento, log de e-mail). Com o código antigo no ar elas aparecem bastante;
depois do deploy, que passa o grupo explicitamente na maior parte dos
lugares, devem diminuir.

> **Pare aqui se** aparecer qualquer outra mensagem da lista
> (`grupo_id obrigatório`, `grupo da linha difere`, `linha-mãe inexistente`,
> `não muda`). Isso é uma gravação real sendo recusada. Anote a mensagem e a
> hora, e chame o Claude antes de seguir.

### C5. Linhas sem grupo, tabela por tabela (a partir do passo 2)

```sql
select c.relname as tabela,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from public.%I where grupo_id is null', c.relname),
                           false, true, '')))[1]::text::bigint as sem_grupo
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
 where c.relnamespace = 'public'::regnamespace
   and c.relkind in ('r', 'p')
 order by 2 desc, 1;
```

**Esperado:** `sem_grupo = 0` em **todas** as linhas, inclusive
`event_outbox`. A única tabela onde nulo pode aparecer no futuro é
`admin_eventos` (evento da plataforma), e hoje não há nenhum.

### C6. A porta do WhatsApp (`/wa`)

Escolha um imóvel publicado (o slug sai desta consulta) e use sempre o mesmo:

```sql
select slug, nome from public.empreendimentos where publicado order by nome limit 5;
```

No terminal (PowerShell), troque `SLUG` pelo slug escolhido:

```powershell
curl.exe -s -o NUL -A "roteiro-fase-1" -w '%{http_code} %{redirect_url}\n' "https://www.nexthomeimoveis.com/wa/SLUG?de=site"
curl.exe -s -o NUL -A "roteiro-fase-1" -w '%{http_code} %{redirect_url}\n' "https://www.nexthomeimoveis.com/wa?de=site"
```

O `?de=site` marca o clique como do site (não entra no rodízio do anúncio
pago) e o `-A` deixa o clique identificável no banco.

**Esperado:** as duas respondem `302 https://wa.me/55...`, igual ao passo 0.

> **Pare aqui se** alguma responder `302 .../contato` e no passo 0 respondia
> `wa.me`. O sorteio falhou: o clique pago está caindo no escape. Vá ao
> "Desfazer" do passo em que você está.

Conferir o clique gravado (só a partir do passo 2: antes dele a coluna
`grupo_id` não existe e a consulta dá erro):

```sql
select created_at, origem, corretor_id, grupo_id, de_pessoa
  from public.cliques_whatsapp
 where user_agent = 'roteiro-fase-1'
 order by created_at desc
 limit 4;
```

**Esperado:** a partir do passo 2, `grupo_id = 00000000-0000-0000-0000-000000000001`.

### C7. Lead de teste pelo formulário do site

No site (`https://www.nexthomeimoveis.com/contato`), envie o formulário com o
nome `TESTE ROTEIRO <passo>` (por exemplo `TESTE ROTEIRO 2`), o seu telefone
de teste e o consentimento marcado. Depois:

```sql
select l.created_at, l.nome, l.grupo_id, c.nome as corretor, l.origem_atribuicao,
       (select count(*) from public.marketing_eventos e
         where e.lead_id = l.id and e.tipo = 'lead.criado')               as eventos,
       (select count(*) from public.event_outbox o
          join public.marketing_eventos e on e.id = o.marketing_evento_id
         where e.lead_id = l.id and o.grupo_id = l.grupo_id)              as outbox
  from public.leads l
  left join public.corretores c on c.id = l.corretor_id
 where l.nome ilike 'TESTE ROTEIRO%'
 order by l.created_at desc;
```

**Esperado:** o lead novo aparece, `grupo_id = 00000000-0000-0000-0000-000000000001`,
`corretor` preenchido e `origem_atribuicao = roleta` (se houver alguém com
WhatsApp conectado, como no passo 0), `eventos = 1` e `outbox = 1`.

> **Pare aqui se** o formulário der erro na tela, o lead não aparecer, ou
> `eventos`/`outbox` vierem 0.

### C8. Mensagem de teste no WhatsApp

Do celular de teste, mande "teste roteiro" para o número conectado.

**Esperado:** a IA responde em até um minuto, e a mensagem e a resposta
aparecem no Live Chat (painel → Conversas).

> **Pare aqui se** não houver resposta em dois minutos. Antes de culpar a
> migration, confira que o número segue conectado (painel → WhatsApp) e rode a
> C4.

---

## Passo 0. Fotografia e conferências antes de tudo

Nada aqui grava em produção, exceto o lead de teste e os cliques de teste.

### 0.1 Linha de base do que está no ar

```powershell
curl.exe -s https://www.nexthomeimoveis.com/api/versao
```

**Esperado:** `{"versao":"c2b89f04b2b4"}` (o commit `c2b89f0`, de 17/10). Se
for outro, anote: o passo 5 vai conferir se ele está dentro da branch.

No painel da Vercel → **Deployments**, filtre **Environment: Production** e
anote o primeiro com status **Ready**: commit, branch e hora.

Rode a C6 e anote o resultado das duas linhas (`wa.me` ou `/contato`). Rode a
C8 e confira que a IA responde hoje, antes de tudo.

### 0.2 Fotografia do esquema (para comparar e para desfazer)

a) **Inventário.** Cole o arquivo `scripts/banco/inventario.sql` inteiro no
SQL Editor, rode e baixe o resultado em CSV (**Download → CSV**). Salve como
`inventario-producao-antes.csv` numa pasta sua (fora do repositório). Ele só lê
catálogo, nenhuma linha de cliente. Ele também serve para o passo 4 da Task 1
que ficou pendente (`supabase/REPRODUCAO.md`).

b) **Definições de funções, policies e views.** É daqui que sai o "desfazer"
de quase tudo:

```sql
select 'funcao' as tipo, p.oid::regprocedure::text as nome, pg_get_functiondef(p.oid) as definicao
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
union all
select 'policy', schemaname || '.' || tablename || ' :: ' || policyname,
       format('%s | %s | %s | using: %s | check: %s', permissive, roles, cmd, qual, with_check)
  from pg_policies
 where schemaname in ('public', 'storage')
union all
select 'view', 'public.' || viewname, definition
  from pg_views
 where schemaname = 'public'
 order by 1, 2;
```

Baixe em CSV como `definicoes-producao-antes.csv`.

> **Pare aqui se** algum dos dois arquivos não baixar inteiro. Sem a
> fotografia, o "desfazer" vira reconstrução de memória.

c) **Advisors.** Supabase → **Advisors → Security Advisor** → **Rerun
linter**. Tire um print da lista inteira.

d) **Totais.** Rode a C2 e anote.

e) **Visão geral do gestor.** Entre no painel como gestor, abra
Administração → Visão geral e tire um print dos números.

### 0.3 Avisar a equipe

Combine a janela com quem tem o número conectado. Diga que chegarão leads com
o nome `TESTE ROTEIRO` e que eles serão excluídos no fim. Peça também que
ninguém **exclua** lead, imóvel ou foto durante a janela (arquivar pode): a C2
confere que nenhum total caiu, e uma exclusão legítima obriga a fazer a conta
descrita lá.

### 0.4 Corretores desativados que ainda têm login

A 0181 faz corretor desativado perder o painel **na hora** (antes, desativar
só o tirava da roleta).

```sql
select id, nome, slug, papel, user_id
  from public.corretores
 where not ativo and user_id is not null
 order by nome;
```

**Esperado:** uma lista (pode ser vazia). Para cada pessoa da lista, decida:
se ela ainda precisa entrar no painel, reative-a **agora**, pelo painel
(Administração → Contas), que registra o evento. Se não precisa, ela perde o
acesso no passo 1, que é o comportamento correto.

> **Pare aqui se** houver alguém na lista e você não souber se a pessoa ainda
> usa o painel. Descubra antes de seguir.

### 0.5 Os `user_id` para as conferências

```sql
select nome, slug, papel, user_id
  from public.corretores
 where ativo and user_id is not null
 order by papel desc, nome;
```

Escolha **um gestor** (de preferência o seu, não a conta de demonstração) e
**um corretor comum** que tenha leads (por exemplo, quem tem o número
conectado). Rode a **C3** para os dois e anote os números. Essa é a referência
que tem de bater no fim.

### 0.6 Policies das taxas de crédito

A 0181 apaga a policy de leitura das taxas pelo **nome** que ela tem nas
migrations. Se em produção o nome for outro, a policy antiga (que lê tudo)
fica viva.

```sql
select policyname, roles, cmd, qual
  from pg_policies
 where schemaname = 'public' and tablename = 'parametros_credito'
 order by policyname;
```

**Esperado:** duas linhas:

- `todo corretor logado le os parametros de credito` (`{authenticated}`,
  `SELECT`, `true`);
- `o site publico le os parametros de credito` (`{anon}`, `SELECT`).

> **Pare aqui se** houver outra policy de `SELECT` para `authenticated` com
> `qual = true`. Anote o nome exato. Você vai apagá-la no passo 1, logo
> depois de aplicar a 0181 e **antes** da conferência 1a (o comando está lá).

### 0.7 Colunas de id sem chave estrangeira (a seção 8a da 0182)

A 0182 **falha de propósito** se encontrar uma coluna `uuid` terminada em
`_id`, sem FK, que ninguém decidiu se é linha-mãe. Em produção pode existir
coluna assim criada fora das migrations. Esta é a mesma conferência, rodada
antes:

```sql
select c.relname || '.' || a.attname as coluna
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
 where c.relnamespace = 'public'::regnamespace
   and c.relkind in ('r', 'p')
   and a.attnum > 0 and not a.attisdropped
   and a.atttypid = 'uuid'::regtype
   and a.attname like '%\_id' and a.attname <> 'grupo_id'
   and c.relname <> all (array['grupos', 'administradores_da_plataforma',
                               'whatsapp_disparo_lock', 'whatsapp_diagnosticos'])
   and not exists (
     select 1 from pg_constraint k
      where k.contype = 'f' and k.conrelid = c.oid and a.attnum = any (k.conkey))
   and (c.relname || '.' || a.attname) <> all (array['ia_interacoes.corretor_id',
                                                     'marketing_eventos.entidade_id',
                                                     'caixa_lancamentos.recorrencia_id'])
 order by 1;
```

**Esperado:** nenhuma linha.

> **Pare aqui se** vier alguma linha. Não aplique a 0182. Mande a lista para o
> Claude: cada coluna precisa de uma decisão escrita (FK ou exceção declarada),
> e isso é mudança de migration no repositório.

### 0.8 O que mais faria a 0182 ou a 0184 falhar

Três consultas. Rode uma de cada vez.

Tabelas com dono diferente de `postgres` (o `alter table` falharia):

```sql
select tablename, tableowner from pg_tables
 where schemaname = 'public' and tableowner <> 'postgres'
 order by 1;
```

Tabelas sem RLS (a 0184 recusa tabela com grupo e sem RLS):

```sql
select c.relname from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
   and not c.relrowsecurity
   and c.relname <> all (array['grupos', 'administradores_da_plataforma',
                               'whatsapp_disparo_lock', 'whatsapp_diagnosticos'])
 order by 1;
```

Chaves estrangeiras de mais de uma coluna (a 0182 não as trata):

```sql
select conrelid::regclass as tabela, conname, array_length(conkey, 1) as colunas
  from pg_constraint
 where contype = 'f' and connamespace = 'public'::regnamespace
   and array_length(conkey, 1) > 1;
```

**Esperado:** as três sem nenhuma linha.

> **Pare aqui se** alguma vier com linha. Não aplique nada e mande o resultado
> para o Claude.

### 0.9 Views do `public`

A 0184 recria seis views com `grupo_id` e, no fim, **falha se sobrar alguma
view sem `grupo_id`**. Uma view criada só em produção derruba a migration
inteira (sem estrago, porque desfaz tudo, mas é melhor saber antes).

```sql
select viewname from pg_views where schemaname = 'public' order by 1;
```

**Esperado:** exatamente estas seis:
`pessoas_do_corretor`, `sla_leads_metricas`, `whatsapp_esperando_resposta`,
`whatsapp_funil_metricas`, `whatsapp_primeira_resposta`,
`whatsapp_resposta_metricas`.

> **Pare aqui se** houver qualquer outra. Mande o nome e a definição (está na
> fotografia 0.2b) para o Claude.

### 0.10 Storage: quem pode criar policy em `storage.objects`

A 0184 troca as duas policies do Storage. A tabela `storage.objects` pertence
ao `supabase_storage_admin`, não ao `postgres`. As migrations 0015 e 0043 já
criaram policies lá, mas é melhor provar antes. Este teste cria uma policy e
desfaz na mesma hora:

```sql
begin;
create policy "teste_roteiro_fase_1" on storage.objects for select to authenticated using (false);
rollback;
```

**Esperado:** sucesso, sem linhas.

> **Pare aqui se** aparecer `must be owner of table objects`. A 0184 falharia
> no meio da seção 4 e desfaria tudo. Chame o Claude: a parte do Storage
> precisa ser aplicada de outro jeito.

Liste as policies do Storage:

```sql
select policyname, roles, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by 1;
```

**Esperado:** entre elas, `corretor gerencia midia de empreendimento` e
`corretor gerencia a propria pasta de midia`, as duas para `{authenticated}`.
Anote as **outras** que forem para `authenticated` ou `public`. Elas não
bloqueiam a fase 1 (com um grupo só não vazam nada), mas entram na lista da
fase 2.

### 0.11 O que a 0183 apaga pelo nome

A 0183 derruba restrições e um índice pelo nome **sem** `if exists`. Se em
produção algum tiver outro nome, ela falha (e desfaz tudo).

```sql
select
  (select count(*) from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in ('corretores_creci_key', 'lazer_itens_nome_key',
                      'marketing_campanhas_campaign_key_key',
                      'marketing_campanhas_provedor_conta_externa_id_external_id_key',
                      'marketing_eventos_event_id_key', 'meses_fechados_pkey',
                      'fiscal_config_pkey', 'empreendimentos_codigo_legado_key',
                      'lead_interacoes_tipo_check'))                        as restricoes,
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'whatsapp_mensagens_provider_id_uidx')               as indice,
  (select string_agg(oid::regprocedure::text, ' | ')
     from pg_proc where proname = 'sortear_corretor_whatsapp')             as sorteio,
  (select string_agg(proname, ', ' order by proname)
     from (select proname from pg_proc
            where pronamespace = 'public'::regnamespace
              and proname in ('sortear_corretor_whatsapp', 'reservar_credito_video',
                              'devolver_credito_video', 'reservar_horario_visita',
                              'definir_preferencia_contato', 'distribuir_lead',
                              'definir_papel_corretor', 'marcar_comissao_recebida',
                              'marcar_repasse_pago', 'ranking_vgv', 'taxas_da_equipe',
                              'reivindicar_clique_do_link', 'salvar_venda',
                              'garantir_gestor_remanescente', 'registrar_evento_lead_criado',
                              'vincular_campanha_meta_canonica')
            group by proname having count(*) > 1) d)                      as funcoes_repetidas;
```

**Esperado:** `restricoes = 9`, `indice = 1`,
`sorteio = sortear_corretor_whatsapp(uuid,uuid)` e `funcoes_repetidas` vazio
(nulo).

> **Pare aqui se** `restricoes` não for 9, `indice` não for 1, `sorteio`
> mostrar outra coisa (ou mais de uma assinatura), ou `funcoes_repetidas`
> listar algum nome (já aconteceu de uma função ganhar uma segunda versão
> criada direto no banco, em 26/09). Mande o resultado para o Claude.

### 0.12 As quatro policies do script consolidado antigo

O `supabase/migrations_pendentes.sql` (colado no editor em 08/2026) pode ter
criado quatro policies que as migrations não conhecem. Elas **não bloqueiam**:
a policy restritiva da 0184 se soma a elas por AND, então não abrem acesso
entre grupos. Mas é preciso saber se existem.

```sql
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and policyname in ('Corretores leem dossie de seus leads',
                      'Corretores atualizam dossie de seus leads',
                      'Corretores gerenciam fila de suas campanhas',
                      'Corretores criam mensagens em suas conversas')
 order by 1, 2;
```

**Esperado:** de zero a quatro linhas. Anote quais existem. Dentro do mesmo
grupo, as três com `papel = 'gestor'` deixam o gestor ler dossiê e fila de
campanha de outro corretor. Isso é decisão para depois, não para hoje.

### 0.13 Lead de teste da linha de base

Envie o formulário como na **C7**, com o nome `TESTE ROTEIRO 0`. É a
referência do que o formulário faz hoje. A consulta da C7 só funciona depois do
passo 2 (ela lê `grupo_id`); por enquanto use esta versão curta e confira que o
lead nasceu com `corretor` preenchido e `origem_atribuicao = roleta`:

```sql
select l.created_at, l.nome, c.nome as corretor, l.origem_atribuicao
  from public.leads l left join public.corretores c on c.id = l.corretor_id
 where l.nome ilike 'TESTE ROTEIRO%'
 order by l.created_at desc;
```

### 0.14 Um imóvel em rascunho para o teste de upload

Os passos 4c e 6.5 sobem uma foto de teste. Ela tem de ir para um imóvel em
**rascunho** (despublicado), nunca para um publicado: a galeria do publicado
é a vitrine do site, e a foto de teste apareceria para visitante (e para a
assistente, que manda foto do catálogo para cliente) até alguém removê-la.

```sql
select slug, nome, created_at
  from public.empreendimentos
 where publicado = false
 order by created_at desc;
```

**Esperado:** pelo menos uma linha. Anote o `slug` de um deles e use esse
imóvel nos dois testes de upload.

Se não houver nenhum, crie um no painel: Imóveis → **Criar imóvel**, com o
nome `TESTE ROTEIRO IMOVEL`. Imóvel novo nasce despublicado; **não** clique
em publicar. Ele é excluído no passo 8.

---

## Passo 1. Migration 0181 (`grupos`)

1. Rode a **C1**.
2. Cole `supabase/migrations/0181_grupos.sql` inteiro e rode.

**Esperado:** "Success. No rows returned" (avisos são normais).

3. **Só se no passo 0.6 havia uma policy extra** de `SELECT` para
   `authenticated` com `true`: apague-a agora, **antes** da conferência 1a,
   trocando o nome pelo anotado. A 0181 só apaga a policy pelo nome que ela
   tem nas migrations; a extra seguiria deixando todo logado ler as taxas de
   todos os grupos, e a 1a abaixo não bateria.
   ```sql
   drop policy "NOME_ANOTADO_NO_PASSO_0_6" on public.parametros_credito;
   ```
   Se no 0.6 havia só as duas policies esperadas, pule este item.

**Conferência 1a:**

```sql
select
  (select count(*) from public.grupos)                                        as grupos,
  (select nome from public.grupos
    where id = '00000000-0000-0000-0000-000000000001')                         as grupo_1,
  (select count(*) from public.corretores where grupo_id is null)             as corretores_sem_grupo,
  exists (select 1 from pg_trigger
           where tgrelid = 'public.corretores'::regclass
             and tgname = 'corretores_00_grupo')                              as gatilho,
  (select count(*) from public.parametros_credito
    where grupo_id = '00000000-0000-0000-0000-000000000001')                   as taxas_do_grupo_1,
  (select string_agg(policyname, ' | ' order by policyname)
     from pg_policies
    where schemaname = 'public' and tablename = 'parametros_credito')         as policies_das_taxas;
```

**Esperado:** `grupos = 1`, `grupo_1 = Next Home`, `corretores_sem_grupo = 0`,
`gatilho = true`, `taxas_do_grupo_1 = 1` e
`policies_das_taxas = logado le os parametros de credito do proprio grupo | o site publico le os parametros de credito`.

Se `policies_das_taxas` trouxer um terceiro nome, é a policy extra do 0.6 que
ficou: volte ao item 3 acima, apague-a e rode a 1a de novo.

**Conferência 1b:** rode a **C3b** para o gestor e para o corretor comum.

**Esperado:** `grupo = 00000000-0000-0000-0000-000000000001` e os números iguais
aos do passo 0.5.

**Conferência 1c:** abra o site (home, um imóvel, `/financiamento`) e o painel
(entrar como gestor, abrir Pessoas, Conversas e Administração → Crédito). Rode
a **C8**.

> **Pare aqui se** `corretores_sem_grupo` for maior que 0, o gatilho não
> existir, a C3b vier com `grupo` nulo para alguém ativo, ou o painel não
> abrir. Vá ao "Desfazer" do passo 1.

## Passo 2. Migration 0182 (`grupo_id` em toda tabela)

Esta é a mais pesada. Ela põe trava exclusiva (`ACCESS EXCLUSIVE`) em umas
70 tabelas e só solta no `commit;` final, ou seja, segura tudo durante a
migration inteira, que pode levar até um minuto. Nesse intervalo nenhuma
leitura nem escrita passa nessas tabelas, inclusive `whatsapp_mensagens` e
`whatsapp_conversas`. O webhook do WhatsApp tem teto de 60 segundos
(`maxDuration`): uma mensagem que chegar no meio da migration fica esperando
a trava e pode morrer por tempo **antes de ser gravada**. Isso não é
lentidão: é mensagem de cliente que pode se perder sem resposta. Por isso a
conferência 2e abaixo é obrigatória.

1. Rode a **C1**.
2. **Anote a hora exata** (com segundos) em que clicar em Run.
3. Cole `supabase/migrations/0182_grupo_em_todas_as_tabelas.sql` inteiro e rode.
   Pode levar de alguns segundos a um minuto.
4. **Anote a hora exata** em que o resultado aparecer. As duas horas são a
   janela da trava.

**Esperado:** sucesso. Se falhar por `lock timeout` ou `deadlock`, siga a
regra 4 (repetir). Se falhar com `coluna de id sem FK e sem decisão`,
`gatilho before que lê grupo_id` ou `FK de N colunas`, pare: é o que o
passo 0.7/0.8 deveria ter pegado; mande a mensagem para o Claude.

**Conferência 2a:**

```sql
select
  (select count(*) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and exists (select 1 from pg_attribute a
                   where a.attrelid = c.oid and a.attname = 'grupo_id'
                     and not a.attisdropped))                                as tabelas_com_grupo,
  (select string_agg(c.relname, ', ' order by c.relname) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'grupo_id'
                         and not a.attisdropped))                            as tabelas_sem_grupo,
  (select count(*) from pg_trigger
    where not tgisinternal and tgname like '%\_00\_grupo')                     as gatilhos_de_grupo,
  exists (select 1 from pg_roles where rolname = 'transferidor_de_grupo')    as role_transferidor;
```

**Esperado:**
`tabelas_sem_grupo = administradores_da_plataforma, grupos, whatsapp_diagnosticos, whatsapp_disparo_lock`,
`gatilhos_de_grupo` igual a `tabelas_com_grupo`, `role_transferidor = true`.

**Conferência 2b:** rode a **C5**. **Esperado:** `sem_grupo = 0` em todas,
inclusive `event_outbox`.

**Conferência 2c:** rode a **C2** (nada diminuiu), a **C3b** para o gestor e o
corretor comum (números iguais), a **C7** com `TESTE ROTEIRO 2` (um lead pelo
formulário gera evento e outbox no grupo 1), a **C6** (os cliques ganham
`grupo_id`) e a **C8**.

**Conferência 2d:** espere uns cinco minutos de tráfego e rode a **C4**.
**Esperado:** só `grupo_id inferido pelo grupo único`.

**Conferência 2e, mensagens que chegaram durante a trava.** Faça logo
depois da 2c (a C8 da 2c prova que o webhook voltou a funcionar; esta
procura quem escreveu enquanto ele estava parado).

1. **O que foi gravado e ficou sem resposta.** Troque as duas horas pelas
   anotadas nos itens 2 e 4 (formato `2026-10-20 06:15:30-03`):
   ```sql
   select c.id as conversa, c.telefone_cliente, c.nome_cliente,
          m.created_at, left(m.conteudo, 60) as mensagem
     from public.whatsapp_mensagens m
     join public.whatsapp_conversas c on c.id = m.conversa_id
    where m.remetente = 'cliente'
      and m.created_at between timestamptz 'HORA_DO_RUN' - interval '1 minute'
                           and timestamptz 'HORA_DO_RESULTADO' + interval '5 minutes'
      and not exists (select 1 from public.whatsapp_mensagens r
                       where r.conversa_id = m.conversa_id
                         and r.remetente in ('bot', 'corretor')
                         and r.created_at > m.created_at)
    order by m.created_at;
   ```
   **Esperado:** nenhuma linha. Cada linha é um cliente que escreveu na
   janela e ainda não ouviu nada (nem da IA, nem do corretor). A mensagem de
   teste da C8 não aparece aqui, porque a IA respondeu a ela.
2. **O que nem chegou a ser gravado.** Isso o banco não mostra: a mensagem
   morreu antes do insert. Vercel → projeto → **Logs**, filtre a rota
   `/api/webhooks/whatsapp` entre as duas horas anotadas (com um minuto de
   folga de cada lado) e procure requisição com status 5xx, `504` ou
   `FUNCTION_INVOCATION_TIMEOUT`. Ou peça a uma sessão do Claude com o
   conector da Vercel que rode `get_runtime_logs` nessa janela, nessa rota.
   Procure também, na mesma janela e na mesma rota:
   - **Linhas de `console.error`** (nível *error* no filtro de logs), em
     especial `Erro ao processar webhook do WhatsApp`, `[porteiro]` e
     `[supabase] … falhou`. Cada uma é uma leitura ou gravação que o banco
     recusou durante a trava.
   - **Respostas 200 que descartaram a mensagem.** O código ANTIGO, que está
     no ar durante as migrations, tem um defeito (corrigido no código da
     branch, ver MEMORIA de 19/10): quando a leitura da conversa falha, ele
     trata o erro como "número sem lead" e responde **200** com
     `ignored: "numero_sem_lead_cadastrado"`. O provedor não reentrega 200,
     e a mensagem some. O status 200 não distingue isso de uma mensagem
     normal, e esse corpo de resposta não aparece no log; o rastro que sobra
     é a contagem de barrados. Rode, com as mesmas duas horas:
     ```sql
     select corretor_id, count(*) as barrados_na_janela
       from public.porteiro_barrados
      where criado_em between timestamptz 'HORA_DO_RUN' - interval '1 minute'
                          and timestamptz 'HORA_DO_RESULTADO' + interval '5 minutes'
      group by corretor_id;
     ```
     Cada linha é o PRIMEIRO barrado do dia daquele número (a tabela guarda
     um por número por dia, sem o telefone). Barrado na janela não prova
     perda: pode ser alguém de fora da carteira de verdade. Mas, se o número
     for maior que o normal desse corretor, trate como perda e passe a hora
     a ele.

   **Esperado:** nenhuma requisição 5xx, nenhuma linha de erro, e nenhum
   barrado na janela (ou só o que o corretor reconhece como gente de fora).

**Se houver mensagem sem resposta:** não é motivo para desfazer a 0182 (o
webhook já voltou, a 2c provou). É atendimento atrasado, e quem resolve é o
corretor dono do número:

- Para as linhas da consulta do item 1: o corretor abre a conversa no Live
  Chat (painel → Conversas) ou no próprio celular e responde. Não conte com a
  IA retomando sozinha: ela só responde mensagem nova.
- Para as requisições perdidas do item 2: a mensagem existe só no WhatsApp
  do corretor. Passe a ele a hora de cada uma; ele procura no celular quem
  escreveu naquele minuto e responde de lá. Para essas pessoas a conversa no
  painel fica sem aquela fala, e isso é esperado.
- Anote na planilha quantas foram em cada item. Se passar de duas ou três,
  avise o Claude: é o sinal de que a 0183 e a 0184 (que também travam
  `whatsapp_mensagens`) precisam de horário ainda mais vazio.

O preview da branch `fase-1-multi-grupo` na Vercel, que estava vermelho, passa
a conseguir fazer build a partir daqui (é a 0182 que ele esperava).

> **Pare aqui se** alguma tabela tiver `sem_grupo` maior que 0, a C4 mostrar
> erro de grupo, o formulário falhar ou a IA não responder. Vá ao "Desfazer"
> do passo 2.

## Passo 3. Migration 0183 (chaves e funções por grupo)

A 0183 recria um índice único em `whatsapp_mensagens`, a tabela que o webhook
mais escreve. É a candidata número um a estourar o teto de 5 segundos. Se
isso acontecer, é só repetir (regra 4). Se falhar três vezes seguidas, **não
edite a migration**: chame o Claude para preparar uma variante em que o
índice é criado com `concurrently` antes, para o repositório e a produção
continuarem iguais.

1. Rode a **C1**.
2. Cole `supabase/migrations/0183_funcoes_respeitam_grupo.sql` inteiro e rode.
   Anote a hora do Run e a do resultado, como no passo 2: ela também trava
   `whatsapp_mensagens` até o fim, e depois da 3e você repete a conferência
   2e com essas duas horas.

**Conferência 3a:**

```sql
select
  (select count(*) from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in ('corretores_grupo_creci_key', 'lazer_itens_grupo_nome_key',
                      'marketing_campanhas_grupo_campaign_key_key',
                      'marketing_campanhas_grupo_provedor_conta_externa_key',
                      'marketing_eventos_grupo_event_id_key',
                      'empreendimentos_grupo_codigo_legado_key'))              as chaves_novas,
  pg_get_indexdef('public.whatsapp_mensagens_provider_id_uidx'::regclass)      as indice_mensagens,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'lead_interacoes_tipo_check')                             as tipos_de_interacao,
  (select string_agg(oid::regprocedure::text, ' | ' order by oid::regprocedure::text)
     from pg_proc where proname = 'sortear_corretor_whatsapp')                as sorteios,
  has_function_privilege('authenticated', 'public.reservar_credito_video(uuid)', 'execute')
                                                                              as logado_reserva_video,
  has_function_privilege('authenticated', 'public.devolver_credito_video(uuid, text)', 'execute')
                                                                              as logado_devolve_video,
  has_function_privilege('authenticated', 'public.reservar_horario_visita(uuid, timestamptz)', 'execute')
                                                                              as logado_reserva_visita,
  has_function_privilege('service_role', 'public.reservar_credito_video(uuid)', 'execute')
                                                                              as servico_reserva_video,
  has_function_privilege('anon', 'public.sortear_corretor_whatsapp(uuid, uuid, uuid)', 'execute')
                                                                              as anon_sorteia;
```

**Esperado:**

| coluna | valor |
|---|---|
| `chaves_novas` | 6 |
| `indice_mensagens` | contém `(grupo_id, provider_message_id)` |
| `tipos_de_interacao` | contém `'repasse'` |
| `sorteios` | `sortear_corretor_whatsapp(uuid,uuid) \| sortear_corretor_whatsapp(uuid,uuid,uuid)` |
| `logado_reserva_video` | **false** |
| `logado_devolve_video` | false |
| `logado_reserva_visita` | false |
| `servico_reserva_video` | true |
| `anon_sorteia` | false |

As três funções que perderam o `authenticated` só são chamadas pela chave de
serviço (vídeo e agenda da IA), conferido no código. Se o Criar vídeo ou a
marcação de visita pela IA quebrarem depois disso, o "Desfazer" do passo 3
devolve o grant.

**Conferência 3b, a janela do clique pago.** Agora o código antigo chama a
assinatura antiga do sorteio, que a 0183 fez delegar ao grupo 1. Rode a
**C6**. **Esperado:** as duas linhas `302 https://wa.me/55...`, como no
passo 0. Esta é a única hora em que a assinatura antiga é exercitada: ela some
na 0185.

**Conferência 3c:** rode a **C7** com `TESTE ROTEIRO 3`. A roleta agora escolhe
só no grupo do lead. **Esperado:** igual ao passo 2 (corretor preenchido,
`roleta`, evento e outbox).

**Conferência 3d, as funções novas de "criar acesso".** Elas só são chamadas
pelo código novo, mas já dá para provar que respondem. Troque o `user_id` do
**gestor** e o slug de um corretor que existe:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"COLE_O_USER_ID_DO_GESTOR","role":"authenticated"}';
select current_user                                                         as papel,
       public.email_de_acesso_livre('roteiro-fase-1@exemplo.invalid')       as email_novo_livre,
       public.slug_de_corretor_livre('COLE_UM_SLUG_QUE_EXISTE')             as slug_existente_livre,
       public.slug_de_corretor_livre('roteiro-fase-1-nao-existe')           as slug_novo_livre,
       public.slug_de_imovel_livre('roteiro-fase-1-nao-existe')             as slug_de_imovel_livre;
```

**Esperado:** `papel = authenticated`, `email_novo_livre = true`,
`slug_existente_livre = false`, `slug_novo_livre = true`,
`slug_de_imovel_livre = true`.

**Conferência 3e:** **C8** e **C4**.

> **Pare aqui se** a C6 cair em `/contato`, a C7 falhar, a 3a não bater ou a
> C4 mostrar erro de grupo. Vá ao "Desfazer" do passo 3.

## Passo 4. Migration 0184 (isolamento)

A 0184 também trava as tabelas do WhatsApp. Ela faz `CREATE POLICY` em
**toda** tabela com `grupo_id`, dentro do mesmo `begin; … commit;`, e criar
policy pede trava exclusiva na tabela até o `commit`. Isso inclui
`whatsapp_mensagens` e `whatsapp_conversas`: enquanto a 0184 roda, o webhook
espera, como no passo 2.

1. Rode a **C1**.
2. **Anote a hora exata** (com segundos) em que clicar em Run.
3. Cole `supabase/migrations/0184_isolamento_por_grupo.sql` inteiro e rode.
4. **Anote a hora exata** em que o resultado aparecer. Depois da 4d, repita
   a **conferência 2e** inteira (os dois itens) com essas duas horas.

**Esperado:** sucesso. Se falhar com `view do public sem grupo_id` ou
`tabela com grupo_id sem RLS`, pare (o passo 0.8/0.9 deveria ter pegado; nada
foi aplicado).

**Conferência 4a:**

```sql
select
  (select count(*) from pg_policies
    where schemaname = 'public' and policyname = 'isolamento_por_grupo'
      and permissive = 'RESTRICTIVE')                                         as restritivas,
  (select count(*) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and exists (select 1 from pg_attribute a
                   where a.attrelid = c.oid and a.attname = 'grupo_id'
                     and not a.attisdropped))                                as tabelas_com_grupo,
  (select count(*) from pg_views v
    where v.schemaname = 'public'
      and exists (select 1 from information_schema.columns k
                   where k.table_schema = 'public' and k.table_name = v.viewname
                     and k.column_name = 'grupo_id'))                         as views_com_grupo,
  (select count(*) from pg_views where schemaname = 'public')                 as views,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('corretor gerencia midia de empreendimento',
                         'corretor gerencia a propria pasta de midia')
      and qual like '%grupo_atual%')                                          as storage_com_grupo,
  has_function_privilege('anon', 'public.definir_preferencia_contato(uuid, text, boolean)', 'execute')
                                                                              as anon_preferencia;
```

**Esperado:** `restritivas` igual a `tabelas_com_grupo`, `views_com_grupo = 6`,
`views = 6`, `storage_com_grupo = 2`, `anon_preferencia = false`.

**Conferência 4b, ninguém perdeu nada.** Rode a **C3b** para o gestor e para o
corretor comum. **Esperado:** os mesmos números do passo 0.5 (a não ser pelos
leads de teste e pelo que entrou de verdade). Abra Administração → Visão geral
e compare com o print do passo 0.2e.

**Conferência 4c, no painel, como corretor comum:**

- Pessoas e Funil mostram a mesma carteira de antes.
- **Upload de foto:** Imóveis → abra o imóvel **em rascunho** anotado no
  passo 0.14 (confira que a tela mostra o selo "Rascunho"; **nunca** use um
  imóvel publicado, senão a foto de teste vai para a vitrine do site) →
  envie uma foto pequena qualquer. Ela tem de aparecer na galeria. Depois
  remova a foto.
- **Live Chat em tempo real:** deixe Conversas aberto e rode a **C8**. A
  mensagem do celular tem de aparecer **sem recarregar a página**.

**Conferência 4d:** **C6**, **C4** e **Advisors** (rerun). Compare com o print
do passo 0.2c. Se aparecer um aviso sobre `derivar_grupo_da_linha` ser
executável por todos, ele é de propósito: a função recusa rodar fora do
gatilho, e o gatilho roda com o papel de quem escreve, inclusive o formulário
público. Anote-o e siga.

> **Pare aqui se** os números do gestor ou do corretor mudaram sem explicação,
> o upload falhou, o Live Chat não atualizou sozinho, ou os Advisors trouxeram
> qualquer outra coisa nova. Vá ao "Desfazer" do passo 4.

---

## Passo 5. Deploy do código da branch

Até aqui o código antigo está no ar, funcionando com as quatro migrations.
Agora sobe o código novo. Pela regra do projeto (MEMORIA, seção Vercel), deploy
de verdade vai para **as duas** branches: `claude/modernizar-plataforma-imobiliaria-2tm13q`
(a de produção) e `main`.

### 5.1 Desligar os workflows que rodariam sozinhos contra produção

Cinco workflows do GitHub Actions disparam por **push** na branch de produção
quando certos scripts mudam. Este deploy muda os cinco scripts (eles ganharam
o parâmetro `--grupo`), então o push dispararia os cinco **contra produção**.
Um deles, "Publicar a fila de cadastro" (`scripts/catalogo/operacao0129.ts`,
lista em `scripts/catalogo/operacao-0129.json`), faz duas coisas que não se
desfazem com um clique: **apaga** cada slug da lista `apagar` que estiver
despublicado, junto com os arquivos dele no Storage (hoje a lista tem **1**
slug, `serenne-barueri-2`), e **republica** os 15 rascunhos da lista
`publicar`, o que pode pôr no ar imóvel que alguém despublicou de propósito.

No GitHub → **Actions**, abra cada um destes e clique em **⋯ → Disable
workflow**:

1. Fotos maiores do catálogo (0137)
2. Fotos da fila de cadastro
3. Publicar a fila de cadastro
4. Variantes responsivas das imagens
5. Vídeos da fila de cadastro

> **Pare aqui se** algum não estiver desabilitado. Não faça o push.

### 5.2 Conferir o que está no ar e a branch

No terminal, no repositório:

```bash
git fetch origin
git checkout fase-1-multi-grupo
git pull --ff-only origin fase-1-multi-grupo
git status
git merge-base --is-ancestor origin/claude/modernizar-plataforma-imobiliaria-2tm13q HEAD && echo OK-PRODUCAO
git merge-base --is-ancestor origin/main HEAD && echo OK-MAIN
git merge-base --is-ancestor COLE_O_COMMIT_DO_API_VERSAO HEAD && echo OK-NO-AR
git rev-parse --short=12 HEAD
```

`COLE_O_COMMIT_DO_API_VERSAO` é o valor de `/api/versao` (passo 0.1), por
exemplo `c2b89f04b2b4`. Anote o último número: é o commit que vai subir.

**Esperado:** `git status` sem arquivo rastreado modificado (arquivos soltos que
não são do repositório não importam), e as três linhas `OK-PRODUCAO`,
`OK-MAIN`, `OK-NO-AR`.

> **Pare aqui se** faltar qualquer um dos três `OK`. Faltar `OK-PRODUCAO` ou
> `OK-MAIN` quer dizer que entrou código novo na produção depois de
> 17/10; faltar `OK-NO-AR` quer dizer que alguém promoveu um commit de outra
> branch pelo painel (já aconteceu três vezes). Nos dois casos o push
> apagaria trabalho de outra pessoa. Chame o Claude: é preciso juntar as
> branches, rodar os testes e conferir a numeração das migrations antes.

### 5.3 A esteira da branch verde

No GitHub → **Actions → CI**, o último run da branch `fase-1-multi-grupo` para
esse commit tem de estar verde (os jobs de verificação e de isolamento). Se
ainda não rodou para ele, empurre a branch e espere:

```bash
git push origin fase-1-multi-grupo
```

Depois do passo 2, o **preview** dessa branch na Vercel passa a fazer build. Se
quiser, abra-o no navegador (logado na Vercel) e navegue um pouco: ele roda o
código novo contra o banco de produção, então é uma prévia real. Não use o
preview para gravar nada que você não gravaria em produção.

> **Pare aqui se** a CI estiver vermelha ou o preview não fizer build.

### 5.4 O push que é o deploy

```bash
git push origin fase-1-multi-grupo:claude/modernizar-plataforma-imobiliaria-2tm13q
git push origin fase-1-multi-grupo:main
```

**Esperado:** os dois pushes aceitos como avanço simples (fast-forward).

> **Pare aqui se** algum for recusado (`rejected`, `non-fast-forward`). Nunca
> use `--force`. Chame o Claude.

### 5.5 Esperar o deploy de produção

Vercel → **Deployments**, filtro **Production**. Em poucos minutos tem de
aparecer um deployment do commit anotado no 5.2, primeiro **Building**, depois
**Ready**.

Depois:

```powershell
curl.exe -s https://www.nexthomeimoveis.com/api/versao
```

**Esperado:** `{"versao":"<o commit anotado no 5.2>"}`.

> **Pare aqui se** o deployment ficar em **Error**: a produção antiga continua
> no ar, sem prejuízo. Abra o log do build e chame o Claude. **Não aplique a
> 0185.**
>
> **Pare aqui se** depois de cinco minutos não houver deployment nenhum para o
> commit: o push não chegou à Vercel. Confira em GitHub → commit → status
> (MEMORIA, seção Vercel) e, se for o caso, use **Redeploy** no painel.
>
> **Pare aqui se** `/api/versao` continuar mostrando o commit antigo depois do
> deployment **Ready**.

### 5.6 Religar os workflows

Volte em cada um dos cinco do 5.1 e clique em **Enable workflow**. Religar não
roda o que foi pulado. Confira na lista de runs do Actions que nenhum dos cinco
rodou com o push.

> **Pare aqui se** algum deles tiver rodado. Abra o run, veja o que ele fez e
> chame o Claude (principalmente se for "Publicar a fila de cadastro").

---

## Passo 6. Conferências com o código novo

Faça logo depois do 5.5.

1. **C6.** Agora `/wa` e `/wa/<slug>` chamam a assinatura nova, com o grupo.
   **Esperado:** `302 https://wa.me/55...` nas duas.
2. **C7** com `TESTE ROTEIRO 6`. Agora o formulário grava pelo servidor
   (`/api/leads`). **Esperado:** igual aos passos anteriores.
3. **C8**, com o Live Chat aberto: a mensagem chega sozinha, a IA responde.
4. **C3b** para o gestor e o corretor comum: os mesmos números.
   Administração → Visão geral igual ao print do passo 0.2e.
5. **Upload de foto** de novo (como no 4c), agora com o código novo, no
   **mesmo imóvel em rascunho** do passo 0.14, nunca num publicado. Depois
   remova a foto.
6. **Repasse de lead (opcional):** como gestor, repasse o lead `TESTE ROTEIRO 6`
   para outro corretor pela ficha. **Esperado:** "atribuído" sem erro, e:
   ```sql
   select tipo, detalhes, created_at
     from public.lead_interacoes
    where lead_id = (select id from public.leads
                      where nome ilike 'TESTE ROTEIRO 6%'
                      order by created_at desc limit 1)
    order by created_at desc
    limit 3;
   ```
   com uma linha `tipo = repasse`.
7. **Erros no servidor:** Vercel → projeto → **Logs**, filtre por erro nos
   últimos 30 minutos. Ou peça a uma sessão do Claude com o conector da Vercel
   que rode `get_runtime_errors`. **Esperado:** nada novo ligado a grupo,
   sorteio ou `grupo_id`.
8. **C4.** **Esperado:** só `grupo_id inferido`, em menor quantidade que antes.
9. **E2E do site público:** GitHub → Actions → **E2E** → **Run workflow**. O
   job `site-publico` tem de ficar verde. O job `ambiente-de-testes` fica
   vermelho enquanto o ambiente de testes não existir: isso é esperado.

> **Pare aqui se** qualquer item falhar. A saída rápida é o **rollback
> instantâneo da Vercel** (Deployments → o deployment de produção anterior →
> **Instant Rollback**): o código antigo funciona com as quatro migrations,
> então voltar é seguro **até a 0185**. Depois do rollback, as branches
> continuam apontando para o código novo, e o próximo push sobe ele de novo:
> avise o Claude antes de qualquer push.

---

## Passo 7. Migration 0185 (24 a 48 horas depois)

A 0185 apaga a assinatura antiga do sorteio e tira da chave pública a escrita
direta em `leads` e `cliques_whatsapp`. Só aplique quando:

- o código novo está no ar há pelo menos um dia, sem reclamação;
- o E2E do site público das 06h17 rodou verde;
- você **não** pretende mais voltar o código pelo rollback da Vercel.

### 7.1 Conferir que o código novo continua no ar

```powershell
curl.exe -s https://www.nexthomeimoveis.com/api/versao
```

**Esperado:** o commit do passo 5 (ou um posterior que contenha a fase 1).

> **Pare aqui se** for o commit antigo (`c2b89f04b2b4`): houve rollback. Não
> aplique a 0185, porque ela derrubaria o clique pago e o formulário do código
> antigo.

### 7.2 Policies de escrita em `leads` e `cliques_whatsapp`

A 0185 apaga as policies de insert pelo nome. Pode haver outra criada fora das
migrations.

```sql
select tablename, policyname, roles, cmd, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('leads', 'cliques_whatsapp')
   and cmd in ('INSERT', 'ALL')
 order by 1, 2;
```

**Esperado:** em `leads`, `qualquer um pode enviar um lead` (`{public}`,
`INSERT`, `true`); em `cliques_whatsapp`,
`Qualquer visitante pode registrar clique de WhatsApp`. Nas duas aparece
também `isolamento_por_grupo` (`ALL`, a restritiva da 0184), e pode haver
policies de `ALL` do corretor: essas ficam. Anote qualquer **outra** de
`INSERT` para `anon` ou `public`. Ela deixa de funcionar com a 0185 de qualquer
jeito (o grant some), mas apague-a depois com
`drop policy "<nome>" on public.<tabela>;` para o banco não guardar uma porta
que parece aberta.

Privilégios antes:

```sql
select has_table_privilege('anon', 'public.leads', 'INSERT')                         as anon_grava_lead,
       has_table_privilege('anon', 'public.cliques_whatsapp', 'INSERT')              as anon_grava_clique,
       has_column_privilege('anon', 'public.cliques_whatsapp', 'origem', 'INSERT')   as anon_grava_origem;
```

**Esperado agora:** `true` nas três (é o que a 0185 vai tirar).

### 7.3 Aplicar

1. Rode a **C1**.
2. Cole `supabase/migrations/0185_pos_deploy_multi_grupo.sql` inteiro e rode.

**Conferência 7a:**

```sql
select
  (select string_agg(oid::regprocedure::text, ' | ')
     from pg_proc where proname = 'sortear_corretor_whatsapp')                as sorteios,
  has_table_privilege('anon', 'public.leads', 'INSERT')                       as anon_grava_lead,
  has_table_privilege('anon', 'public.cliques_whatsapp', 'INSERT')            as anon_grava_clique,
  has_column_privilege('anon', 'public.cliques_whatsapp', 'origem', 'INSERT') as anon_grava_origem,
  (select string_agg(policyname || ' (' || array_to_string(roles, ',') || ')', ' | ' order by policyname)
     from pg_policies
    where schemaname = 'public' and tablename in ('leads', 'cliques_whatsapp')
      and cmd = 'INSERT')                                                     as policies_de_insert;
```

**Esperado:** `sorteios = sortear_corretor_whatsapp(uuid,uuid,uuid)` (uma só),
`false` nos três privilégios, e `policies_de_insert = logado cadastra lead (authenticated)`.

**Conferência 7b:** **C6** (`wa.me` nas duas), **C7** com `TESTE ROTEIRO 7` (o
formulário continua funcionando, agora sem a chave pública), **C8**, e uma
importação ou indicação de lead pelo painel, se houver uma para fazer (o
corretor continua cadastrando pela sessão).

**Conferência 7c:** **Advisors** (rerun). **Esperado:** nada novo em relação ao
passo 4d.

> **Pare aqui se** a C6 cair em `/contato` ou o formulário falhar. Vá ao
> "Desfazer" do passo 7. A partir daqui, o rollback instantâneo da Vercel para
> o código de antes da fase 1 **não é mais seguro**.

---

## Passo 8. Fechamento

1. **Excluir os leads de teste:** no painel, como ADM, Pessoas (ou Leads) →
   busque `TESTE ROTEIRO` → selecione → **Excluir**. Os cliques de teste ficam
   (estão marcados com `user_agent = roteiro-fase-1` e `de=site`, e não entram
   em conta de anúncio). Se você criou `TESTE ROTEIRO IMOVEL` no passo 0.14,
   exclua-o também (Imóveis → o imóvel → **Excluir**; só funciona porque ele
   está em rascunho). Confira que a galeria dele estava vazia antes.
2. **Fotografia depois:** rode de novo o `scripts/banco/inventario.sql` e
   guarde como `inventario-producao-depois.csv`.
3. **Avise o Claude** com a planilha preenchida. Ficam com ele: atualizar
   `docs/MEMORIA.md` e o vault (o que custou tempo na fase e as surpresas da
   produção) e comparar o inventário de produção com o banco local (o passo 4
   da Task 1, em `supabase/REPRODUCAO.md`).
4. **Antes de qualquer grupo além da Next Home existir em produção (fase 2):**
   a suíte de isolamento e o E2E do ambiente de testes verdes no mesmo
   commit. O ambiente de testes ainda não existe (passo 4 da Task 10, seu).

---

## Desfazer

Regra geral: **policies, gatilhos e funções caem com `drop`** (ou voltam com a
definição da fotografia do passo 0.2b). **Colunas ficam**: `grupo_id`,
`grupos` e as chaves novas não atrapalham o código antigo, e apagá-las perde
dado. Desfaça na ordem inversa (7, 6, 4, 3, 2, 1) e só o passo que falhou.

Na maioria dos problemas depois da 0183, o certo **não** é desfazer a migration
inteira: é devolver a função ou policy específica que quebrou, colando a
definição dela da fotografia.

### Passo 1 (0181)

- **Alguém perdeu o painel** (corretor desativado com login): reative pelo
  painel, em Contas, ou:
  ```sql
  update public.corretores set ativo = true where id = 'ID_DO_CORRETOR';
  ```
- **As funções de sessão** (`corretor_atual`, `eh_gestor`): cole as
  definições delas da fotografia (0.2b) e rode. Elas voltam a ignorar se o
  corretor está ativo.
- **As taxas de crédito sumiram do painel:**
  ```sql
  drop policy if exists "logado le os parametros de credito do proprio grupo" on public.parametros_credito;
  create policy "todo corretor logado le os parametros de credito"
    on public.parametros_credito for select to authenticated using (true);
  ```
- Não apague `grupos` nem `corretores.grupo_id`. A coluna `id` antiga de
  `parametros_credito` saiu na 0181 e não volta com um `drop`; o código antigo
  não a lê.

### Passo 2 (0182)

**Só antes da 0183.** O motivo: a 0183 e a 0184 foram escritas contando com
estes gatilhos. A roleta (`distribuir_lead`) roda depois de `leads_00_grupo`
e escolhe o corretor pelo `new.grupo_id` que ele preencheu e conferiu;
`salvar_venda` conta com o carimbo para recusar participante de outro grupo;
os gatilhos de evento do lead e da campanha da Meta, reescritos na 0183,
gravam com `on conflict` nas chaves novas que incluem `grupo_id`; e a 0184 usa
o passo "logado só grava no próprio grupo" do gatilho como segunda defesa
atrás da policy restritiva. Tirar **todos** os gatilhos depois disso não volta
ao estado de antes da 0182: deixa as funções novas apoiadas num default fixo,
sem ninguém conferindo grupo em escrita nenhuma. Depois da 0183, use o
"gatilho de uma tabela só", logo abaixo.

Tira os gatilhos e põe um default no grupo 1, para o código antigo continuar
gravando nas colunas `not null`:

```sql
begin;
set local lock_timeout = '5s';
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format('drop trigger if exists %I on public.%I', t.relname || '_00_grupo', t.relname);
    execute format('drop trigger if exists %I on public.%I', t.relname || '_zz_grupo_insert', t.relname);
    execute format('drop trigger if exists %I on public.%I', t.relname || '_zz_grupo_update', t.relname);
    execute format('alter table public.%I alter column grupo_id set default %L',
                   t.relname, '00000000-0000-0000-0000-000000000001');
  end loop;
end
$$;
commit;
```

Os gatilhos internos que a 0182 reescreveu (evento do lead, campanha da Meta)
passam o grupo da linha e funcionam com o default. Se `lock timeout`, repita.

#### Depois da 0183/0184: o gatilho de uma tabela só

O sintoma: uma escrita legítima (salvar algo no painel, o webhook gravar
mensagem, o formulário criar lead) passa a falhar, e o erro (na tela, na C4
ou no log da Vercel) é um destes, todos do gatilho de grupo:
`grupo da linha difere do grupo de ...`, `grupo_id obrigatório em ...`,
`linha-mãe inexistente em ...`, `grupo_id de ... não muda` ou
`grupo_id de ... foi alterado depois do carimbo`. A mensagem traz o nome da
tabela.

1. Anote a mensagem inteira e a tabela, e avise o Claude **antes** de mexer:
   quase sempre o certo é corrigir a função ou o código que grava, não o
   gatilho.
2. Se a escrita quebrada é atendimento de cliente (mensagem, lead) e não dá
   para esperar, desligue o gatilho **só daquela tabela**. Troque `TABELA`
   pelo nome que a mensagem trouxe (sem `public.`):
   ```sql
   begin;
   set local lock_timeout = '5s';
   do $$
   declare
     v_tabela text := 'TABELA';
     v_gatilho text;
   begin
     execute format('alter table public.%I alter column grupo_id set default %L',
                    v_tabela, '00000000-0000-0000-0000-000000000001');
     for v_gatilho in
       select tgname from pg_trigger
        where tgrelid = format('public.%I', v_tabela)::regclass
          and tgname in (v_tabela || '_00_grupo',
                         v_tabela || '_zz_grupo_insert',
                         v_tabela || '_zz_grupo_update')
     loop
       execute format('alter table public.%I disable trigger %I', v_tabela, v_gatilho);
     end loop;
   end
   $$;
   commit;
   ```
   O default no grupo 1 é o que deixa o insert sem `grupo_id` passar pelo
   `not null` com o gatilho desligado. Os gatilhos ficam no banco, só
   desligados (não use `drop`).
3. **O que isso reabre, só nessa tabela:** ninguém mais confere que a linha
   está no mesmo grupo da linha-mãe (o lead e a conversa dele, a mensagem e
   a conversa), ninguém recusa troca de `grupo_id` fora da transferência de
   grupo, e o passo "logado só grava no próprio grupo" deixa de existir ali.
   A policy restritiva da 0184 continua valendo para quem usa a sessão, mas a
   chave de serviço e as funções `security definer` (o webhook, os crons)
   escrevem sem conferência nenhuma. Com um grupo só, toda linha vai para o
   grupo 1 e o estrago imediato é zero. **Com um segundo grupo, é vazamento**:
   religar antes de qualquer grupo além da Next Home existir é obrigatório
   (junto com o item 4 do passo 8).
4. **Religar**, depois de o Claude corrigir a causa:
   ```sql
   begin;
   set local lock_timeout = '5s';
   do $$
   declare
     v_tabela text := 'TABELA';
     v_gatilho text;
   begin
     for v_gatilho in
       select tgname from pg_trigger
        where tgrelid = format('public.%I', v_tabela)::regclass
          and tgname in (v_tabela || '_00_grupo',
                         v_tabela || '_zz_grupo_insert',
                         v_tabela || '_zz_grupo_update')
     loop
       execute format('alter table public.%I enable trigger %I', v_tabela, v_gatilho);
     end loop;
     execute format('alter table public.%I alter column grupo_id drop default', v_tabela);
   end
   $$;
   commit;
   ```
   e rode a **C5**. Com um grupo só, o default pôs no grupo 1 tudo o que
   foi gravado enquanto o gatilho esteve desligado, então a C5 tem de dar
   `sem_grupo = 0`; anote na planilha por quanto tempo ele ficou desligado.

### Passo 3 (0183)

- **O `/wa` caiu em `/contato` com o código antigo:** cole a definição de
  `sortear_corretor_whatsapp(uuid,uuid)` da fotografia (a de antes da 0183) e
  rode. Ela volta a sortear como antes, e os grants ficam.
- **O Criar vídeo ou a marcação de visita pela IA quebraram:**
  ```sql
  grant execute on function public.reservar_credito_video(uuid) to authenticated;
  grant execute on function public.devolver_credito_video(uuid, text) to authenticated;
  grant execute on function public.reservar_horario_visita(uuid, timestamptz) to authenticated;
  ```
  e avise o Claude: o código deveria chamá-las só pela chave de serviço.
- **Outra função** (roleta, ranking, venda...): cole a definição da fotografia.
- **As chaves únicas ficam** como estão: valem para o código antigo e, depois
  da primeira linha `repasse`, o check antigo de `lead_interacoes` não volta.

### Passo 4 (0184)

Tira a policy restritiva de todas as tabelas (só enquanto houver um grupo só):

```sql
begin;
set local lock_timeout = '5s';
do $$
declare t record;
begin
  for t in select tablename from pg_policies
            where schemaname = 'public' and policyname = 'isolamento_por_grupo'
  loop
    execute format('drop policy isolamento_por_grupo on public.%I', t.tablename);
  end loop;
end
$$;
commit;
```

**Upload de foto quebrado:** apague as duas policies novas do Storage e recrie
as antigas com o `using` e o `check` da fotografia (linhas
`storage.objects :: corretor gerencia ...`):

```sql
drop policy "corretor gerencia midia de empreendimento" on storage.objects;
create policy "corretor gerencia midia de empreendimento" on storage.objects
  for all to authenticated
  using (COLE_O_USING_DA_FOTOGRAFIA)
  with check (COLE_O_CHECK_DA_FOTOGRAFIA);
```

(e o mesmo para `corretor gerencia a propria pasta de midia`). As views ficam:
a coluna `grupo_id` no fim não atrapalha ninguém.

### Passo 5 e 6 (deploy)

**Instant Rollback** na Vercel para o deployment de produção anterior. Vale até
a 0185. Depois, avise o Claude antes de qualquer push nas branches de produção.

### Passo 7 (0185)

Só enquanto houver um grupo só, e só se o código antigo tiver de voltar:

```sql
begin;
set local lock_timeout = '5s';
grant insert on public.leads to anon;
grant insert (corretor_id, empreendimento_id, origem, url_origem, user_agent)
  on public.cliques_whatsapp to anon;
create policy "qualquer um pode enviar um lead" on public.leads
  for insert with check (true);
create policy "Qualquer visitante pode registrar clique de WhatsApp" on public.cliques_whatsapp
  for insert to anon, authenticated with check (true);
commit;
```

E a assinatura antiga do sorteio: cole a função de dois argumentos da seção 11
de `supabase/migrations/0183_funcoes_respeitam_grupo.sql` (o `create or
replace function public.sortear_corretor_whatsapp(p_empreendimento uuid
default null, preferido uuid default null)` e os quatro `revoke`/`grant` dela).

---

## Planilha de anotações

| Item | Passo 0 | Depois da 0181 | 0182 | 0183 | 0184 | Deploy | 0185 |
|---|---|---|---|---|---|---|---|
| `/api/versao` | | | | | | | |
| C2 leads | | | | | | | |
| C2 conversas | | | | | | | |
| C2 imóveis | | | | | | | |
| C2 corretores | | | | | | | |
| C2 mensagens / mídias / `medido_em` | | | | | | | |
| C2 queda explicada por exclusão (quanto, quem) | | | | | | | |
| C3 gestor: leads / conversas / imóveis | | | | | | | |
| C3 corretor: leads / conversas / imóveis | | | | | | | |
| C6 `/wa/<slug>` | | | | | | | |
| C6 `/wa` | | | | | | | |
| C7 lead de teste ok | | | | | | | |
| C8 IA respondeu | | | | | | | |
| C4 só "inferido" | | | | | | | |
| Advisors sem novidade | | | | | | | |
| Janela da trava (Run → resultado) | | | | | | | |
| 2e mensagens sem resposta / perdidas no log | | | | | | | |
| Hora | | | | | | | |

Anote também, do passo 0: corretores desativados com login (0.4), policy
extra das taxas (0.6), policies extras do Storage (0.10), quais das quatro
policies antigas existem (0.12) e o slug do imóvel em rascunho do teste de
upload (0.14). Se algum gatilho de grupo for desligado (Desfazer, passo 2),
anote a tabela e a hora em que desligou e religou.
