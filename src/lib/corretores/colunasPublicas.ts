/**
 * As colunas de `corretores` que a chave pública (`anon`) pode ler (0187).
 *
 * É a lista do `.select` de toda leitura de corretores no site público, e é
 * a MESMA lista do `grant select (...) on public.corretores to anon` da 0187
 * (`colunasPublicas.test.ts` confere as duas). Coluna nova que o site precise
 * ler entra aqui E numa migration que a conceda ao `anon` — senão o PostgREST
 * recusa a consulta inteira e a página da equipe cai.
 *
 * Fora, de propósito: `email` (com o convite da fase 2 ele passa a ser o
 * e-mail real da pessoa), `user_id` e `deve_trocar_senha`, além do que o site
 * não usa (`papel`, `em_pausa`, `regioes`, horários do resumo...).
 * `grupo_id`, `ativo` e `so_whatsapp` estão aqui porque o site FILTRA por
 * eles, e filtrar exige SELECT na coluna.
 *
 * Módulo sem dependência: é lido pelo catálogo em cache e pelos testes.
 */
export const COLUNAS_PUBLICAS_DE_CORRETOR =
  "id, slug, nome, creci, whatsapp, foto_url, video_url, fundo_tipo, fundo_foto_url, bio, so_whatsapp, ativo, grupo_id";
