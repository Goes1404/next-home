-- 0062 — O espaçamento anti-ban passa a valer no ENVIO, não só no papel
--
-- ## O defeito
--
-- Até aqui o intervalo de 35-75s entre disparos existia SÓ em
-- `whatsapp_campanhas_fila.agendado_para`, calculado na criação da campanha
-- por `montarFilaCampanha`. O disparador respeitava esse horário de um jeito
-- só pela metade: quando o item estava no FUTURO, ele esperava; quando o
-- item já estava VENCIDO, mandava na hora — e o próximo, e o próximo.
--
-- Ou seja: o espaçamento protegia apenas a fila que estava em dia. Bastava o
-- disparador ficar parado um tempo (número desconectado, fora da janela,
-- cota estourada, deploy, corrente que morreu) para toda a fila vencer ao
-- mesmo tempo. Quando ele voltava, mandava o atraso inteiro em rajada, que é
-- exatamente o padrão nº 3 da lista de causas de ban do `antiBan.ts`.
--
-- Medido em produção, campanha e59c871a de 27/08:
--
--   agendado    enviado     intervalo
--   13:49:25    14:18:06         —      (28 min de atraso)
--   13:50:26    14:18:08        2s
--   13:51:29    14:18:13        5s
--   13:52:33    14:18:17        4s
--   …
--   14:03:37    14:19:03        3s
--
-- Quinze mensagens agendadas ao longo de 14 minutos saíram em 57 SEGUNDOS.
-- O `agendado_para` estava perfeito; o envio ignorou todos eles. Em outra
-- campanha do mesmo dia, 14 dos 31 intervalos ficaram abaixo de 5 segundos.
--
-- O teto de 3 itens por chamada não segura isso: o auto-encadeamento chama a
-- si mesmo em seguida, e três chamadas seguidas são nove mensagens em poucos
-- segundos.
--
-- ## A correção
--
-- O espaçamento vira uma trava de tempo REAL, guardada na instância, e mora
-- aqui pelo mesmo motivo que a cota mora: pg_cron, corrente da Vercel e botão
-- do painel tocam a mesma fila, e ler-somar-gravar da aplicação perde a
-- corrida. Só o banco pode garantir que dois disparadores não passem juntos.
--
-- `proximo_envio_permitido_em` é carimbado pela PRÓPRIA função que concede a
-- vez, no mesmo UPDATE atômico que consome a cota. Quem chega antes da hora
-- não recebe permissão — não importa por qual caminho tenha chegado.
--
-- O sorteio do intervalo também mudou de lugar: era feito na criação da fila
-- e agora acontece a cada concessão. Cadência fixa (exatamente 35s) é tão
-- reconhecível quanto rajada; o sorteio a cada envio mantém o ritmo irregular
-- mesmo quando a fila inteira está atrasada.
--
-- `agendado_para` continua existindo e continua sendo respeitado: ele é o
-- PLANO (inclusive o adiamento para a janela comercial). O que esta migration
-- acrescenta é o PISO — nenhuma mensagem sai perto demais da anterior, ainda
-- que o plano tenha ficado para trás.

alter table public.corretor_whatsapp_instancias
  add column if not exists proximo_envio_permitido_em timestamptz;

comment on column public.corretor_whatsapp_instancias.proximo_envio_permitido_em is
  'Instante antes do qual nenhum disparo iniciado por nós pode sair deste número. Carimbado por consumir_cota_campanha_espacada a cada concessão, com intervalo sorteado.';

/**
 * Concede (ou nega) a vez de disparar por este número.
 *
 * Devolve jsonb para poder dizer POR QUE negou — a diferença entre "espere
 * 22 segundos" e "acabou a cota do dia" decide se o disparador aguarda ou
 * encerra. A função antiga `consumir_cota_campanha` devolvia só um inteiro e
 * não tinha como expressar isso.
 *
 * O UPDATE é a trava: as quatro condições do WHERE (bloqueio, cota, dia e
 * intervalo) são avaliadas sob o lock da linha, então dois disparadores
 * simultâneos nunca recebem a vez para o mesmo instante. O diagnóstico depois
 * é só leitura — se ele "errar" numa corrida, o pior caso é uma frase
 * imprecisa na tela, nunca uma mensagem a mais.
 */
create or replace function public.consumir_cota_campanha_espacada(
  p_instancia_id uuid,
  p_limite integer,
  p_intervalo_min integer default 35,
  p_intervalo_max integer default 75
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_total integer;
  v_intervalo integer;
  v_linha record;
  v_espera integer;
begin
  if p_intervalo_min < 0 or p_intervalo_max < p_intervalo_min then
    raise exception 'Intervalo inválido: min=% max=%', p_intervalo_min, p_intervalo_max;
  end if;

  -- Sorteado ANTES do update para entrar no mesmo comando: o próximo
  -- envio deste número já nasce com o instante dele definido.
  v_intervalo := p_intervalo_min + floor(random() * (p_intervalo_max - p_intervalo_min + 1))::integer;

  update public.corretor_whatsapp_instancias
     set envios_campanha_contador =
           case when envios_campanha_data = current_date
                then envios_campanha_contador + 1
                else 1 end,
         envios_campanha_data = current_date,
         proximo_envio_permitido_em = now() + make_interval(secs => v_intervalo),
         updated_at = now()
   where id = p_instancia_id
     and (bloqueado_ate is null or bloqueado_ate <= now())
     and (
       envios_campanha_data is distinct from current_date
       or envios_campanha_contador < p_limite
     )
     -- O PISO. Ausente = número que nunca disparou; passado = já cumpriu a
     -- espera. Só o futuro barra.
     and (proximo_envio_permitido_em is null or proximo_envio_permitido_em <= now())
  returning envios_campanha_contador into v_total;

  if v_total is not null then
    return jsonb_build_object(
      'ok', true,
      'total', v_total,
      'intervalo_segundos', v_intervalo
    );
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
$$;

revoke all on function public.consumir_cota_campanha_espacada(uuid, integer, integer, integer)
  from public, anon, authenticated;

/**
 * A fila de hoje não pode sair em rajada só porque ficou para trás.
 *
 * Reagenda os pendentes VENCIDOS a partir de agora, com o mesmo espaçamento,
 * para que o plano volte a bater com o piso. Sem isto o disparador ainda
 * ficaria correto (o piso segura), mas o painel seguiria mostrando dezenas de
 * itens "atrasados", que é a leitura errada da situação.
 *
 * Só mexe em 'pendente': 'enviado' e 'respondido' são histórico.
 */
with vencidos as (
  select f.id,
         row_number() over (
           partition by c.corretor_id
           order by f.agendado_para
         ) as posicao
    from public.whatsapp_campanhas_fila f
    join public.whatsapp_campanhas c on c.id = f.campanha_id
   where f.status = 'pendente'
     and f.agendado_para <= now()
)
update public.whatsapp_campanhas_fila f
   set agendado_para = now() + make_interval(secs => (vencidos.posicao - 1) * 55)
  from vencidos
 where f.id = vencidos.id;
