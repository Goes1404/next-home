-- 0037 — Retrava a ativação por palavra-chave e troca a palavra em si.
--
-- NÃO altera schema: é correção de DADO, e está aqui por rastreabilidade —
-- sem isso a mudança de comportamento fica sem registro nenhum.
--
-- Por que foi preciso (medido em 23/08/2026, sobre os traces reais):
--
-- 1. A palavra-chave cadastrada era "Teste". O casamento é por substring
--    normalizada, e num ambiente de teste "Teste" é a palavra mais digitada
--    que existe. Cruzando com as conversas: o corretor escreveu "Teste" às
--    18:28 e 19:14 na conversa da própria MÃE e às 23:07 na de um amigo — e
--    o bot respondeu 1 minuto depois nas três. O mecanismo obedeceu; a
--    palavra é que não servia. ("testei", "testando", "protesto" também
--    abriam.)
--
-- 2. `liberado_por_palavra_chave` era decidido no INSERT da conversa e nunca
--    mais reavaliado (repositorio.ts, `obterOuCriarConversa`), e só sabia
--    virar `true`. Como `exigePalavraChave` devolve `false` quando não há
--    chave configurada, TODA conversa criada antes de a chave existir nasceu
--    liberada. A instância foi atualizada em 2026-08-23 02:50; as conversas
--    são de 19 a 22/08. As quatro nasceram liberadas.
--
--    O único freio que restava era `pausado_humano_ate` — 24h que se renovam
--    a cada mensagem e VENCEM sozinhas. Ou seja: bastava o corretor passar
--    um dia sem falar com a mãe para a IA assumir aquela conversa.
--
-- O código que impede a reincidência é `decidirPorFalaDoCorretor`
-- (modoBot.ts): a palavra-chave só LIGA; qualquer outra fala do corretor
-- retrava. Este arquivo só conserta o estado que já estava gravado.

-- Palavra-chave que ninguém digita por acaso. Com uma frase de três
-- palavras o casamento por substring deixa de ser um risco prático.
update corretor_whatsapp_instancias
set palavra_chave_ativacao = 'ativar lia agora'
where instance_name = 'nexthome-cristal-bruna';

-- Devolve ao estado bloqueado tudo que nasceu liberado por não haver chave
-- na época. Campanha fica de fora de propósito: disparo em massa nunca
-- exigiu palavra-chave (quem dispara já decidiu que a IA participa), e
-- travar essas conversas emudeceria a IA justamente onde ela deve falar.
update whatsapp_conversas
set liberado_por_palavra_chave = false
where origem <> 'campanha'
  and liberado_por_palavra_chave = true;

-- Reversão, se precisar:
--   update corretor_whatsapp_instancias
--   set palavra_chave_ativacao = 'Teste'
--   where instance_name = 'nexthome-cristal-bruna';
--
--   update whatsapp_conversas set liberado_por_palavra_chave = true
--   where id in (<ids gravados antes da aplicação — ver comentário abaixo>);
--
-- Estado no momento da aplicação (2026-08-24 01:44 UTC), para reverter com
-- precisão. Eram DEZ conversas orgânicas liberadas — não as quatro que
-- apareciam no primeiro recorte (só olhei as que tinham resposta do bot).
-- Seis delas já estavam com a pausa VENCIDA, ou seja, sem nenhuma proteção
-- no momento em que isto foi aplicado:
--
--   45b3e115-9fb0-4e69-b1c4-22a2bce0bb48  ...0589   pausa até 24/08 18:22
--   6e90289e-5f4f-4fa1-be93-e97fa2da7d32  ...1903   VENCIDA (20/08 16:43)
--   23bda88e-ac45-45a0-a06c-a8f45eec5a85  ...3725   VENCIDA (20/08 17:23)
--   9059bc30-71c7-449e-a619-0bdfc6bd4b0c  ...4230   VENCIDA (20/08 16:42)
--   56cee96e-97a0-45e6-bbe4-750a0a7d0444  ...5875   VENCIDA (23/08 12:55)
--   2cff42f6-da1f-4896-8b49-e55f11483422  ...6256   pausa até 25/08 00:56
--   54efd3dc-243d-44b7-9f01-d7c312b1449d  ...8216   pausa até 24/08 18:32  (mãe do corretor)
--   c6288583-b703-4a20-b6e4-0c620479c400  ...8667   pausa até 25/08 01:38
--   9f458da5-bb8d-446f-acc4-cd403d20495a  ...8991   VENCIDA (20/08 19:06)
--   16ec2a37-1f0e-45ec-b27d-0d47c0e6d25e  ...9959   pausa até 24/08 01:07 — VENCIDA
--
-- As seis de campanha (0886, 1391, 7765, 8127, 9079, 9297) NÃO foram
-- tocadas e seguem liberadas, como devem.
