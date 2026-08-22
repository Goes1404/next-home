-- Devolução de cota e reset manual (fase de teste).
--
-- 1) DEVOLVER: a cota é reservada ANTES do envio, para não haver corrida
--    entre o cron e o botão. Quando o destinatário simplesmente não tem
--    WhatsApp (`exists: false`), a mensagem não chegou a existir para
--    ninguém — e a cota gasta foi desperdício puro. Em produção isso
--    consumiu 15 disparos do dia para entregar 3 mensagens.
--
--    Mora no banco, e não no TypeScript, pelo mesmo motivo do consumo: o
--    disparador roda em várias pontas (cron do pg_cron, corrente da Vercel,
--    botão do painel) e um `select` seguido de `update` no app perderia
--    decrementos sob concorrência.

create or replace function public.devolver_cota_campanha(
  p_instancia_id uuid
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_total integer;
begin
  update corretor_whatsapp_instancias
     set envios_campanha_contador = greatest(envios_campanha_contador - 1, 0),
         updated_at = now()
   -- Só devolve dentro do MESMO dia: depois da virada, o contador já
   -- pertence a outra cota e decrementá-lo daria crédito indevido.
   where id = p_instancia_id
     and envios_campanha_data = current_date
  returning envios_campanha_contador into v_total;

  return coalesce(v_total, -1);
end;
$$;

comment on function public.devolver_cota_campanha is
  'Devolve 1 disparo à cota do dia quando o envio não chegou a acontecer (destinatário sem WhatsApp). Nunca desce abaixo de zero, e só age no dia corrente.';

-- 2) RESETAR: ferramenta de FASE DE TESTE, pedida para não esperar a virada
--    do dia a cada experimento.
--
--    ATENÇÃO: isto afrouxa a proteção anti-ban de propósito. A cota diária
--    existe porque volume alto num número novo é o caminho mais curto para
--    o WhatsApp bloquear a linha do corretor. `conectado_em` NÃO é tocado —
--    zerá-lo reiniciaria a curva de aquecimento e daria cota MENOR, não
--    maior, além de mentir sobre a idade do número.
--
--    Para remover depois da fase de teste: `drop function
--    public.resetar_cota_campanha`, apagar a server action `resetarCota` e
--    o botão em CampanhasManager.tsx.

create or replace function public.resetar_cota_campanha(
  p_instancia_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update corretor_whatsapp_instancias
     set envios_campanha_contador = 0,
         envios_campanha_data     = null,
         bloqueado_ate            = null,
         falhas_seguidas          = 0,
         updated_at               = now()
   where id = p_instancia_id;
end;
$$;

comment on function public.resetar_cota_campanha is
  'TEMPORÁRIO (fase de teste): zera cota do dia, bloqueio e disjuntor de uma instância. Não toca em conectado_em — a curva de aquecimento continua valendo.';
