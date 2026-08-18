-- Roleta parava de rodar de verdade porque só um corretor (de sete) tinha
-- conta de acesso criada: `c.user_id is not null`, herdado da 0007, excluía
-- os outros seis. Todo lead sem link pessoal caía sempre no único elegível.
--
-- Tira essa exigência: a roleta passa a distribuir entre qualquer corretor
-- ativo com `slug` (perfil publicável), tenha ou não login ainda. Quem não
-- tem conta não abre `/corretor/leads` — mas o gestor vê e reatribui pela
-- tela `/corretor/equipe` (RLS "le todos" não depende de login de ninguém
-- além do próprio gestor), e o link de WhatsApp de cada corretor já
-- funciona sem login nenhum (`corretorAtivo`, via slug). Login deixa de ser
-- pré-requisito pra entrar na escala; passa a ser só o que abre o painel.

create or replace function public.distribuir_lead() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  alvo uuid;
  cidade_lead text;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
   where c.ativo
     and not c.em_pausa
     and c.slug is not null
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc
   limit 1;

  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$$;
