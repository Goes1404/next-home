-- 0071 — O número caiu e nada avisou (roadmap, H0.0)
--
-- (Nasceu como 0065 e foi renumerada em 31/08 pelo mesmo motivo da 0070:
-- a branch em produção já usa 0064-0069.)
--
-- ## O incidente
--
-- 28/08/2026, 16h21: a instância reconecta. 16h22: cinco disparos saem em
-- rajada. 16h23: três envios morrem com `This operation was aborted`, o
-- disjuntor abre, e o número fica `desconectado`. Aí ele fica — por TRÊS
-- DIAS. Fila parada em 15 itens, zero mensagem entregue, zero mensagem
-- recebida, e nenhum aviso a ninguém. O apagão só apareceu porque alguém
-- foi medir produção para atualizar um roadmap.
--
-- O sistema tem QUATRO proteções do número — espaçamento, cota, disjuntor e
-- janela de horário — e nenhuma delas conta que o número saiu do ar. Elas
-- impedem o estrago; nenhuma avisa do apagão.
--
-- ## As duas colunas
--
-- `desconectado_em` — QUANDO a queda foi detectada. Sem ela o aviso teria de
-- usar `conectado_em`, que é o oposto (quando o número SUBIU): no incidente
-- os dois ficam a dois minutos de distância por coincidência, e em qualquer
-- outra queda a conta sairia errada. É esta coluna que sustenta o "faz 3
-- dias" do aviso, que é a informação que faz o corretor entender o tamanho
-- do problema — um horário sozinho não faz.
--
-- Ela é carimbada UMA VEZ por queda, na primeira detecção
-- (`update ... where desconectado_em is null`). Se cada ciclo do cron
-- reescrevesse, o apagão de três dias apareceria eternamente como "faz um
-- minuto" — o defeito seria invisível justamente por ser contínuo.
--
-- `aviso_queda_enviado_em` — quando o e-mail saiu. O cron de disparo roda a
-- cada minuto: sem esta marca, uma queda de três dias viraria 4.320 e-mails.
-- O aviso é por QUEDA, não por ciclo.
--
-- As duas voltam a `null` quando o número reconecta, e é isso que arma o
-- aviso da próxima vez. Zerar no retorno é deliberado: uma queda nova é
-- notícia nova, mesmo que a anterior tenha sido ontem.

alter table public.corretor_whatsapp_instancias
  add column if not exists desconectado_em timestamptz,
  add column if not exists aviso_queda_enviado_em timestamptz;

comment on column public.corretor_whatsapp_instancias.desconectado_em is
  'Quando a queda foi detectada. Carimbado uma vez por queda; volta a null ao reconectar.';
comment on column public.corretor_whatsapp_instancias.aviso_queda_enviado_em is
  'Quando o e-mail de queda foi enviado. Impede um e-mail por ciclo de cron; volta a null ao reconectar.';

-- Nenhum grant: quem escreve estas colunas é o cliente de serviço (cron e
-- sincronização de conexão), que não passa por policy. A tabela já é lida
-- pelo corretor dono e pelo gestor (0031), e a faixa do painel usa essa
-- mesma leitura — nada novo a conceder.
--
-- Retroativo: a instância que está fora do ar desde 28/08 não tem marco de
-- queda, e sem ele o aviso diria "a conexão caiu" sem dizer quando. O
-- horário abaixo é o do último envio bem-sucedido registrado na fila, que é
-- o instante em que sabemos que o número ainda respondia.
-- (A fila não guarda a instância: o vínculo vem por campanha -> corretor.
-- Corretor sem envio nenhum fica com `null`, e o aviso simplesmente omite o
-- "quando" — melhor que carimbar um horário inventado.)
update public.corretor_whatsapp_instancias i
set desconectado_em = (
  select max(f.enviado_em)
  from public.whatsapp_campanhas_fila f
  join public.whatsapp_campanhas c on c.id = f.campanha_id
  where c.corretor_id = i.corretor_id
    and f.enviado_em is not null
)
where i.status_conexao <> 'conectado'
  and i.desconectado_em is null
  and i.conectado_em is not null;
