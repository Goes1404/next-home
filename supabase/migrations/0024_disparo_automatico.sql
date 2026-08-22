-- 0024 — Disparo automático de campanhas
--
-- Três coisas impediam a fila de andar sozinha, e as três moram aqui:
--
--   1. `conectado_em` nunca era escrito por ninguém. Como
--      `reservarCotaCampanha` usa essa coluna para calcular a curva de
--      aquecimento, todo disparo era recusado com "número ainda não foi
--      pareado" — a fila ficava 100% pendente para sempre, sem erro
--      visível em lugar nenhum. A correção do lado do código é escrever a
--      coluna (webhook `connection.update` + sincronização ativa com o
--      provedor); aqui só damos o índice que a sincronização usa.
--
--   2. A personalização por IA rodava toda na criação da campanha: uma
--      chamada ao Gemini por lead, em série, dentro de uma server action.
--      Com algumas dezenas de leads isso estoura o tempo da função antes
--      de gravar a fila. Agora a fila nasce com o texto base já
--      interpolado e a variação por IA acontece no momento do envio, um
--      item por vez — daí a coluna `personalizado_por_ia`, que registra se
--      a proteção anti-ban de variação de texto de fato aconteceu naquele
--      item (nunca presumir que sim).
--
--   3. Nada impedia dois disparadores de rodarem sobre a mesma instância
--      ao mesmo tempo (cron + botão manual + auto-encadeamento). Duas
--      mensagens no mesmo segundo, para o mesmo número, é exatamente o
--      padrão de rajada que a fila existe para evitar. Daí a trava.

alter table public.whatsapp_campanhas_fila
  add column if not exists personalizado_por_ia boolean not null default false,
  -- Quantas vezes já tentamos enviar este item. Um item que falha por erro
  -- do provedor volta para 'pendente' e é retentado; sem contador, um
  -- número inválido ficaria em loop eterno consumindo cota.
  add column if not exists tentativas integer not null default 0;

comment on column public.whatsapp_campanhas_fila.personalizado_por_ia is
  'true = o texto enviado passou pela variação por IA. false = saiu igual ao template, sem a proteção anti-ban de variação.';

-- O disparador varre a fila por instância, sempre na ordem do horário
-- agendado. Sem este índice a varredura é sequencial na tabela inteira.
create index if not exists idx_whatsapp_fila_pendentes
  on public.whatsapp_campanhas_fila(campanha_id, agendado_para)
  where status = 'pendente';

-- ---------------------------------------------------------------------------
-- Trava de disparo
-- ---------------------------------------------------------------------------
-- Escopo é por INSTÂNCIA, não global: o que precisa ser serializado é o uso
-- de um número de WhatsApp específico. Serializar globalmente faria a fila
-- de um corretor esperar a de outro sem nenhum ganho de segurança.
create table if not exists public.whatsapp_disparo_lock (
  escopo text primary key,
  dono text not null,
  travado_ate timestamptz not null,
  atualizado_em timestamptz not null default now()
);

comment on table public.whatsapp_disparo_lock is
  'Trava de curta duração por instância de WhatsApp, para que cron, botão manual e auto-encadeamento nunca despachem a mesma fila em paralelo.';

alter table public.whatsapp_disparo_lock enable row level security;
-- Sem policy nenhuma: só o cliente de serviço (que ignora RLS) mexe aqui.
-- A trava não é dado de corretor e não tem por que aparecer para o navegador.

/**
 * Tenta tomar (ou renovar) a trava do escopo.
 *
 * Devolve true quando o chamador é o dono. O `where` da atualização é o
 * coração disto: só toma a trava quem chega com ela vencida, ou quem já
 * era dono (renovação no meio de um lote longo). Fazer isso em uma única
 * instrução é o que torna a operação segura sob concorrência — dois
 * disparadores chegando no mesmo milissegundo, um leva.
 */
create or replace function public.travar_disparo(
  p_escopo text,
  p_dono text,
  p_segundos integer
) returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into whatsapp_disparo_lock (escopo, dono, travado_ate)
  values (p_escopo, p_dono, now() + make_interval(secs => p_segundos))
  on conflict (escopo) do update
     set dono = excluded.dono,
         travado_ate = excluded.travado_ate,
         atualizado_em = now()
   where whatsapp_disparo_lock.travado_ate <= now()
      or whatsapp_disparo_lock.dono = excluded.dono
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

comment on function public.travar_disparo is
  'Toma ou renova a trava de disparo de um escopo; false quando outro disparador já a detém e ela ainda não venceu.';

/**
 * Devolve a trava antes da hora.
 *
 * Só o dono destrava — um disparador que estourou o tempo e voltou tarde
 * não pode derrubar a trava de quem assumiu depois dele.
 */
create or replace function public.destravar_disparo(
  p_escopo text,
  p_dono text
) returns void
  language sql
  security definer
  set search_path = public
as $$
  update whatsapp_disparo_lock
     set travado_ate = now(), atualizado_em = now()
   where escopo = p_escopo and dono = p_dono;
$$;

revoke all on function public.travar_disparo(text, text, integer) from public, anon, authenticated;
revoke all on function public.destravar_disparo(text, text) from public, anon, authenticated;
