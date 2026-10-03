-- 0151 — Tira o vídeo de fundo do link pessoal da Bruna (03/10/2026).
--
-- O único corretor com vídeo próprio de fundo era a Bruna, e o arquivo não era
-- dela: `marca/hero-video.mp4`, o vídeo antigo da casa. Quem chegava pelo link
-- pessoal dela via esse vídeo no fundo do computador, e o usuário pediu a foto
-- da avenida entre torres no lugar (`FundoDaCasaDesktop`). Sem `video_url`, o
-- link dela cai no fundo da casa, como o de todo mundo.
--
-- `fundo_tipo` fica como está: ele só escolhe entre foto e vídeo quando há um
-- dos dois. O recurso continua existindo para quem quiser subir vídeo próprio.

update public.corretores
   set video_url = null
 where slug = 'cristal-bruna'
   and video_url = 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/hero-video.mp4';
