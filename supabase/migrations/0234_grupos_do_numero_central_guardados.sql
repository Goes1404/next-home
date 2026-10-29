-- 0234 · a lista de grupos do número central guardada no banco (29/10/2026)
--
-- A aba Roleta lia a lista de grupos do WhatsApp do número central na
-- Evolution a cada abertura. Com o número em 255 grupos, a Evolution (2.3.7,
-- busca a foto de cada grupo) leva ~40 s, e a tela desistia nos 15 s: a lista
-- sumia. A memória do processo (60 s) não sobrevive entre as instâncias da
-- Vercel.
--
-- Agora a última lista lida com sucesso fica no grupo: a tela mostra a
-- guardada na hora e, se ela tiver mais de 10 min, pede uma nova depois de
-- responder (`after`). "Sincronizar grupos" sempre lê de novo e guarda.
--
-- Só aditivo. As colunas NÃO entram no `grant select (...)` do logado (0196):
-- só a chave de serviço lê e escreve. Aplicar ANTES do deploy.
--
-- Reversão:
--   alter table public.grupos drop column if exists grupos_whatsapp_do_central,
--     drop column if exists grupos_whatsapp_instancia,
--     drop column if exists grupos_whatsapp_lidos_em;

begin;
set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists grupos_whatsapp_do_central jsonb,
  add column if not exists grupos_whatsapp_instancia text,
  add column if not exists grupos_whatsapp_lidos_em timestamptz;

comment on column public.grupos.grupos_whatsapp_do_central is
  'Última lista de grupos do WhatsApp lida do número central ([{jid, nome}]), para a aba Roleta não esperar a Evolution (0234).';
comment on column public.grupos.grupos_whatsapp_instancia is
  'Instância de onde a lista guardada saiu: trocou o número central, a lista não vale (0234).';
comment on column public.grupos.grupos_whatsapp_lidos_em is
  'Quando a lista guardada foi lida da Evolution (0234).';

commit;
