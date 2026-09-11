-- 0111 — Sem lead cadastrado, não existe conversa no CRM (11/09/2026).
--
-- A regra anterior criava automaticamente um lead para qualquer pessoa que
-- falasse com o WhatsApp do corretor. Isso fazia conversas pessoais virarem
-- contatos comerciais. Agora o webhook consulta `leads.telefone_e164` antes
-- de transcrever ou persistir qualquer mensagem.
--
-- ## Por que esta migration NÃO começa apagando
--
-- A primeira versão deletava toda conversa com `lead_id is null`. Medido em
-- produção antes de aplicar: eram 37 conversas, e **30 delas tinham lead do
-- mesmo corretor** — o vínculo é que estava nulo, porque o telefone da
-- conversa foi gravado SEM O DDI (`11981480402`) ao lado do mesmo celular
-- com DDI no lead (`5511981480402`). É a armadilha do envio (27/08), agora
-- do lado da conversa: o disparador passava `item.telefone` cru.
--
-- Pior: em 24 desses casos JÁ EXISTE a conversa canônica (com DDI, com
-- lead), e o disparo criou uma conversa FANTASMA em paralelo — 34 mensagens
-- de campanha que o Live Chat nunca mostrou junto do resto do atendimento.
-- Apagar seria perder o registro do disparo E o histórico de 30 clientes
-- cadastrados, em nome de uma regra que existe para não guardar conversa de
-- DESCONHECIDO.
--
-- A ordem aqui é: fundir a fantasma na canônica, vincular o que dá para
-- vincular, normalizar o telefone, e só então apagar o que sobrou — que é o
-- que a regra sempre quis dizer.

-- Espelha `normalizar_telefone_br`/`normalizarTelefoneBr`: o mesmo palpite
-- dos dois lados, para não existir uma terceira régua de telefone.
create or replace function public.e164_migracao_0111(bruto text)
returns text language sql immutable as $$
  select case
    when regexp_replace(coalesce(bruto,''),'\D','','g') like '55%'
     and length(regexp_replace(coalesce(bruto,''),'\D','','g')) in (12,13)
      then regexp_replace(bruto,'\D','','g')
    when length(regexp_replace(coalesce(bruto,''),'\D','','g')) in (10,11)
      then '55'||regexp_replace(bruto,'\D','','g')
    when length(regexp_replace(coalesce(bruto,''),'\D','','g')) in (8,9)
      then '5511'||regexp_replace(bruto,'\D','','g')
    else regexp_replace(coalesce(bruto,''),'\D','','g')
  end
$$;

-- 1) Funde a conversa fantasma (sem DDI, sem lead) na canonica do mesmo
--    corretor e telefone. Mensagens, follow-ups e telemetria sao REAPONTADOS
--    antes do delete -- o cascade os levaria junto. Sem tabela temporaria de
--    proposito: `apply_migration` nao garante transacao unica, e uma temp
--    table `on commit drop` desapareceria no meio do caminho.
-- `viewsSeguras.test.ts` cobra revoke + security_invoker de TODA view do
-- schema public, e tem razao: view de migration que fica de pe vira porta
-- aberta. Aqui o par (fantasma, canonica) é repetido em cada comando em vez
-- de virar objeto — verboso, e não deixa nada para trás.
update public.whatsapp_mensagens m
   set conversa_id = f.canonica
  from (
    select d.id as fantasma, c.id as canonica
      from public.whatsapp_conversas d
      join public.whatsapp_conversas c
        on c.corretor_id = d.corretor_id
       and c.telefone_cliente = public.e164_migracao_0111(d.telefone_cliente)
       and c.id <> d.id
     where d.lead_id is null
       and d.telefone_cliente <> public.e164_migracao_0111(d.telefone_cliente)
  ) f
 where m.conversa_id = f.fantasma;

update public.whatsapp_followups u
   set conversa_id = f.canonica
  from (
    select d.id as fantasma, c.id as canonica
      from public.whatsapp_conversas d
      join public.whatsapp_conversas c
        on c.corretor_id = d.corretor_id
       and c.telefone_cliente = public.e164_migracao_0111(d.telefone_cliente)
       and c.id <> d.id
     where d.lead_id is null
       and d.telefone_cliente <> public.e164_migracao_0111(d.telefone_cliente)
  ) f
 where u.conversa_id = f.fantasma;

update public.ia_interacoes i
   set conversa_id = f.canonica
  from (
    select d.id as fantasma, c.id as canonica
      from public.whatsapp_conversas d
      join public.whatsapp_conversas c
        on c.corretor_id = d.corretor_id
       and c.telefone_cliente = public.e164_migracao_0111(d.telefone_cliente)
       and c.id <> d.id
     where d.lead_id is null
       and d.telefone_cliente <> public.e164_migracao_0111(d.telefone_cliente)
  ) f
 where i.conversa_id = f.fantasma;

delete from public.whatsapp_conversas d
 where d.lead_id is null
   and d.telefone_cliente <> public.e164_migracao_0111(d.telefone_cliente)
   and exists (
     select 1 from public.whatsapp_conversas c
      where c.corretor_id = d.corretor_id
        and c.telefone_cliente = public.e164_migracao_0111(d.telefone_cliente)
        and c.id <> d.id
   );

-- 2) Religa quem tem lead do MESMO corretor, com as variantes do nono
--    dígito — a mesma régua de `candidatosTelefone`.
update public.whatsapp_conversas c
   set lead_id = l.id
  from public.leads l
 where c.lead_id is null
   and l.corretor_id = c.corretor_id
   and l.telefone_e164 in (
     public.e164_migracao_0111(c.telefone_cliente),
     case when length(public.e164_migracao_0111(c.telefone_cliente)) = 13
           and substr(public.e164_migracao_0111(c.telefone_cliente),5,1) = '9'
          then substr(public.e164_migracao_0111(c.telefone_cliente),1,4)
             ||substr(public.e164_migracao_0111(c.telefone_cliente),6) end,
     case when length(public.e164_migracao_0111(c.telefone_cliente)) = 12
          then substr(public.e164_migracao_0111(c.telefone_cliente),1,4)||'9'
             ||substr(public.e164_migracao_0111(c.telefone_cliente),5) end
   );

-- 3) Telefone da conversa passa a ser o normalizado, senão o código (que
--    agora busca por variantes e GRAVA o normalizado) criaria a fantasma de
--    novo no próximo disparo.
update public.whatsapp_conversas c
   set telefone_cliente = public.e164_migracao_0111(c.telefone_cliente)
 where c.telefone_cliente <> public.e164_migracao_0111(c.telefone_cliente)
   and not exists (
     select 1 from public.whatsapp_conversas o
      where o.corretor_id = c.corretor_id
        and o.telefone_cliente = public.e164_migracao_0111(c.telefone_cliente)
        and o.id <> c.id
   );

-- 4) O que sobrou sem lead é o que a regra sempre quis apagar: número que
--    não está na carteira de ninguém. A telemetria usa SET NULL mas carrega
--    contexto da conversa em jsonb; por isso sai explicitamente primeiro.
delete from public.ia_interacoes
 where conversa_id in (select id from public.whatsapp_conversas where lead_id is null);

delete from public.whatsapp_conversas where lead_id is null;

alter table public.whatsapp_conversas
  drop constraint if exists whatsapp_conversas_lead_id_fkey;

alter table public.whatsapp_conversas
  alter column lead_id set not null;

alter table public.whatsapp_conversas
  add constraint whatsapp_conversas_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete cascade;

comment on column public.whatsapp_conversas.lead_id is
  'Lead obrigatório da conversa. Sem lead cadastrado por telefone, o webhook não cria conversa; excluir o lead apaga conversa e mensagens em cascata (0111).';

drop function if exists public.e164_migracao_0111(text);
