-- 0142 — Banheiros e vagas das plantas (02/10/2026)
--
-- 55 plantas publicadas sem banheiros e 40 sem vagas: o cartão da planta
-- mostrava só dormitórios e metragem. A fonte principal é o apto.vc, que
-- publica banheiros e vagas por planta (casadas aqui pela metragem e pelos
-- dormitórios). Para a cobertura do Arborium, a imagem da planta.
--
-- O apto.vc também erra ("3 suítes e 1 banheiro", "3 suítes e 2
-- banheiros"), então um número só entrou quando NÃO contradiz o cadastro:
-- banheiros nunca abaixo das suítes. Ficaram de fora, sem dado confiável:
--   Oásis 90 e 114 (o site diz 3 suítes, o apto.vc diz 2 banheiros), Open
--   View 120 e Square 118 (mesma contradição), Terrah 240, Authoria duplex
--   529 (a imagem só mostra o andar de cima), La Vista (planta "47 a 60 m²"
--   numa linha só), Liv Stay 32/59/64/112 e as vagas do Liv Stay (variam por
--   andar), Vitta (lote) e as vagas de Terra Alta e Bless Jardim Esperança
--   (o apto.vc diverge do cadastro ou tem duas opções na mesma metragem).
--
-- Só preenche onde está zerado: não sobrescreve número digitado.

update public.tipologias t
   set banheiros = case when coalesce(t.banheiros, 0) = 0 and v.banheiros is not null then v.banheiros else t.banheiros end,
       vagas     = case when coalesce(t.vagas, 0) = 0 and v.vagas is not null then v.vagas else t.vagas end
  from (values
    ('906d4100-1599-43bd-a6c0-92e3e7d38180'::uuid, 2, 1),  -- Bless Parque 73
    ('b2c3ee98-76c1-4ba9-98a2-97e202e3b57c'::uuid, 3, null),  -- Alpha Park View 67 2 suítes
    ('7c28eb11-dc71-4237-9ec3-0311d9509d6b'::uuid, 3, 3),  -- Arborium cobertura 230 (imagem: 3 banheiros no superior)
    ('df1a973f-5d67-4a3e-84bc-723d02924f2f'::uuid, null, 4),  -- Authoria 273 3 suítes
    ('b87d469f-7c75-45f6-8fce-2f5eb61371f2'::uuid, null, 4),  -- Authoria 273 4 suítes
    ('6290655b-43aa-4a2f-8b2b-6f6a6af3bd43'::uuid, null, 1),  -- Beyond 56 2 dorms
    ('b223d3d5-addc-40a3-8ff4-bdaa4ec99507'::uuid, null, 1),  -- Beyond 56 1 dorm
    ('fbc3b1fb-8d8c-4f64-8622-12b571e27dd0'::uuid, null, 1),  -- Beyond 79 2 dorms
    ('ed7ba7ba-6c1b-417b-ae5c-23d59a5cac22'::uuid, null, 1),  -- Beyond 79 3 dorms
    ('d8080ea3-8eba-4678-8e92-951306f2f176'::uuid, 1, 1),  -- Breeze 43
    ('41ef08a6-94c9-44dd-bde6-1f9c2da86658'::uuid, 2, null),  -- Copa 18 2 suítes
    ('72a99e50-15af-4040-a941-f132e50ab3a1'::uuid, 3, null),  -- Copa 18 3 suítes
    ('1fc01177-9bb3-417e-b353-857fae1ee64b'::uuid, null, 2),  -- Dellagio 94
    ('f73a1e5e-61d4-44d3-b2d3-39da0fec618e'::uuid, 3, null),  -- Dellagio 95 2 suítes
    ('fa1e3503-ce29-412d-aa4c-df42a6d93856'::uuid, null, 2),  -- Dellagio 116 3 suítes
    ('31eb85c5-3c09-4086-a1d6-37120160ae92'::uuid, null, 2),  -- Dellagio 116 2 suítes
    ('2a5b9715-fccd-4423-ade5-5bc664c80d02'::uuid, 3, null),  -- Dellagio 117 3 suítes
    ('f51fa76c-1061-431d-97b6-641eef3ceb3d'::uuid, null, 2),  -- Eternity 122
    ('30f2ea09-f12b-4b30-a365-6f1e9777c780'::uuid, 2, 1),  -- Joy 65
    ('375321d9-041e-428c-9c4b-450e6c03d15c'::uuid, 2, 2),  -- Joy 85
    ('9bf0410c-0acb-4b9c-9bbe-d6e7c07aa47c'::uuid, 2, 2),  -- Joy duplex 116
    ('892348a0-eb1a-46ee-8877-cff41ac67788'::uuid, 2, 2),  -- Joy duplex 167
    ('30efe18a-1ded-4282-abed-43c24a20cebe'::uuid, 1, null),  -- Liv Stay 35
    ('6af2e552-4039-4116-a4bc-eef1260bf8ed'::uuid, null, 1),  -- Manacá 63 1 suíte
    ('71756247-54c8-4f6f-8eff-88b31933cd2a'::uuid, null, 1),  -- Manacá 63
    ('13c18198-74c4-4c5f-b74e-fede0c83c8fa'::uuid, null, 2),  -- Manacá 81
    ('67e49d25-bd39-43e2-a6cc-062bf6a06e43'::uuid, 2, 1),  -- NID 75
    ('41ab9d96-da3b-4341-882f-ad414242b678'::uuid, 2, 1),  -- NID 76
    ('daf3cace-8314-487e-8463-881fd4026fc3'::uuid, 3, 1),  -- NID 86
    ('db47c2e2-a377-46a7-b278-f25af31fcdc1'::uuid, 2, 1),  -- NID garden 93
    ('3d1b045a-1bd6-4ce1-930c-798ef1c6ad51'::uuid, 3, 2),  -- NID 107
    ('2986b593-6340-4ea5-bc8c-4fb4c7648035'::uuid, 2, 2),  -- NID duplex 130-133
    ('2c460530-0cc4-4396-9bae-91c23be49cfc'::uuid, 3, 2),  -- NID duplex 153
    ('6ca9c254-9677-4dc3-9ba5-0d5612cd7ae9'::uuid, 3, 2),  -- NID duplex 189
    ('2ccbce2c-632d-482f-8a94-0a76ff8b7224'::uuid, 1, null),  -- Nova Califórnia 46
    ('c765486a-bc05-4b3a-adbb-649bc38debea'::uuid, 2, null),  -- Oásis 74
    ('106201cf-3378-4f57-b854-81e0db11ff54'::uuid, 3, null),  -- Open View 119
    ('fae5f245-9625-4759-b6be-efefb5983a1e'::uuid, 2, null),  -- Royal II 57
    ('d9db87e2-0e99-4eac-b6a0-066be52f7a31'::uuid, 3, null),  -- Royal II 74
    ('2968cbc6-26eb-4535-8697-cb887ca02175'::uuid, 2, null),  -- Royal II 79 2 suítes
    ('7dc9d240-6de9-47ac-8bcc-7128d6850749'::uuid, 2, null),  -- Royal II 86
    ('47b9f79d-d0d5-45de-a05c-ae5eaecc0243'::uuid, 3, null),  -- Royal II 105 3 suítes
    ('5fe27c17-7da5-4257-8211-e300a3511c68'::uuid, 1, 1),  -- Serenne tipo B
    ('1806dc38-6938-4fd9-8ac2-24a90cde83e5'::uuid, 1, 2),  -- Serenne tipo A
    ('e80c3a24-c817-40e2-8d78-970e88f8d813'::uuid, 3, 1),  -- Square 94
    ('3e0a3e25-330b-402d-9766-e99f311e7c13'::uuid, null, 2),  -- Square 118
    ('c3eba08c-ce16-4a50-b7aa-eaefa424648b'::uuid, 3, 2),  -- Square 121
    ('6725cf17-0c44-4aa9-8060-05e4dc82dd21'::uuid, 2, null),  -- Symmetry 65
    ('b7e4fcb8-1dbf-407e-a682-da5b227a2c7b'::uuid, 3, null),  -- Symmetry 88
    ('9c855f75-f649-4dbc-8991-c885efc04bec'::uuid, 1, null),  -- Terra Alta 52
    ('15ac284e-9dc4-4ed9-9c33-67c1e0beb356'::uuid, 5, null),  -- Terrah 280
    ('74a6cb17-ed32-40bc-b83f-d1f266340a83'::uuid, 5, null),  -- Terrah 330
    ('4e28c60f-90cf-417f-a918-6a22ac126aee'::uuid, 2, null)  -- Bless Jardim Esperança 73
  ) as v(id, banheiros, vagas)
 where t.id = v.id;

-- Dois cadastros com MENOS banheiros que suítes, corrigidos pela fonte:
--   Arborium cobertura 230: 2 → 3 (a imagem mostra um banheiro por suíte no
--   andar de cima; o apto.vc diz 3).
--   Bit 66: 1 → 2 (apto.vc e imagem). A imagem ligada a essa planta mostra 2
--   dormitórios, e o cadastro diz 3 com 2 suítes: fica pendente conferir.
update public.tipologias set banheiros = 3
 where id = '7c28eb11-dc71-4237-9ec3-0311d9509d6b' and banheiros = 2;
update public.tipologias set banheiros = 2
 where id = '910465f3-a706-46b8-85f3-f0de7620e704' and banheiros = 1;
