-- Onde a sonda do provedor de WhatsApp guarda a resposta CRUA.
--
-- Tabela própria, e não `admin_eventos`: aquela é o log de AÇÕES DE
-- ADMINISTRAÇÃO, com vocabulário fechado por CHECK (conta_criada,
-- papel_alterado, …). Uma sonda técnica não é ação de administrador, e
-- tentar encaixá-la ali foi o que fez o primeiro diagnóstico ser recusado
-- em silêncio — o insert violava o CHECK e o código não conferia o erro.
--
-- TEMPORÁRIA: existe para o caso de 27/08/2026 (provedor confirma envio e
-- não entrega) e sai junto com `lib/whatsapp/sonda.ts`.
create table if not exists public.whatsapp_diagnosticos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  instance_name text not null,
  destino text,
  -- A resposta como veio, sem interpretação. Foi justamente o descarte do
  -- corpo da resposta que manteve o defeito invisível por semanas.
  passos jsonb not null default '[]'::jsonb
);

alter table public.whatsapp_diagnosticos enable row level security;

-- Sem policy nenhuma: só o cliente de serviço escreve e lê. Diagnóstico
-- carrega resposta crua do provedor, que pode conter identificadores de
-- sessão — não é coisa para ficar exposta ao painel.
comment on table public.whatsapp_diagnosticos is
  'Sonda de diagnóstico do provedor de WhatsApp (temporária, 27/08/2026). Resposta crua, só cliente de serviço.';
