-- Adiciona o campo de video_url para permitir que cada corretor tenha seu próprio fundo de vídeo no site
ALTER TABLE "public"."corretores" ADD COLUMN "video_url" text;
