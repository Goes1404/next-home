-- Revisão semanal da recusa em camadas (0162). Só leitura.
-- Rodar toda segunda. O que sair daqui vira frase em
-- src/lib/whatsapp/frasesDeRecusa.ts, com o desfecho certo.

-- 1. Quem decidiu, e o que aconteceu, nos últimos 7 dias.
select decidido_por, caminho, acao, familia, count(*) as decisoes,
       count(*) filter (where desfeito_em is not null) as desfeitas_pelo_corretor
from public.recusas_detectadas
where created_at > now() - interval '7 days'
group by 1, 2, 3, 4
order by 1, 2, 3, 4;

-- 2. FALSO POSITIVO: o corretor tocou em "Liberar contato".
--    Cada linha é uma frase que a regex ou a IA marcou e não devia.
select created_at, decidido_por, familia, confianca, trecho
from public.recusas_detectadas
where desfeito_em > now() - interval '7 days'
order by created_at desc;

-- 3. A IA VIU E NÃO AGIU: confiança baixa, ou desinteresse com a IA calada.
--    É aqui que mora o falso negativo. Conferir uma a uma.
select created_at, caminho, familia, confianca, trecho
from public.recusas_detectadas
where acao = 'registrou'
  and created_at > now() - interval '7 days'
order by confianca desc nulls last;

-- 4. Candidatas a subir para a regex: o que a IA decidiu com confiança alta
--    e ninguém desfez. Frase repetida aqui vale um padrão na regex.
select lower(trecho) as trecho, familia, count(*) as vezes, round(avg(confianca), 2) as confianca_media
from public.recusas_detectadas
where decidido_por = 'ia'
  and acao in ('acolheu', 'encerrou', 'marcou')
  and desfeito_em is null
  and created_at > now() - interval '30 days'
group by 1, 2
order by vezes desc, confianca_media desc;
