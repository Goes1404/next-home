-- Configuração das palavras-chave para o teste em massa (26/08/2026).
--
-- Três problemas na configuração que estava em produção, todos silenciosos:
--
-- 1. `palavra_chave_ativacao = 'Teste'` e `palavra_chave_teste` VAZIA. Ou
--    seja: a equipe testava digitando "Teste", a IA ligava — e a conversa
--    entrava no sistema como ATENDIMENTO REAL, virando exemplo de
--    treinamento. É exatamente o defeito que as migrations 0038/0039
--    tiveram de limpar depois (46 conversas de teste no few-shot).
--
-- 2. "Teste" é curta e genérica. O casamento é por substring, então
--    "testei", "testando" e "teste isso aqui" abriam a porta por acaso.
--
-- 3. `palavras_entrada_cliente` vazia: número desconhecido que escrevia
--    espontaneamente ficava sem resposta até o corretor liberar um por um
--    — o que travava qualquer teste com volume.
--
-- O UPDATE é condicionado ao estado ANTIGO (`palavra_chave_ativacao =
-- 'Teste'`) de propósito: é idempotente, e não sobrescreve a configuração
-- de um corretor que já tenha ajustado a dele.

update public.corretor_whatsapp_instancias
set
  -- Ativação: frases que o CORRETOR digita no chat para entregar a
  -- conversa à IA. Três, porque no meio do atendimento ninguém lembra da
  -- frase exata — foi o motivo de o campo passar a aceitar lista.
  palavra_chave_ativacao = 'pode assumir, assume ai, sofia entra',

  -- Teste: liga a IA E tira a conversa do aprendizado. "teste sofia" no
  -- lugar de "Teste" porque a segunda casa dentro de "testei"/"testando";
  -- duas frases para não obrigar ninguém a decorar uma só.
  palavra_chave_teste = 'teste sofia, modo teste',

  -- Porta de entrada do CLIENTE (0056): quem chega escrevendo uma destas
  -- está respondendo a uma divulgação nossa. São propositalmente frases
  -- de quem viu anúncio — não um "oi", que abriria a conversa para
  -- qualquer pessoa (o número é o pessoal do corretor).
  palavras_entrada_cliente = 'vim pelo anuncio, vim pelo anúncio, vi no instagram, vi o anuncio, vi o anúncio, quero mais informacoes, quero mais informações, gostaria de informacoes, gostaria de informações'
where palavra_chave_ativacao = 'Teste';
