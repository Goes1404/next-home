-- Imagens geradas passam pelo carimbo legal e podem ficar maiores que fotos
-- comuns. O bucket histórico já aceitava as extensões, mas não declarava um
-- teto compatível com a saída do gpt-image-2; o erro só aparecia DEPOIS de a
-- imagem já ter sido paga.
--
-- O teto é elevado com `greatest`, nunca cravado: este MESMO bucket recebe o
-- mp4 do worker de vídeo (`scripts/video/worker.ts`), e em produção ele já
-- estava em 50 MB. Cravar 16 MB faria o render passar, pagar o tempo de CPU e
-- morrer no upload — a falha que esta migration existe para evitar, do outro
-- lado. Os mime types são declarados por extenso porque a lista é fechada.

update storage.buckets
   set file_size_limit = greatest(coalesce(file_size_limit, 0), 16777216),
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'video/mp4',
         'application/pdf'
       ]
 where id = 'empreendimentos';
