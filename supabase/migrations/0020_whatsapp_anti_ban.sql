-- Migration 0020: contadores e trava anti-ban por instância de WhatsApp.
--
-- A política em si mora em src/lib/whatsapp/antiBan.ts (pura e testada).
-- Aqui ficam só os números que ela precisa consultar e que têm de
-- sobreviver a um restart: quando o número foi pareado (base da curva de
-- aquecimento), quantos disparos já saíram hoje e se o disjuntor está
-- aberto depois de falhas seguidas.

alter table public.corretor_whatsapp_instancias
  -- Marco zero do aquecimento. Fica nulo enquanto o número não parear.
  add column if not exists conectado_em timestamptz,
  -- Dia a que o contador se refere: virou a data, o contador zera.
  add column if not exists envios_campanha_data date,
  add column if not exists envios_campanha_contador integer not null default 0,
  add column if not exists falhas_seguidas integer not null default 0,
  -- Disjuntor: enquanto no futuro, nenhuma campanha sai deste número.
  add column if not exists bloqueado_ate timestamptz;

/**
 * Consome uma unidade da cota diária de campanha, de forma atômica.
 *
 * Precisa ser função no banco, e não leitura-seguida-de-escrita na
 * aplicação: dois disparos simultâneos leriam o mesmo contador e ambos se
 * achariam dentro do limite, furando a cota justamente no momento de maior
 * volume — que é quando ela importa.
 *
 * Devolve o novo total do dia, ou -1 quando a cota já estourou.
 */
create or replace function public.consumir_cota_campanha(
  p_instancia_id uuid,
  p_limite integer
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_total integer;
begin
  update corretor_whatsapp_instancias
     set envios_campanha_contador =
           case when envios_campanha_data = current_date
                then envios_campanha_contador + 1
                else 1 end,
         envios_campanha_data = current_date,
         updated_at = now()
   where id = p_instancia_id
     and (bloqueado_ate is null or bloqueado_ate <= now())
     and (
       envios_campanha_data is distinct from current_date
       or envios_campanha_contador < p_limite
     )
  returning envios_campanha_contador into v_total;

  if v_total is null then
    return -1;
  end if;

  return v_total;
end;
$$;

comment on function public.consumir_cota_campanha is
  'Incrementa a cota diária de campanha de uma instância sob concorrência; -1 quando a cota acabou ou o número está bloqueado.';
