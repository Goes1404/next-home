"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { AlertTriangle, Send } from "lucide-react";
import {
  enviarAgoraParaTodosOsLeads,
  listarLeadsElegiveis,
  type CampanhaListada,
} from "../acoes";

/**
 * "Enviar agora para todos os leads", a qualquer hora.
 *
 * Existe porque a janela de horário comercial (`antiBan.ts`) é uma regra de
 * REPUTAÇÃO, não de sistema: campanha às 3h é a assinatura mais clara de
 * robô que existe, e quem recebe oferta de madrugada denuncia. Mas há
 * momentos em que o corretor precisa avisar a carteira inteira agora — um
 * lançamento que abriu, uma unidade que saiu — e a regra não pode virar
 * uma parede sem porta.
 *
 * A porta é esta, e ela tem três cuidados de propósito:
 *
 *  1. **Confirmação em dois toques.** O primeiro clique mostra para quantas
 *     pessoas vai e pede confirmação. Disparo para a carteira inteira não
 *     se desfaz — a mensagem já está no celular de todo mundo.
 *  2. **O aviso aparece quando é de madrugada, não sempre.** Alerta que
 *     está sempre aceso vira paisagem (mesma régua de `situacaoDaTarefa`);
 *     este só acende quando o horário é de fato ruim.
 *  3. **Nada além da janela é afrouxado.** O espaçamento de 35-75s entre
 *     mensagens, a cota diária da curva de aquecimento e o disjuntor de
 *     falhas continuam valendo. São eles que protegem o NÚMERO; a janela
 *     protege a reputação junto a quem recebe.
 */

/** Fora disto, disparo é madrugada de verdade — e o aviso acende. */
const HORA_CIVIL_INICIO = 8;
const HORA_CIVIL_FIM = 21;

function horaEmSaoPaulo(): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
}

export function EnvioImediato({
  aoEnviar,
}: {
  aoEnviar: (campanha: CampanhaListada, aviso: string) => void;
}) {
  const [mensagem, setMensagem] = useState("");
  const [quantos, setQuantos] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarEnvio] = useTransition();
  /* A hora só existe no cliente: calculada no servidor daria um valor no
     HTML e outro depois da hidratação. `useSyncExternalStore` é o mesmo
     mecanismo que `FundoVideoIntro` usa para isso — devolve null no
     servidor e o valor real no navegador. O snapshot é estável porque a
     hora não muda entre dois renders. */
  const horaAgora = useSyncExternalStore(
    () => () => {},
    () => horaEmSaoPaulo(),
    () => null,
  );

  const foraDoHorarioCivil =
    horaAgora !== null && (horaAgora < HORA_CIVIL_INICIO || horaAgora >= HORA_CIVIL_FIM);

  function pedirConfirmacao() {
    setErro(null);
    if (mensagem.trim().length < 10) {
      setErro("Escreva a mensagem que vai para os leads.");
      return;
    }
    iniciarEnvio(async () => {
      const leads = await listarLeadsElegiveis("todos");
      if (leads.length === 0) {
        setErro("Nenhum lead com telefone na sua carteira.");
        return;
      }
      setQuantos(leads.length);
      setConfirmando(true);
    });
  }

  function enviar() {
    setErro(null);
    iniciarEnvio(async () => {
      const resultado = await enviarAgoraParaTodosOsLeads({ mensagemBase: mensagem });
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      setConfirmando(false);
      setMensagem("");
      setQuantos(null);
      aoEnviar(
        {
          id: resultado.campanhaId,
          titulo: "Envio imediato",
          empreendimentoNome: null,
          totalLeads: resultado.totalLeads,
          totalEnviados: 0,
          totalRespondidos: 0,
          status: "em_andamento",
          criadoEm: new Date().toISOString(),
        },
        `Saindo para ${resultado.totalLeads} lead${resultado.totalLeads === 1 ? "" : "s"}, uma mensagem a cada minuto — independente do horário.`,
      );
    });
  }

  return (
    <section className="border-linha bg-superficie rounded-2xl border p-5 sm:p-6">
      <h2 className="text-fluid-base text-titulo font-medium">Enviar agora para todos os leads</h2>
      <p className="text-fluid-xs text-apoio mt-1.5">
        Vai para a carteira inteira a qualquer hora, sem esperar o horário comercial. O intervalo
        entre uma mensagem e outra continua valendo — é ele que protege seu número.
      </p>

      <textarea
        rows={3}
        value={mensagem}
        onChange={(e) => {
          setMensagem(e.target.value);
          setConfirmando(false);
        }}
        placeholder="Ex.: Oi {nome}, abriu uma unidade no {imovel} que combina com o que você procurava."
        aria-label="Mensagem para todos os leads"
        className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento mt-4 w-full rounded-xl border p-3.5 focus:outline-none"
      />
      <p className="text-fluid-xs text-tenue mt-1.5">
        <code className="bg-chip rounded px-1">{"{nome}"}</code> vira o nome da pessoa.
      </p>

      {foraDoHorarioCivil && !confirmando && (
        <p className="text-fluid-xs text-alerta border-alerta-linha bg-alerta-lavado mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5">
          <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          São {horaAgora}h agora. Mensagem de propaganda nesse horário é o que mais gera denúncia —
          e denúncia é o que derruba um número de vez.
        </p>
      )}

      {confirmando && quantos !== null && (
        <div className="border-perigo-linha bg-perigo-lavado mt-3 rounded-xl border px-3.5 py-3">
          <p className="text-fluid-sm text-titulo font-medium">
            Enviar para {quantos} lead{quantos === 1 ? "" : "s"}, agora?
          </p>
          <p className="text-fluid-xs text-apoio mt-1">
            Não dá para desfazer depois que a primeira sair.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="text-fluid-sm border-perigo-linha bg-perigo-lavado text-perigo flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-opacity hover:opacity-80 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {enviando ? "Enviando…" : `Sim, enviar para ${quantos}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="text-fluid-sm border-linha-forte text-corpo hover:text-titulo min-h-11 cursor-pointer rounded-xl border px-4 transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!confirmando && (
        <button
          type="button"
          onClick={pedirConfirmacao}
          disabled={enviando}
          className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo mt-4 flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {enviando ? "Conferindo…" : "Enviar para todos, a qualquer hora"}
        </button>
      )}

      {erro && (
        <p role="alert" className="text-fluid-xs text-alerta mt-3">
          {erro}
        </p>
      )}
    </section>
  );
}
