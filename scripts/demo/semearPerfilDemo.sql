-- Perfil de DEMONSTRAÇÃO do painel do corretor (07/10/2026).
--
-- Enche de dados fictícios o corretor 'demo-lucas-andrade' (criado antes,
-- com login, ativo = false e sem WhatsApp conectado), para apresentar o
-- painel cheio.
--
-- Por que ele não atrapalha a operação real:
--   - ativo = false: fora da roleta (distribuir_lead), do site público
--     (corretoresPublicos filtra ativo) e dos avisos por WhatsApp;
--   - sem instância conectada: o porteiro /wa não o sorteia e nada sai por
--     WhatsApp em nome dele;
--   - telefones fictícios (11 90000-xxxx);
--   - a última fala de cada conversa é da IA ou do corretor: nenhuma
--     varredura acha cliente esperando resposta;
--   - quem tem visita marcada não tem conversa: o lembrete de véspera não é
--     criado.
--
-- O que ele CONTAMINA até ser apagado: os números da equipe que o ADM vê
-- (leads, funil, caixa e DRE pelas vendas) e o ranking.
-- Para apagar tudo: scripts/demo/apagarPerfilDemo.sql.

do $$
declare
  demo uuid := (select id from public.corretores where slug = 'demo-lucas-andrade');
  imoveis uuid[] := array(
    select id from public.empreendimentos where publicado order by ordem limit 8
  );
  nomes text[] := array[
    'Mariana Costa','Rafael Oliveira','Juliana Mendes','Thiago Ribeiro','Camila Ferreira',
    'Bruno Almeida','Fernanda Lima','Gustavo Rocha','Patrícia Souza','Leonardo Martins',
    'Aline Barbosa','Diego Carvalho','Renata Gomes','Felipe Araújo','Larissa Pereira',
    'Rodrigo Nunes','Beatriz Teixeira','Marcelo Dias','Vanessa Moreira','André Cardoso',
    'Carolina Freitas','Eduardo Pinto','Tatiane Correia','Vinícius Castro','Daniela Rezende',
    'Paulo Henrique Silva','Isabela Monteiro','Ricardo Fonseca','Natália Campos','Henrique Batista',
    'Priscila Moura','Lucas Vieira','Gabriela Duarte','Matheus Lopes','Amanda Cavalcanti',
    'Fábio Santana','Letícia Ramos','Alexandre Torres','Bianca Azevedo','Sérgio Machado',
    'Roberta Nogueira','César Peixoto','Simone Andrade','Otávio Brandão','Kelly Farias',
    'Igor Medeiros','Elaine Siqueira','Murilo Tavares','Jéssica Coelho'
  ];
  etapas text[] := array[
    'novo','novo','novo','novo','novo','novo','novo','novo',
    'primeiro_contato','primeiro_contato','primeiro_contato','primeiro_contato','primeiro_contato','primeiro_contato',
    'em_conversa','em_conversa','em_conversa','em_conversa','em_conversa','em_conversa','em_conversa','em_conversa',
    'qualificado','qualificado','qualificado','qualificado','qualificado','qualificado',
    'visita_agendada','visita_agendada','visita_agendada','visita_agendada','visita_agendada',
    'visitou','visitou','visitou','visitou',
    'proposta','proposta','proposta',
    'documentacao','documentacao',
    'fechado','fechado','fechado','fechado',
    'perdido','perdido','perdido'
  ];
  origens text[] := array['meta/ctwa','meta/ctwa','meta/ctwa','site/formulario','portal/zap','indicacao','meta/lead_ads','site/whatsapp'];
  regioes text[] := array['Alphaville','Barueri Centro','Alphagran','Aldeia da Serra','Tamboré','Barueri'];
  visitas_futuras interval[] := array[interval '14 hours', interval '17 hours', interval '2 days 10 hours', interval '3 days 14 hours', interval '5 days 11 hours'];
  hoje_sp timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  i int;
  n int := array_length(nomes, 1);
  lead uuid;
  conv uuid;
  msg uuid;
  etapa text;
  origem text;
  regiao text;
  dorms int;
  criado timestamptz;
  imovel uuid;
  nome_imovel text;
  renda numeric;
  orcamento numeric;
  quente int;
  base timestamptz;
  visita timestamptz;
  idx_visita int := 0;
  primeiro text;
  venda uuid;
  valor numeric;
begin
  if demo is null then
    raise exception 'Crie antes o corretor com slug demo-lucas-andrade.';
  end if;
  if exists (select 1 from public.leads where corretor_id = demo) then
    raise exception 'O perfil de demonstração já tem dados. Rode apagarPerfilDemo.sql antes.';
  end if;

  for i in 1..n loop
    etapa := etapas[i];
    origem := origens[1 + (i % array_length(origens, 1))];
    regiao := regioes[1 + (i % array_length(regioes, 1))];
    dorms := 2 + (i % 2);
    criado := now() - make_interval(days => (n - i) + 2 + (i % 5), hours => (i * 7) % 24);
    imovel := imoveis[1 + (i % array_length(imoveis, 1))];
    select nome into nome_imovel from public.empreendimentos where id = imovel;
    renda := case when etapa in ('novo','primeiro_contato','em_conversa','perdido') then null
                  else 6000 + ((i * 1370) % 14000) end;
    orcamento := case when renda is null then null else round(renda * 70 / 1000) * 1000 end;
    primeiro := split_part(nomes[i], ' ', 1);

    visita := null;
    if etapa = 'visita_agendada' then
      idx_visita := idx_visita + 1;
      visita := hoje_sp + visitas_futuras[idx_visita];
    elsif etapa in ('visitou','proposta','documentacao','fechado') then
      visita := now() - make_interval(days => 3 + (i % 9), hours => i);  -- horário único: o índice leads_visita_sem_conflito_idx recusa duas visitas no mesmo instante
    end if;

    insert into public.leads (
      nome, telefone, email, origem, tipo, consentimento_lgpd, created_at,
      corretor_id, origem_atribuicao, etapa, etapa_alterada_em,
      empreendimento_id, imovel_interesse_id, regiao_interesse, dormitorios_min,
      renda_mensal, orcamento_max, visita_agendada_em, anuncio_origem,
      tentativas_contato, tentativas_sem_resposta, ultima_tentativa_em, mensagem
    ) values (
      nomes[i],
      '(11) 90000-' || lpad((1000 + i)::text, 4, '0'),
      case when i % 3 = 0 then lower(split_part(nomes[i], ' ', 1)) || '.demo' || i || '@exemplo.com' end,
      origem, 'comprador', true, criado,
      demo, 'manual', etapa,
      now() - make_interval(days => (i % 6), hours => (i * 5) % 24),
      imovel, imovel,
      case when renda is null then null else regiao end,
      case when renda is null then null else dorms end,
      renda, orcamento, visita,
      case when origem like 'meta/%' then nome_imovel end,
      case when etapa = 'novo' then 0 else 1 + (i % 3) end,
      case when etapa in ('primeiro_contato') then 1 else 0 end,
      case when etapa = 'novo' then null else now() - make_interval(days => i % 4) end,
      case when i % 4 = 0 then 'Tenho interesse no ' || nome_imovel || ', pode me passar mais informações?' end
    ) returning id into lead;

    -- Leitura da IA (dossiê) para quem já conversou.
    quente := case etapa
      when 'novo' then null
      when 'primeiro_contato' then null
      when 'em_conversa' then 40 + (i % 15)
      when 'qualificado' then 58 + (i % 12)
      when 'perdido' then 18
      else 72 + (i % 20) end;
    if quente is not null then
      insert into public.lead_observacoes_ia (
        lead_id, orcamento_max, forma_pagamento, perfil_familiar, urgencia_mudanca,
        objecoes_identificadas, temperatura_score, temperatura_label, resumo_executivo, proximo_passo_sugerido
      ) values (
        lead, orcamento,
        case when i % 2 = 0 then 'Financiamento com FGTS' else 'Financiamento com entrada' end,
        case when i % 3 = 0 then 'Casal com um filho' when i % 3 = 1 then 'Casal sem filhos' else 'Mora sozinho(a)' end,
        case when quente >= 70 then 'Quer mudar nos próximos 3 meses' else 'Sem pressa, pesquisando' end,
        case when etapa = 'perdido' then '["preço acima do orçamento"]'::jsonb
             when i % 4 = 0 then '["quer vaga dupla"]'::jsonb else '[]'::jsonb end,
        quente,
        case when quente >= 70 then 'quente' when quente >= 40 then 'morno' else 'frio' end,
        primeiro || ' procura apartamento de ' || dorms || ' dormitórios em ' || regiao ||
          ' e gostou do ' || nome_imovel || '.' ||
          case when renda is not null then ' Renda familiar de R$ ' || to_char(renda, 'FM999G999') || ' por mês.' else '' end,
        case etapa
          when 'em_conversa' then 'Perguntar a renda para indicar o imóvel certo.'
          when 'qualificado' then 'Convidar para conhecer o decorado neste fim de semana.'
          when 'visitou' then 'Enviar a simulação de financiamento.'
          when 'proposta' then 'Acompanhar a resposta da construtora à proposta.'
          when 'documentacao' then 'Cobrar os documentos que faltam para a análise de crédito.'
          when 'perdido' then 'Avisar quando surgir opção na faixa de preço dele.'
          else 'Pedir indicação de amigos e familiares.' end
      );
    end if;

    -- Conversa de WhatsApp (sem as de visita marcada, para não criar lembrete).
    if etapa in ('em_conversa','qualificado','visitou','proposta','documentacao','fechado','perdido') then
      base := criado + interval '10 minutes';
      insert into public.whatsapp_conversas (
        corretor_id, lead_id, telefone_cliente, nome_cliente, bot_ativo, origem,
        created_at, atendida_em, nao_lidas, corretor_leu_ate, e_teste
      ) values (
        demo, lead, '5511900' || lpad((1000 + i)::text, 6, '0'), nomes[i], true, 'organica',
        base, base, 0, now(), false
      ) returning id into conv;

      insert into public.whatsapp_mensagens (conversa_id, remetente, tipo, conteudo, created_at, status_entrega) values
        (conv, 'cliente', 'texto', 'Olá! Vi o anúncio do ' || nome_imovel || ' e queria saber mais.', base, null),
        (conv, 'bot', 'texto', 'Oi, ' || primeiro || '! Que bom que gostou do ' || nome_imovel || ' 😊 Você procura em qual região?', base + interval '9 seconds', 'lida'),
        (conv, 'cliente', 'texto', 'Pode ser em ' || regiao || ' mesmo', base + interval '3 minutes', null),
        (conv, 'bot', 'texto', 'Perfeito! E você prefere pronto para morar ou na planta?', base + interval '3 minutes 8 seconds', 'lida'),
        (conv, 'cliente', 'texto', 'Na planta, quero ' || dorms || ' quartos', base + interval '6 minutes', null),
        (conv, 'bot', 'texto', 'Ótimo! O ' || nome_imovel || ' tem planta de ' || dorms || ' dormitórios. Pra eu te indicar a melhor opção, qual a renda mensal da família, mais ou menos?', base + interval '6 minutes 9 seconds', 'lida');

      if etapa <> 'em_conversa' then
        insert into public.whatsapp_mensagens (conversa_id, remetente, tipo, conteudo, created_at, status_entrega) values
          (conv, 'cliente', 'texto', 'Uns ' || to_char(coalesce(renda, 7000), 'FM999G999') || ' por mês', base + interval '11 minutes', null),
          (conv, 'bot', 'texto', 'Com essa renda dá pra financiar tranquilo 👏 Quer conhecer o decorado? Tenho sábado às 10h ou às 15h.', base + interval '11 minutes 7 seconds', 'lida');
      end if;

      if etapa in ('visitou','proposta','documentacao','fechado') then
        insert into public.whatsapp_mensagens (conversa_id, remetente, tipo, conteudo, created_at, status_entrega) values
          (conv, 'cliente', 'texto', 'Sábado às 10h fica ótimo', base + interval '15 minutes', null),
          (conv, 'bot', 'texto', 'Combinado! Sábado às 10h no decorado do ' || nome_imovel || ', com o Lucas. Qualquer coisa é só me chamar 😉', base + interval '15 minutes 6 seconds', 'lida'),
          (conv, 'cliente', 'texto', 'Adorei o apartamento! Como fica a simulação?', visita + interval '3 hours', null),
          (conv, 'corretor', 'texto', 'Que bom, ' || primeiro || '! Já te mando a simulação completa com a entrada e as parcelas.', visita + interval '3 hours 20 minutes', 'lida');
      elsif etapa = 'perdido' then
        insert into public.whatsapp_mensagens (conversa_id, remetente, tipo, conteudo, created_at, status_entrega) values
          (conv, 'cliente', 'texto', 'Acho que por enquanto vou esperar, ficou acima do que eu queria', base + interval '1 day', null),
          (conv, 'bot', 'texto', 'Entendo, ' || primeiro || '. Se surgir algo na sua faixa eu te aviso, combinado?', base + interval '1 day 8 seconds', 'lida');
      end if;

      update public.whatsapp_conversas c set
        ultima_mensagem = m.conteudo, ultima_interacao_em = m.created_at, nao_lidas = 0  -- o gatilho conta as falas do cliente como não lidas
      from (select conteudo, created_at from public.whatsapp_mensagens
            where conversa_id = conv order by created_at desc limit 1) m
      where c.id = conv;

      -- Telemetria da IA, uma linha por resposta, para os números do Desempenho.
      for msg in
        select id from public.whatsapp_mensagens where conversa_id = conv and remetente = 'bot'
      loop
        insert into public.ia_interacoes (
          conversa_id, corretor_id, origem, prompt_versao, modelo, latencia_ms, fallback,
          acao, sugeriu_visita, transferiu_humano, anexos_enviados, anexos_bloqueados,
          temperatura_score, avaliacao, created_at, e_teste
        ) select conv, demo, 'webhook', 'v47', 'gpt-4.1-mini', 2400 + (random() * 3500)::int, false,
                 'respondida', m.conteudo ilike '%decorado%', false, 0, 0,
                 quente, case when random() < 0.6 then 'boa' end, m.created_at - interval '2 seconds', false
            from public.whatsapp_mensagens m where m.id = msg;
      end loop;
    end if;

    -- Linha do tempo.
    insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, created_at)
    values (lead, demo, 'sistema', 'Lead recebido por ' || origem, criado);
    if etapa <> 'novo' then
      insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, created_at)
      values (lead, demo, 'etapa', 'Etapa alterada para ' || etapa, now() - make_interval(days => (i % 6)));
    end if;
    if etapa in ('visitou','proposta','documentacao','fechado') then
      insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, created_at)
      values (lead, demo, 'visita', 'Visita ao decorado do ' || nome_imovel || ' realizada. Cliente gostou da planta.', visita + interval '2 hours');
    end if;
    if i % 5 = 0 then
      insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, created_at)
      values (lead, demo, 'ligacao', 'Liguei para tirar dúvidas sobre o financiamento.', now() - make_interval(days => i % 7));
    end if;

    -- Tarefas para hoje e amanhã.
    if etapa in ('qualificado','proposta','documentacao') then
      insert into public.lead_tarefas (lead_id, corretor_id, titulo, prazo)
      values (lead, demo,
        case etapa when 'qualificado' then 'Ligar para ' || primeiro || ' e marcar a visita'
                   when 'proposta' then 'Retornar a ' || primeiro || ' sobre a proposta'
                   else 'Conferir documentos de ' || primeiro end,
        hoje_sp + make_interval(days => (i % 2), hours => 10 + (i % 8)));
    end if;

    -- Vendas.
    if etapa = 'fechado' then
      valor := 380000 + ((i * 37000) % 260000);
      insert into public.vendas (
        corretor_id, lead_id, empreendimento_id, unidade, data_venda, valor_venda,
        comissao_percentual, comissao_valor, status, comissao_recebida_em, comissao_prevista_em, observacao
      ) values (
        demo, lead, imovel, 'Apto ' || (100 + i * 3)::text,
        (now() - make_interval(days => 2 + (i % 5)))::date, valor,
        5, valor * 0.05, 'ativa',
        case when i % 2 = 0 then (now() - make_interval(days => 1))::date end,
        case when i % 2 = 1 then (now() + make_interval(days => 12))::date end,
        'Venda de demonstração'
      ) returning id into venda;
      insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor)
      values (venda, demo, 100, 40, valor * 0.05 * 0.40);
    end if;
  end loop;

  -- Meta do mês e agenda.
  insert into public.metas_corretor (corretor_id, mes, meta_comissao, comissao_por_venda)
  values (demo, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, 15000, 8000)
  on conflict do nothing;

  insert into public.corretor_disponibilidade (corretor_id, dia_semana, hora_inicio, hora_fim)
  select demo, d, 9, 19 from generate_series(1, 6) d
  on conflict do nothing;
end $$;

-- Histórico de vendas dos meses anteriores (07/10/2026), para o gráfico de
-- VGV por mês da tela de Vendas ter ritmo. Cada venda ganha um lead em
-- "fechado", sem conversa nem visita.
do $$
declare
  demo uuid := (select id from public.corretores where slug = 'demo-lucas-andrade');
  imoveis uuid[] := array(
    select id from public.empreendimentos where publicado order by ordem limit 8
  );
  nomes text[] := array['Wagner Lopes','Cristina Prado','Maurício Leal','Débora Assis','Rogério Paiva',
                        'Sabrina Melo','Antônio Queiroz','Viviane Rios','Nelson Barros','Lívia Arantes'];
  meses_atras int[] := array[5, 5, 4, 3, 3, 2, 2, 1, 1, 1];
  i int;
  lead uuid;
  venda uuid;
  imovel uuid;
  quando date;
  valor numeric;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if demo is null then raise exception 'Perfil de demonstração não encontrado.'; end if;
  if exists (select 1 from public.vendas where corretor_id = demo and observacao = 'Venda de demonstração (histórico)') then
    raise exception 'O histórico de vendas já foi criado.';
  end if;
  for i in 1..array_length(nomes, 1) loop
    imovel := imoveis[1 + ((i * 3) % array_length(imoveis, 1))];
    quando := (date_trunc('month', hoje) - make_interval(months => meses_atras[i]))::date + (3 + (i * 7) % 22);
    valor := 360000 + ((i * 53000) % 290000);
    insert into public.leads (nome, telefone, origem, tipo, consentimento_lgpd, created_at, corretor_id,
      origem_atribuicao, etapa, etapa_alterada_em, empreendimento_id, imovel_interesse_id, tentativas_contato)
    values (nomes[i], '(11) 90000-' || lpad((2000 + i)::text, 4, '0'),
      (array['meta/ctwa','site/formulario','indicacao','portal/zap'])[1 + (i % 4)], 'comprador', true,
      quando - 40, demo, 'manual', 'fechado', quando, imovel, imovel, 3)
    returning id into lead;
    insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, created_at)
    values (lead, demo, 'etapa', 'Etapa alterada para fechado', quando);
    insert into public.vendas (corretor_id, lead_id, empreendimento_id, unidade, data_venda, valor_venda,
      comissao_percentual, comissao_valor, status, comissao_recebida_em, observacao)
    values (demo, lead, imovel, 'Apto ' || (200 + i * 7)::text, quando, valor, 5, valor * 0.05, 'ativa',
      case when meses_atras[i] >= 2 then quando + 30 when i = 8 then quando + 20 end, 'Venda de demonstração (histórico)')
    returning id into venda;
    insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor, repasse_pago_em)
    values (venda, demo, 100, 40, valor * 0.05 * 0.40, case when meses_atras[i] >= 2 then quando + 35 end);
  end loop;
end $$;
