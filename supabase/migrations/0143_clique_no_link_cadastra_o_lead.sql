-- 0143: quem clicou no link do anúncio é cadastrado, seja qual for a mensagem
-- (02/10/2026).
--
-- O porteiro (0111) só cadastrava número novo quando a primeira fala era a
-- mensagem pronta do link. Quem apagava o texto e escrevia "oi" morria sem
-- cadastro. O link /wa/ já registra cada clique com o corretor sorteado; a
-- mensagem que chega a ESSE corretor poucos minutos depois, de número sem
-- lead, é de quem clicou.
--
-- Travas, porque a instância é o WhatsApp pessoal do corretor:
--   - só clique gravado PELO LINK (`pelo_porteiro`), que só o servidor marca:
--     o `anon` deixa de poder escrever essa coluna (insert por coluna);
--   - sem robô (o robô da Meta abre o link para montar a prévia);
--   - janela curta, e cada clique cadastra UMA pessoa. Os outros cliques do
--     mesmo aparelho (mesmo navegador, até 3 min de distância) são consumidos junto, para um clique repetido
--     não abrir a porta para um contato pessoal que escreva logo depois.

alter table public.cliques_whatsapp
  add column if not exists pelo_porteiro boolean not null default false,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists consumido_em timestamptz;

comment on column public.cliques_whatsapp.pelo_porteiro is
  'Clique gravado pelo link /wa/ no servidor. Só esses cadastram lead por clique (0143).';
comment on column public.cliques_whatsapp.consumido_em is
  'Quando o clique foi usado para cadastrar (ou reconhecer) quem escreveu (0143).';

-- O anon continua gravando o clique do site, mas sem as colunas novas.
revoke insert on public.cliques_whatsapp from anon;
grant insert (corretor_id, empreendimento_id, origem, url_origem, user_agent)
  on public.cliques_whatsapp to anon;

create index if not exists cliques_whatsapp_reivindicaveis_idx
  on public.cliques_whatsapp (corretor_id, created_at desc)
  where pelo_porteiro and consumido_em is null;

-- Pega o clique mais recente (com preferência ao do imóvel, quando dito) do
-- corretor, feito por pessoa, nos últimos `p_janela_min` minutos, e o marca
-- como usado. Devolve o imóvel e a origem do clique; nada quando não há.
create or replace function public.reivindicar_clique_do_link(
  p_corretor uuid,
  p_janela_min integer default 15,
  p_empreendimento uuid default null
)
returns table (clique_id uuid, empreendimento_id uuid, origem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo public.cliques_whatsapp%rowtype;
begin
  select c.* into alvo
  from public.cliques_whatsapp c
  where c.corretor_id = p_corretor
    and c.pelo_porteiro
    and c.consumido_em is null
    and c.created_at > now() - make_interval(mins => greatest(1, least(p_janela_min, 60)))
    and c.user_agent is not null
    and c.user_agent !~* '(facebookexternalhit|facebot|meta-external|bot|crawl|spider|preview)'
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
$$;

revoke all on function public.reivindicar_clique_do_link(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.reivindicar_clique_do_link(uuid, integer, uuid) to service_role;
