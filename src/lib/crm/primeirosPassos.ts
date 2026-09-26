/**
 * Os primeiros passos de cada corretor (26/09/2026) — regras puras.
 *
 * A medição que motiva: em produção, 1 de 7 corretores com WhatsApp
 * conectado, 1 com agenda preenchida, 0 leads. Nada do que o sistema faz
 * (assistente, avisos, resumo, campanhas) produz efeito para quem não
 * configurou. Cada passo diz POR QUE importa, não só o que falta: "conecte
 * o WhatsApp" sem motivo é tarefa; "sem ele a assistente não atende ninguém"
 * é razão.
 */

export type EstadoDaConfiguracao = {
  whatsappConectado: boolean;
  faixasDeAgenda: number;
  temFoto: boolean;
  temApresentacao: boolean;
  leads: number;
};

export type Passo = {
  id: "whatsapp" | "agenda" | "perfil" | "carteira";
  titulo: string;
  porque: string;
  href: string;
  feito: boolean;
};

export function passosDoCorretor(e: EstadoDaConfiguracao): Passo[] {
  return [
    {
      id: "whatsapp",
      titulo: "Conectar seu WhatsApp",
      porque: "Sem ele a assistente não atende ninguém e nenhum aviso chega até você.",
      href: "/corretor/whatsapp",
      feito: e.whatsappConectado,
    },
    {
      id: "agenda",
      titulo: "Preencher sua agenda de visitas",
      porque: "Sem os seus horários, a assistente não consegue marcar visita.",
      href: "/corretor/visitas",
      feito: e.faixasDeAgenda > 0,
    },
    {
      id: "perfil",
      titulo: "Foto e apresentação no seu perfil",
      porque: "É o que o cliente vê na sua página e nos links que você manda.",
      href: "/corretor/perfil",
      feito: e.temFoto && e.temApresentacao,
    },
    {
      id: "carteira",
      titulo: "Trazer sua carteira de clientes",
      porque: "Planilha, contatos ou conversa exportada do WhatsApp. A assistente só responde quem está na sua carteira.",
      href: "/corretor/importar",
      feito: e.leads > 0,
    },
  ];
}

export function configuracaoCompleta(e: EstadoDaConfiguracao): boolean {
  return passosDoCorretor(e).every((p) => p.feito);
}

/** "2 de 4" — quanto do caminho já foi feito. */
export function progressoDaConfiguracao(e: EstadoDaConfiguracao): { feitos: number; total: number } {
  const passos = passosDoCorretor(e);
  return { feitos: passos.filter((p) => p.feito).length, total: passos.length };
}
