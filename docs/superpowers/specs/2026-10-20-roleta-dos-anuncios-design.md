# Roleta dos anúncios — desenho

Data: 20/10/2026. Pedido do dono da conta (Matheus).

## Para que serve

Um corretor paga um anúncio de WhatsApp (Click-to-WhatsApp da Meta). O
cliente clica e escreve para o número DELE. Hoje esse lead fica com ele. A
roleta deixa esse corretor (ou o ADM por ele) repassar os leads dos anúncios
para outros corretores, um para cada, em ordem. Quem recebe fala com o
cliente do próprio número.

## Como funciona

1. **Gatilho:** mensagem que chega a um número com a etiqueta de anúncio da
   Meta (`reconhecerAnuncioMeta`, o mesmo bloco de `registrarLeadDeImpulsionamento`)
   E de um lead que acabou de nascer por essa mensagem. Lead que já existia
   (cliente antigo clicando no anúncio) não passa pela roleta. Mensagem comum,
   site, lista e contato pessoal também não.
2. **Configuração por número (por corretor dono do anúncio):** ligada ou
   desligada; a lista ordenada de corretores que recebem; os dois textos. Quem
   pagou pode estar na lista ou não — escolha dele.
3. **Quem configura:** o corretor configura a roleta do próprio número; o ADM
   configura a de qualquer corretor do grupo.
4. **Distribuição:** um para cada, na ordem da lista, guardando de quem foi a
   última vez. Corretor da lista inativo ou com o WhatsApp desconectado é
   pulado. Se ninguém da lista puder receber, o lead fica com quem pagou,
   como hoje. Só corretores do mesmo grupo podem estar na lista.
5. **Quando um lead cai para o corretor B:**
   - a ficha muda de dono para B (`leads.corretor_id`), com registro na linha
     do tempo ("repasse pela roleta do anúncio de A");
   - o número de A responde UMA vez ao cliente, com o texto de passagem
     (padrão: "Oi! Quem vai te atender é a {corretor}, ela já te chama pelo
     número dela."). Depois disso a IA de A fica calada nessa conversa (já é
     o comportamento para lead de outro corretor);
   - o número de B manda a mensagem de abertura (padrão: "Oi, {cliente}!
     Aqui é a {corretor}, da {imobiliária}. Vi que você chamou sobre o
     {imóvel}. Posso te ajudar?"). A conversa nasce no painel de B, ligada ao
     mesmo lead;
   - B recebe a notificação no celular (0203) e o aviso no WhatsApp.
6. **Limites:** decisão do dono: a mensagem de abertura **ignora o limite
   diário** do número. **Minha decisão:** ela também não espera o intervalo
   entre mensagens de lista — é resposta a quem pediu contato, e esperar
   minutos com o cliente acabado de chamar perde o lead. Continua respeitando
   o horário seguro (9h às 20h59, sem domingo)? **Não**: o cliente escreveu
   agora; responder agora é o certo. Se o envio de B falhar (número caiu no
   meio), o lead volta para A e A é avisado.
7. **Textos editáveis** na tela da roleta, com os marcadores `{corretor}`,
   `{cliente}`, `{imovel}` e `{imobiliaria}`. Marcador sem valor some com a
   pontuação, como nas listas.
8. **Tela:** Anúncios pagos → seção "Roleta dos meus anúncios" (para o
   corretor, a dele; para o ADM, um seletor de corretor).

## Não é objetivo

- Repassar lead que não veio de anúncio.
- Mover a conversa já existente de A para B (o WhatsApp não permite; B começa
  uma conversa nova).
- Roleta por anúncio ou por imóvel (é por número; fica para depois se pedirem).
- Repasse entre empresas.

## Risco aceito

A mensagem de B é a primeira para alguém que nunca falou com aquele número.
É o que o WhatsApp vigia para restringir conta (caso da Bruna em 07/10). Aqui
o volume é o dos anúncios (poucos por dia por corretor) e o cliente acabou de
pedir contato, por isso o dono aceitou ignorar o limite diário.

## Para quem constrói

- Configuração: tabela nova por corretor (`roleta_anuncios`: `corretor_id`,
  `ligada`, `destinos uuid[]` ordenado, `ultimo_indice`, `texto_passagem`,
  `texto_abertura`), no padrão multi-grupo (`grupo_id`, gatilhos 00/zz,
  policy restritiva, `revoke` de `anon` e `authenticated`; escrita pelas
  actions com a chave de serviço depois de conferir sessão e papel).
- A escolha do próximo precisa ser atômica (dois leads no mesmo segundo não
  vão para o mesmo corretor): função no banco que avança `ultimo_indice`.
- O webhook faz o repasse depois de responder 200 (`after()`), para não
  segurar a entrega da Evolution.
