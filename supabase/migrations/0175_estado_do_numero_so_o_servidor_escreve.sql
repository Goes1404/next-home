-- 0175 — O estado do número só o servidor escreve (10/10/2026).
--
-- POR QUE: o `authenticated` tinha INSERT, UPDATE, DELETE e TRUNCATE de
-- TABELA em `corretor_whatsapp_instancias` (o padrão do Supabase), e a
-- policy "so o dono" é `for all`. Juntos, deixavam o corretor reescrever a
-- própria linha pela API, com a chave pública e a sessão dele, sem passar
-- pelo painel:
--
-- - zerar `envios_campanha_contador` e mandar mais mensagens no dia;
-- - pôr `conectado_em` no passado ou apagar `aquecimento_desde` e pular o
--   aquecimento depois de uma queda (0158 e 0174);
-- - apagar `bloqueado_ate` e `proximo_envio_permitido_em` e furar o
--   disjuntor e o espaçamento (0062);
-- - apagar `sessao_caida_em` e voltar ao rodízio do link com a sessão morta;
-- - gravar um `webhook_secret` próprio, que o webhook aceita como senha da
--   instância, e forjar mensagens de cliente que a IA responderia pelo
--   número dele;
-- - trocar `instance_name` pelo nome da instância de um colega que ainda
--   não conectou e receber as mensagens dele.
--
-- Os limites do número são regra da plataforma ("bem conservadores", 09/10)
-- e não podem depender de o corretor não abrir o console do navegador.
--
-- O QUE MUDA: a sessão do corretor continua lendo a própria linha e altera
-- só a configuração da assistente (nome, tom, modo, palavras-chave, frases
-- de entrada, expediente e regras). A linha nasce, conecta e desconecta
-- pelo servidor, com a chave de serviço, depois de o painel conferir a
-- sessão (`whatsapp/acoes.ts`). Webhook, crons e disparador já usavam a
-- chave de serviço e não mudam.
--
-- Aplicar DEPOIS do deploy: o código antigo gravava o estado da conexão
-- pela sessão, e com esta migration no ar essas gravações falhariam caladas.

begin;

revoke all on public.corretor_whatsapp_instancias from anon;
revoke all on public.corretor_whatsapp_instancias from authenticated;

grant select on public.corretor_whatsapp_instancias to authenticated;

grant update (
  nome_assistente,
  tom_voz,
  modo_bot,
  palavra_chave_ativacao,
  palavra_chave_teste,
  palavras_entrada_cliente,
  expediente_inicio,
  expediente_fim,
  regras_da_ia,
  updated_at
) on public.corretor_whatsapp_instancias to authenticated;

commit;
