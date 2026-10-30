// A central de ajuda da Astro (`/ajuda`), 29/10/2026.
//
// Módulo PURO: os artigos são objetos TS (sem MDX nem dependência nova), lidos
// pelas páginas públicas e pela busca do navegador (`busca.ts`). Português
// simples, frases curtas, passo a passo com o nome EXATO dos botões e menus
// do painel. Genérico para qualquer ramo (imobiliária, seguros, advocacia,
// comércio): o que só existe para imobiliária está dito no próprio texto.
//
// Mudou um menu ou um botão no painel? Mude o artigo junto: ajuda com o nome
// errado do botão é pior que nenhuma.

export type SecaoDoArtigo = {
  titulo?: string;
  paragrafos?: string[];
  /** Passo a passo numerado. */
  passos?: string[];
};

export type Artigo = {
  slug: string;
  titulo: string;
  /** Uma frase: aparece na lista e na busca. */
  resumo: string;
  /** Palavras que a pessoa digitaria sem saber o nome certo ("qr code", "boleto"). */
  palavras: string[];
  secoes: SecaoDoArtigo[];
};

export const ARTIGOS_DE_AJUDA: Artigo[] = [
  {
    slug: "conectar-o-whatsapp",
    titulo: "Conectar o WhatsApp",
    resumo: "Ligue o seu número ao CRM para as conversas e a IA funcionarem.",
    palavras: ["qr code", "qrcode", "número", "celular", "conexão", "desconectou", "caiu", "whatsapp web", "aparelhos conectados"],
    secoes: [
      {
        paragrafos: [
          "O CRM lê e envia as mensagens do seu WhatsApp do mesmo jeito que o WhatsApp Web. Cada pessoa da equipe conecta o próprio número.",
        ],
      },
      {
        titulo: "Passo a passo",
        passos: [
          "No painel, abra o menu Assistente → Minha IA.",
          "Toque em Conectar agora. Aparece um QR code na tela.",
          "No celular, abra o WhatsApp → Configurações (ou os três pontinhos) → Aparelhos conectados → Conectar um aparelho.",
          "Aponte a câmera do celular para o QR code. Em alguns segundos a tela mostra que o número está conectado.",
        ],
      },
      {
        titulo: "Se cair",
        paragrafos: [
          "Quando o número sai do ar, aparece uma faixa no topo do painel. Repita o passo a passo. Se o WhatsApp pediu para você entrar de novo no celular, ou se o número foi trocado de aparelho, a conexão sempre precisa ser refeita.",
          "Um número só pode estar ligado a uma conta da Astro por vez. Para usar em outra conta, desconecte antes.",
          "O WhatsApp pode restringir números que mandam muitas mensagens para quem não os conhece. O CRM espaça os envios para diminuir esse risco, mas não consegue impedi-lo.",
        ],
      },
    ],
  },
  {
    slug: "avisos-no-celular",
    titulo: "Ligar os avisos no celular",
    resumo: "Receba notificação de lead novo, cliente esperando e compromisso daqui a 1 hora.",
    palavras: ["notificação", "notificacoes", "push", "alerta", "iphone", "android", "tela de início", "aplicativo", "app"],
    secoes: [
      {
        passos: [
          "Abra o painel no celular (pelo navegador ou pelo app da Astro).",
          "Toque no seu nome, no canto de cima, → Meu perfil.",
          "Toque em Ligar avisos neste celular e permita as notificações quando o celular perguntar.",
          "Toque em Enviar notificação de teste para conferir.",
        ],
      },
      {
        titulo: "No iPhone",
        paragrafos: [
          "O iPhone só manda aviso de site que foi adicionado à tela de início: no Safari, toque em Compartilhar → Adicionar à Tela de Início, abra o painel por esse atalho e ligue os avisos de lá.",
        ],
      },
      {
        titulo: "Não chegou?",
        paragrafos: [
          "Se o painel disser que as notificações estão bloqueadas, libere em Configurações → Notificações do navegador e volte ao Meu perfil. Os avisos valem para o aparelho em que você ligou: no computador e no celular, ligue nos dois.",
        ],
      },
    ],
  },
  {
    slug: "importar-leads",
    titulo: "Importar leads de uma planilha",
    resumo: "Traga sua lista de contatos do Excel, do Google Planilhas ou de um CSV.",
    palavras: ["planilha", "excel", "csv", "google planilhas", "lista", "contatos", "subir", "colar", "importação"],
    secoes: [
      {
        passos: [
          "No menu Leads, abra Lista e toque em + Adicionar leads.",
          "Copie as linhas da planilha (com o cabeçalho) e cole no campo da tela. Também funciona com um arquivo CSV ou uma lista solta de nomes e telefones.",
          "Confira a prévia: o CRM mostra as colunas que reconheceu (nome, telefone, e-mail). Tire as colunas que não quer trazer.",
          "Toque em importar. Contato que já existe no CRM (mesmo telefone) não é duplicado.",
        ],
      },
      {
        titulo: "Dicas",
        paragrafos: [
          "Telefone com DDD funciona melhor. Se a planilha mostra números cortados (como 5,51198E+12), cole mesmo assim: o CRM recupera o número inteiro quando a planilha manda a versão completa.",
          "Importe só pessoas que podem receber contato seu (pela LGPD).",
        ],
      },
    ],
  },
  {
    slug: "funil",
    titulo: "Usar o funil de vendas",
    resumo: "Veja em que etapa está cada cliente e mova o card conforme a conversa anda.",
    palavras: ["etapas", "kanban", "card", "pipeline", "negociação", "fechado", "perdido", "arrastar"],
    secoes: [
      {
        paragrafos: [
          "O funil mostra os seus leads em colunas, uma por etapa, do primeiro contato ao fechamento. É a mesma carteira de Leads, vista por etapa.",
        ],
      },
      {
        titulo: "Passo a passo",
        passos: [
          "No menu Leads, abra Funil.",
          "Arraste o card do cliente para a etapa nova (no celular, abra o card e escolha a etapa).",
          "Ao marcar como perdido, informe o motivo: ele aparece nos relatórios e ajuda a entender onde os clientes desistem.",
        ],
      },
      {
        paragrafos: [
          "Para o gestor: em Administração → Leads da equipe, o funil mostra a carteira de todos. Os nomes das etapas são os mesmos para qualquer ramo.",
        ],
      },
    ],
  },
  {
    slug: "agenda",
    titulo: "Agenda e compromissos",
    resumo: "Marque visitas, reuniões e atendimentos, e receba o lembrete antes.",
    palavras: ["visita", "reunião", "compromisso", "horário", "lembrete", "calendário", "google agenda", "marcar"],
    secoes: [
      {
        passos: [
          "No menu Leads, abra Agenda.",
          "Toque em novo compromisso, escolha o cliente, o dia e o horário.",
          "Você recebe um aviso 1 hora antes (se os avisos no celular estiverem ligados).",
        ],
      },
      {
        paragrafos: [
          "Quando a IA de atendimento combina um horário com o cliente no WhatsApp, o compromisso entra sozinho na agenda de quem atende.",
          "Em imobiliárias, a agenda também guarda as visitas a imóveis, com o endereço do imóvel.",
        ],
      },
    ],
  },
  {
    slug: "roleta-de-leads",
    titulo: "Roleta: distribuir os leads entre a equipe",
    resumo: "Reparta automaticamente os contatos que chegam dos anúncios e do site.",
    palavras: ["distribuição", "rodízio", "fila", "anúncios", "meta", "facebook", "instagram", "repartir", "escala"],
    secoes: [
      {
        paragrafos: [
          "A roleta entrega cada lead novo para uma pessoa da equipe, em rodízio, para ninguém ficar sem e nenhum cliente ficar esperando. Só entra na roleta quem está com o WhatsApp conectado e não está em pausa.",
        ],
      },
      {
        titulo: "Para o gestor",
        passos: [
          "Abra Administração → Contas e confira quem está na escala de distribuição.",
          "No menu Marketing, abra Anúncios pagos, ligue a roleta e escolha quem participa.",
          "Quem sair de férias pode ficar em pausa: a roleta pula essa pessoa até ela voltar.",
        ],
      },
      {
        paragrafos: ["Conta de uma pessoa só (profissional independente) não precisa de roleta: todo lead já é seu."],
      },
    ],
  },
  {
    slug: "convidar-a-equipe",
    titulo: "Convidar a equipe",
    resumo: "Crie o acesso de cada pessoa e escolha se ela é gestor ou atende.",
    palavras: ["usuário", "acesso", "login", "convite", "corretor", "atendente", "funcionário", "gestor", "papel", "desativar"],
    secoes: [
      {
        passos: [
          "Abra Administração → Contas.",
          "Na pessoa da equipe, toque em Convidar e informe o e-mail dela.",
          "A pessoa recebe um e-mail com o link para criar a senha. O link vale por tempo limitado: se vencer, toque em Reenviar convite.",
          "A pessoa ainda não aparece na lista? Peça pelo Suporte da Astro: a Astro cadastra o acesso novo dentro do limite do plano.",
        ],
      },
      {
        titulo: "Gestor ou não",
        paragrafos: [
          "Gestor vê a equipe inteira, os números e a administração. As outras pessoas veem só os próprios clientes.",
          "Quando alguém sair da equipe, desative o acesso em Contas: os clientes dela podem ser repassados para outra pessoa.",
          "O número de pessoas segue o plano da conta. Para aumentar, fale com o suporte da Astro.",
        ],
      },
    ],
  },
  {
    slug: "ia-de-atendimento",
    titulo: "IA de atendimento no WhatsApp",
    resumo: "A assistente responde seus clientes, tira dúvidas e marca horários quando você não pode.",
    palavras: ["assistente", "robô", "bot", "inteligência artificial", "resposta automática", "chatgpt", "pausar", "modo"],
    secoes: [
      {
        passos: [
          "Conecte o WhatsApp (veja o artigo Conectar o WhatsApp).",
          "Em Assistente → Minha IA, escolha quando a IA responde: o dia todo, só fora do horário, ou como copiloto (ela espera você alguns minutos antes de responder).",
          "Confira de vez em quando as conversas em WhatsApp e marque as respostas boas e ruins: é assim que ela melhora.",
        ],
      },
      {
        titulo: "O que saber",
        paragrafos: [
          "A IA pode errar. Assuma a conversa sempre que precisar: quando você responde, ela se cala naquela conversa.",
          "Ela tem um limite de respostas por mês, do plano da conta. Quando acaba, ela para e o atendimento segue com a equipe; o painel avisa antes.",
          "Em imobiliárias, a IA também manda fotos, plantas e a localização dos imóveis do catálogo.",
        ],
      },
    ],
  },
  {
    slug: "listas-de-transmissao",
    titulo: "Listas de transmissão",
    resumo: "Mande a mesma mensagem para vários clientes, uma a uma, com pausa entre elas.",
    palavras: ["disparo", "campanha", "mensagem em massa", "envio", "lista", "promoção", "novidade"],
    secoes: [
      {
        passos: [
          "No menu Marketing, abra Listas de transmissão.",
          "Escolha os clientes (por etapa, origem ou à mão) e escreva a mensagem. Use o nome do cliente para ficar pessoal.",
          "Confirme. As mensagens saem sozinhas, uma a uma, com intervalo e só no horário comercial, para proteger o seu número.",
        ],
      },
      {
        titulo: "Cuidados",
        paragrafos: [
          "Mande só para quem conhece você e pode receber a mensagem. Quem pedir para sair da lista não recebe mais.",
          "O plano tem um limite de mensagens de lista por mês; o painel mostra quanto resta.",
        ],
      },
    ],
  },
  {
    slug: "cobranca-e-pagamento",
    titulo: "Cobrança e pagamento da mensalidade",
    resumo: "Como pagar, o que acontece no atraso e como mudar de plano.",
    palavras: ["boleto", "pix", "cartão", "fatura", "mensalidade", "vencimento", "atraso", "suspenso", "plano", "teste grátis", "nota"],
    secoes: [
      {
        paragrafos: [
          "A mensalidade vence todo mês no dia de vencimento da conta. Pode ser paga por Pix, boleto ou cartão.",
          "Quando a fatura está aberta, o gestor vê uma faixa no topo do painel com o botão Pagar agora.",
        ],
      },
      {
        titulo: "Atraso",
        paragrafos: [
          "Depois do vencimento há alguns dias de tolerância, avisados na faixa. Passado esse prazo sem pagamento, a conta é suspensa: o painel e a IA param, mas nada é apagado. O pagamento reativa a conta.",
          "No teste grátis, a primeira mensalidade vence no fim do teste. Sem o pagamento, a conta é suspensa no mesmo dia, sem custo.",
        ],
      },
      {
        titulo: "Mudar de plano ou cancelar",
        paragrafos: [
          "Fale com o suporte da Astro (menu da sua conta → Suporte da Astro). Cancelar não tem multa; os dados ficam guardados por 90 dias e depois são apagados.",
        ],
      },
    ],
  },
  {
    slug: "trocar-a-senha",
    titulo: "Trocar a senha ou recuperar o acesso",
    resumo: "Troque a senha pelo painel ou peça um link novo se esqueceu.",
    palavras: ["senha", "esqueci", "recuperar", "login", "entrar", "acesso", "bloqueado", "90 dias"],
    secoes: [
      {
        titulo: "Trocar a senha",
        passos: ["Toque no seu nome, no canto de cima, → Trocar senha.", "Digite a senha atual e a nova, e salve."],
      },
      {
        titulo: "Esqueci a senha",
        passos: [
          "Na tela de entrar, toque em Esqueci a senha.",
          "Informe o seu e-mail. Chega um link para criar a senha nova.",
          "Não chegou? Confira o spam. O gestor da conta também pode mandar um link novo em Administração → Contas.",
        ],
      },
      {
        paragrafos: [
          "Por segurança, o painel pede uma senha nova a cada 90 dias. Não compartilhe a senha: cada pessoa da equipe tem o próprio acesso.",
        ],
      },
    ],
  },
  {
    slug: "suporte",
    titulo: "Falar com o suporte da Astro",
    resumo: "Abra um chamado pelo painel e acompanhe a resposta.",
    palavras: ["ajuda", "contato", "chamado", "problema", "erro", "dúvida", "sugestão", "atendimento", "falar"],
    secoes: [
      {
        passos: [
          "Toque no seu nome, no canto de cima, → Suporte da Astro.",
          "Escolha o assunto, descreva o que aconteceu e envie.",
          "A equipe responde em até 1 dia útil. O andamento aparece na mesma tela, em Seus chamados.",
        ],
      },
      {
        titulo: "Para ajudar a resolver rápido",
        paragrafos: [
          "Diga em que tela estava, o que tentou fazer e o que apareceu. Não cole dados de clientes (nome, telefone) na mensagem: se precisar, a Astro chama você.",
          "Para ver um problema da sua conta, o suporte pode abrir uma visão só com números e contagens, sem conversas nem fichas. Todo acesso fica registrado e o gestor vê a lista na visão geral.",
        ],
      },
    ],
  },
];

/** O artigo pelo endereço; `null` quando não existe. */
export function artigoPorSlug(slug: string): Artigo | null {
  return ARTIGOS_DE_AJUDA.find((a) => a.slug === slug) ?? null;
}
