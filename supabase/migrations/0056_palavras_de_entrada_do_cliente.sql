-- Palavras que o CLIENTE escreve e que liberam a IA na hora (26/08/2026).
--
-- A trava de palavra-chave (0023/0037/0049) protege o número PESSOAL do
-- corretor: conversa nova de número desconhecido nasce muda até ele
-- digitar a frase combinada. Isso está certo para a conversa da família —
-- e é justamente o que impede um teste em massa, porque lead novo que
-- escreve espontaneamente fica sem resposta e ninguém vê erro nenhum.
--
-- A saída não é desligar a trava: é dar uma PORTA DE ENTRADA. Se a
-- primeira mensagem traz uma das frases que o corretor cadastrou
-- ("vim pelo anúncio", "quero informações do site"), quem escreveu está
-- respondendo a uma peça de divulgação nossa — é lead por definição, do
-- mesmo jeito que quem chega pelo link de anúncio (`/wa/<campanha>`) ou
-- por campanha já era isento.
--
-- Quem NÃO trouxer nenhuma delas continua esperando a liberação do
-- corretor. A trava segue inteira para todo o resto.
--
-- Mesmo formato do campo de ativação: várias frases separadas por
-- vírgula, com piso de 3 letras por frase (ver listarPalavrasChave —
-- frase curta demais casaria com quase toda mensagem e abriria a porta
-- para qualquer um).

alter table public.corretor_whatsapp_instancias
  add column if not exists palavras_entrada_cliente text;

comment on column public.corretor_whatsapp_instancias.palavras_entrada_cliente is
  'Frases que o CLIENTE pode escrever para a IA assumir na hora, separadas por vírgula. Vazio = só o corretor libera.';
