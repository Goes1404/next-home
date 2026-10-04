-- 0155: a lista de transmissão vira peça sólida do sistema (03/10/2026).
--
-- O roadmap das listas (Fases 0 a 4) pediu, no banco, cinco coisas:
--
-- 1. Lembrar O CRITÉRIO de quem recebe, e não só o resultado. Sem isso não
--    dá para repetir uma lista nem manter uma "lista viva", que inclui sozinha
--    quem passa a se encaixar.
-- 2. Liberar o horário comercial UMA VEZ, sem marcar a lista para sempre como
--    "enviar a qualquer hora" (`janela_liberada_ate`). O botão antigo gravava
--    `ignorar_janela = true` de forma permanente.
-- 3. Saber QUANDO o teste A/B decidiu (`vencedora_em`) e de qual modelo a
--    mensagem veio (`template_id`), para a biblioteca de modelos contar a
--    taxa de resposta de cada um.
-- 4. Fotos e planta junto da mensagem (`midias`), puxadas do cadastro do
--    imóvel, e as variáveis do imóvel já resolvidas (`contexto_template`),
--    para quem reescreve a fila depois (A/B, lista viva) usar o mesmo texto.
-- 5. Contar o dia da cota pelo relógio de SÃO PAULO. `current_date` é o dia
--    UTC, e a cota virava às 21h de Brasília: lista "a qualquer hora" ganhava
--    cota nova à noite.
--
-- Também apaga `resetar_cota_campanha`, o botão "Liberar envios de hoje" da
-- fase de teste, que zerava a proteção do número.
--
-- Pode ser aplicada antes do deploy: colunas novas têm padrão, e as funções
-- de cota mantêm a assinatura.

alter table public.whatsapp_campanhas
  add column if not exists criterio jsonb,
  add column if not exists viva boolean not null default false,
  add column if not exists viva_ate timestamptz,
  add column if not exists viva_varrida_em timestamptz,
  add column if not exists janela_liberada_ate timestamptz,
  add column if not exists vencedora_em timestamptz,
  add column if not exists midias jsonb not null default '[]'::jsonb,
  add column if not exists contexto_template jsonb,
  add column if not exists template_id uuid references public.templates_mensagens(id) on delete set null;

comment on column public.whatsapp_campanhas.criterio is
  'Quem recebe, como critério: {filtro, imovelSlug, recorte}. Permite repetir a lista e mantê-la viva.';
comment on column public.whatsapp_campanhas.viva_ate is
  'Lista viva: até esta data, quem passar a se encaixar no critério entra sozinho.';
comment on column public.whatsapp_campanhas.janela_liberada_ate is
  'Liberação do horário comercial por UMA vez. Depois disso a lista volta à janela segura.';
comment on column public.whatsapp_campanhas.midias is
  'Fotos e plantas do imóvel enviadas depois do texto: [{url, tipo, titulo}].';
comment on column public.whatsapp_campanhas.contexto_template is
  'Variáveis do imóvel e do corretor resolvidas na criação ({bairro}, {link}...).';

create index if not exists whatsapp_campanhas_template_id_idx
  on public.whatsapp_campanhas (template_id);
create index if not exists whatsapp_campanhas_viva_idx
  on public.whatsapp_campanhas (viva_ate) where viva;

-- ---------------------------------------------------------------- cota em SP
create or replace function public.consumir_cota_campanha_espacada(
  p_instancia_id uuid,
  p_limite integer,
  p_intervalo_min integer default 35,
  p_intervalo_max integer default 75
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
  v_intervalo integer;
  v_linha record;
  v_espera integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_intervalo_min < 0 or p_intervalo_max < p_intervalo_min then
    raise exception 'Intervalo invalido: min=% max=%', p_intervalo_min, p_intervalo_max;
  end if;

  v_intervalo := p_intervalo_min + floor(random() * (p_intervalo_max - p_intervalo_min + 1))::integer;

  update public.corretor_whatsapp_instancias
     set envios_campanha_contador =
           case when envios_campanha_data = v_hoje
                then envios_campanha_contador + 1
                else 1 end,
         envios_campanha_data = v_hoje,
         proximo_envio_permitido_em = now() + make_interval(secs => v_intervalo),
         updated_at = now()
   where id = p_instancia_id
     and (bloqueado_ate is null or bloqueado_ate <= now())
     and (
       envios_campanha_data is distinct from v_hoje
       or envios_campanha_contador < p_limite
     )
     and (proximo_envio_permitido_em is null or proximo_envio_permitido_em <= now())
  returning envios_campanha_contador into v_total;

  if v_total is not null then
    return jsonb_build_object('ok', true, 'total', v_total, 'intervalo_segundos', v_intervalo);
  end if;

  select bloqueado_ate, envios_campanha_contador, envios_campanha_data, proximo_envio_permitido_em
    into v_linha
    from public.corretor_whatsapp_instancias
   where id = p_instancia_id;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'instancia_inexistente', 'espera_segundos', 0);
  end if;

  if v_linha.bloqueado_ate is not null and v_linha.bloqueado_ate > now() then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'numero_bloqueado',
      'espera_segundos', ceil(extract(epoch from v_linha.bloqueado_ate - now()))::integer
    );
  end if;

  if v_linha.proximo_envio_permitido_em is not null
     and v_linha.proximo_envio_permitido_em > now() then
    v_espera := ceil(extract(epoch from v_linha.proximo_envio_permitido_em - now()))::integer;
    return jsonb_build_object(
      'ok', false,
      'motivo', 'aguardando_intervalo',
      'espera_segundos', greatest(v_espera, 1)
    );
  end if;

  return jsonb_build_object('ok', false, 'motivo', 'cota_diaria', 'espera_segundos', 0);
end;
$function$;

create or replace function public.devolver_cota_campanha(p_instancia_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
begin
  update corretor_whatsapp_instancias
     set envios_campanha_contador = greatest(envios_campanha_contador - 1, 0),
         updated_at = now()
   where id = p_instancia_id
     and envios_campanha_data = (now() at time zone 'America/Sao_Paulo')::date
  returning envios_campanha_contador into v_total;

  return coalesce(v_total, -1);
end;
$function$;

-- O botão de teste que zerava a proteção do número sai de vez. Primeiro
-- ninguém mais executa (o `authenticated` podia chamar com o id de QUALQUER
-- instância: ela é security definer). O `drop` o MCP recusa sozinho, então
-- ele roda no editor SQL (mesmo caso da 0150).
revoke all on function public.resetar_cota_campanha(uuid) from public, anon, authenticated;
drop function if exists public.resetar_cota_campanha(uuid);

-- --------------------------------------------------- reagendar numa tacada só
-- "Liberar envio agora" reagendava a fila com um UPDATE por item, e numa
-- lista grande isso estourava o tempo da função. Aqui é um comando só, com o
-- mesmo intervalo humanizado de 35-75s entre um item e o próximo, na ordem
-- em que estavam. Roda como quem chama (RLS vale): o corretor só reagenda o
-- que é dele.
create or replace function public.reagendar_fila_campanha(
  p_campanhas uuid[],
  p_intervalo_min integer default 35,
  p_intervalo_max integer default 75
)
returns integer
language sql
security invoker
set search_path to 'public'
as $function$
  with ordem as (
    select id,
           agendado_para,
           (p_intervalo_min + floor(random() * (p_intervalo_max - p_intervalo_min + 1)))::integer as passo
      from public.whatsapp_campanhas_fila
     where campanha_id = any (p_campanhas)
       and status = 'pendente'
  ),
  acumulado as (
    select id,
           now() + make_interval(secs => coalesce(
             sum(passo) over (order by agendado_para, id rows between unbounded preceding and 1 preceding),
             0
           )) as novo
      from ordem
  ),
  feito as (
    update public.whatsapp_campanhas_fila f
       set agendado_para = a.novo
      from acumulado a
     where f.id = a.id
    returning 1
  )
  select count(*)::integer from feito;
$function$;

revoke all on function public.reagendar_fila_campanha(uuid[], integer, integer) from public, anon;
grant execute on function public.reagendar_fila_campanha(uuid[], integer, integer) to authenticated, service_role;
