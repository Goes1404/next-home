-- 0174 — A queda do número protege a lista, a sessão caída sai do rodízio
-- e o clique de robô deixa de contar (10/10/2026).
--
-- POR QUE: o relatório da primeira semana em produção (03 a 09/10) achou
-- três coisas no mesmo lugar:
--
-- 1. O número da Bruna foi restringido pelo WhatsApp por envio em massa em
--    07/10, mandou mais 50 mensagens de lista no dia seguinte e caiu 1 minuto
--    depois da última. A lista dela segue "em andamento" com 113 na fila: ao
--    reconectar, voltaria a sair no ritmo da semana anterior (até 75 por dia).
--    Daqui em diante, número que fica fora do ar por 30 minutos pausa as
--    listas dele, e o aquecimento recomeça do piso (`aquecimento_desde`).
--    As quedas que já existiam NÃO pausam lista nenhuma, por decisão do dono
--    da conta ("não pause as listas", 10/10): só o aquecimento recomeça.
--
-- 2. A Márcia aparece "conectada" desde 07/10, mas a sessão caiu (todo envio
--    volta "Connection Closed") e a plataforma não recebe nada do número
--    dela. O rodízio do anúncio e dos botões do site continuou mandando
--    cliques para ela: 42 em dois dias. `sessao_caida_em` tira o número do
--    sorteio até ele reconectar, receber mensagem ou enviar de novo.
--
-- 3. 71% dos cliques nos botões do site eram robôs declarados, e outro robô,
--    com navegador de computador comum, pediu os 4 botões de cada um dos 39
--    imóveis (39 cliques em cada intenção, nenhum lead). `de_pessoa` guarda,
--    no clique, se ele veio de um toque de pessoa (ver `medicaoDoLink.ts`).
--
-- O motivo da queda (`motivo_queda_codigo`) é o código que o WhatsApp manda
-- quando derruba a conexão (401 = aparelho desconectado da conta, 403 =
-- conexão recusada...). Até aqui ele chegava no webhook e era descartado.
--
-- Aplicar ANTES do deploy: o código novo lê estas colunas, e o antigo não as
-- conhece (todas nascem nulas e nada do código antigo quebra).

begin;

alter table public.corretor_whatsapp_instancias
  add column if not exists motivo_queda_codigo integer,
  add column if not exists motivo_queda_em timestamptz,
  add column if not exists sessao_caida_em timestamptz,
  add column if not exists queda_tratada_em timestamptz,
  add column if not exists aquecimento_desde timestamptz;

comment on column public.corretor_whatsapp_instancias.motivo_queda_codigo is
  'Código que o WhatsApp mandou na última queda (statusReason do connection.update, ou disconnectionReasonCode da Evolution). Nulo = não informado. Ver motivoDaQueda.ts.';
comment on column public.corretor_whatsapp_instancias.motivo_queda_em is
  'Quando o motivo da queda atual foi registrado ou consultado. Menor que desconectado_em = a queda atual ainda não foi consultada.';
comment on column public.corretor_whatsapp_instancias.sessao_caida_em is
  'O envio voltou "Connection Closed" com o número ainda "conectado" (0174). Enquanto preenchida, o número fica fora do rodízio do link. Sai ao reconectar, ao receber mensagem ou ao enviar com sucesso.';
comment on column public.corretor_whatsapp_instancias.queda_tratada_em is
  'Quando a proteção da queda (pausar listas, recomeçar o aquecimento) rodou. Menor que desconectado_em = queda nova, ainda não tratada.';
comment on column public.corretor_whatsapp_instancias.aquecimento_desde is
  'Marco da última queda tratada: o limite diário só conta envios dos dias seguintes a ela (limiteDoDia, 0174).';

alter table public.cliques_whatsapp
  add column if not exists de_pessoa boolean;

comment on column public.cliques_whatsapp.de_pessoa is
  'O clique veio de um toque de pessoa (0174). No botão do site exige a navegação partindo de uma página do site; no anúncio, navegador que não se declara robô. Nulo = clique registrado sem a classificação (ver medicaoDoLink.ts).';

-- O passado: só dava para saber o navegador. É a mesma regra que a tela usava.
update public.cliques_whatsapp
   set de_pessoa = (user_agent is not null
                    and user_agent !~* '(facebookexternalhit|facebot|meta-external|bot|crawl|spider|preview)')
 where de_pessoa is null;

-- A queda do Ramos ficou com a data da PRIMEIRA (08/10 17h37): a reconexão
-- pelo webhook não apagava o marco, e a segunda queda (09/10, depois das
-- 12h53) não foi carimbada. Corrige para a última mensagem que saiu do
-- número, que é o limite de baixo da queda real.
update public.corretor_whatsapp_instancias i
   set desconectado_em = s.ultima_saida
  from (
    select w.corretor_id, max(m.created_at) as ultima_saida
      from public.whatsapp_mensagens m
      join public.whatsapp_conversas w on w.id = m.conversa_id
     where m.remetente in ('bot', 'corretor')
     group by w.corretor_id
  ) s
 where s.corretor_id = i.corretor_id
   and i.status_conexao <> 'conectado'
   and i.desconectado_em is not null
   and s.ultima_saida > i.desconectado_em;

-- Quedas que já existiam: o aquecimento recomeça do piso quando voltarem,
-- mas nenhuma lista é pausada (decisão do dono da conta, 10/10/2026).
update public.corretor_whatsapp_instancias
   set queda_tratada_em = now(),
       aquecimento_desde = coalesce(desconectado_em, now())
 where status_conexao <> 'conectado'
   and conectado_em is not null;

-- Sessão que já estava caída (a fila dela tem a marca): sai do rodízio.
update public.corretor_whatsapp_instancias i
   set sessao_caida_em = now()
 where i.sessao_caida_em is null
   and exists (
     select 1
       from public.whatsapp_campanhas_fila f
       join public.whatsapp_campanhas c on c.id = f.campanha_id
      where c.corretor_id = i.corretor_id
        and f.status = 'pendente'
        and f.erro_motivo = 'A conexão do WhatsApp caiu antes de enviar. A mensagem sai quando o número reconectar.'
   );

-- O clique gasto pela mensagem pronta passa a ser só o de pessoa: um robô
-- que abriu o link no mesmo minuto não leva a atribuição.
create or replace function public.reivindicar_clique_do_link(
  p_corretor uuid,
  p_janela_min integer default 15,
  p_empreendimento uuid default null
)
returns table (clique_id uuid, empreendimento_id uuid, origem text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  alvo public.cliques_whatsapp%rowtype;
begin
  select c.* into alvo
  from public.cliques_whatsapp c
  where c.corretor_id = p_corretor
    and c.pelo_porteiro
    and c.consumido_em is null
    and c.created_at > now() - make_interval(mins => greatest(1, least(p_janela_min, 60)))
    and coalesce(
          c.de_pessoa,
          c.user_agent is not null
            and c.user_agent !~* '(facebookexternalhit|facebot|meta-external|bot|crawl|spider|preview)'
        )
  order by (p_empreendimento is not null and c.empreendimento_id = p_empreendimento) desc,
           c.created_at desc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.cliques_whatsapp c
     set consumido_em = now()
   where c.corretor_id = p_corretor
     and c.pelo_porteiro
     and c.consumido_em is null
     and c.created_at > now() - make_interval(mins => greatest(1, least(p_janela_min, 60)))
     and (c.id = alvo.id
          or (c.user_agent = alvo.user_agent
              and c.created_at between alvo.created_at - interval '3 minutes'
                                   and alvo.created_at + interval '3 minutes'));

  clique_id := alvo.id;
  empreendimento_id := alvo.empreendimento_id;
  origem := alvo.origem;
  return next;
end;
$function$;

revoke all on function public.reivindicar_clique_do_link(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.reivindicar_clique_do_link(uuid, integer, uuid) to service_role;

-- O sorteio fica por ÚLTIMO neste arquivo: sorteioDoPorteiro.test.ts lê do
-- `create or replace` dele até o fim do arquivo.
--
-- Duas mudanças sobre a 0130: número com a sessão caída não entra, e o
-- rodízio por imóvel olha só o último clique de PESSOA (o robô da Meta abre
-- o link do anúncio o tempo todo e mexia na vez de quem recebe).
create or replace function public.sortear_corretor_whatsapp(
  p_empreendimento uuid default null,
  preferido uuid default null
)
returns table(corretor_id uuid, telefone text)
language sql
security definer
set search_path to 'public'
as $function$
  with ultimo as (
    select k.corretor_id
      from cliques_whatsapp k
     where p_empreendimento is not null
       and k.empreendimento_id = p_empreendimento
       and k.corretor_id is not null
       and k.origem like 'anuncio/%'
       and coalesce(k.de_pessoa, true)
     order by k.created_at desc
     limit 1
  )
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.ativo
     and not c.em_pausa
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
     and i.sessao_caida_em is null
   order by
     -- Link pessoal: escolha de quem trouxe o visitante.
     (c.id is distinct from preferido) asc,
     -- Rodízio: quem recebeu o último clique deste imóvel vai para o fim.
     (c.id in (select u.corretor_id from ultimo u)) asc,
     random()
   limit 1
$function$;

revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid, uuid) to service_role;

commit;

-- Reversão: reaplicar sortear_corretor_whatsapp da 0130 e
-- reivindicar_clique_do_link da 0143; as colunas novas podem ficar (nulas
-- não mudam nada no código antigo).
