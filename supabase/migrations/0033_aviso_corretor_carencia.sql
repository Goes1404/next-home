-- Carência entre avisos de evolução da conversa.
--
-- O corretor estava recebendo mensagem a cada resposta da IA. Duas causas:
-- `sugerirVisita` (que o prompt novo liga quase sempre) contava como
-- "evento novo", e qualquer variação do dossiê reextraído disparava um
-- aviso — mesmo quando era só o modelo oscilando, sem o cliente ter dito
-- nada novo.
--
-- `alerta_quente_em` já existe e guarda a janela de 6h do alerta de lead
-- quente. Esta coluna é outra coisa: o último aviso de EVOLUÇÃO, com
-- carência própria (ver CARENCIA_AVISO_MINUTOS em evolucaoConversa.ts).
-- Separadas porque um alerta urgente não pode ser silenciado pela carência
-- do aviso comum, nem vice-versa.
alter table public.whatsapp_conversas
  add column if not exists ultimo_aviso_evolucao_em timestamptz;

comment on column public.whatsapp_conversas.ultimo_aviso_evolucao_em is
  'Quando o corretor recebeu o último aviso de evolução desta conversa. Base da carência; notícia urgente (visita confirmada, virou quente) fura.';
