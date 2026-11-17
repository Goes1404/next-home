"use client";

import { useActionState, useState } from "react";
import { TEXTO_MAXIMO, previsaoDaFila, textoDoCorretor, validarTexto } from "@/lib/central/comunicadoRegras";
import { criarComunicado, type ResultadoDoComunicado } from "../comunicadosAcoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

const TEXTO_PADRAO = `Oi, {nome}! Aqui é da Astro 🚀 Algumas novidades do CRM nas últimas semanas:

🎙 *Áudio mais esperto:* o número central agora entende os termos do CRM e o nome dos imóveis quando você manda áudio.

📢 *Lista de transmissão com filtro:* peça, por exemplo, "manda o Vitra para quem está em conversa" ou "para quem está parado há 7 dias". Sai do seu WhatsApp, uma mensagem por vez, no ritmo seguro do número.

🎨 *Arte pelo WhatsApp:* peça a arte de um imóvel com a frase que quiser, como "arte do Vitra com 'últimas unidades'". Ela usa a foto do imóvel.

Qualquer dúvida, é só responder aqui. Boas vendas!`;

/**
 * O comunicado de uma imobiliária (0260): o texto com {nome}, a prévia de
 * como chega para o primeiro da lista e a confirmação. O servidor relê a
 * lista e valida de novo, com a guarda.
 */
export function NovoComunicado({ grupoId, grupoNome, nomes }: { grupoId: string; grupoNome: string; nomes: string[] }) {
  const [estado, enviar, pendente] = useActionState<ResultadoDoComunicado | undefined, FormData>(criarComunicado, undefined);
  const [texto, setTexto] = useState(TEXTO_PADRAO);
  const [confirmo, setConfirmo] = useState(false);
  const validado = validarTexto(texto);
  const exemplo = nomes.length > 0 ? textoDoCorretor(texto, nomes[0], 0) : "";

  if (estado?.ok) {
    return <p className="cartao text-fluid-sm text-ok p-5">{estado.mensagem}</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form action={enviar} className="cartao flex flex-col gap-4 p-5">
        <h2 className="text-titulo text-fluid-lg font-medium">Mensagem para {grupoNome}</h2>
        <input type="hidden" name="grupo" value={grupoId} />
        <label className="flex flex-col gap-2">
          <span className="text-fluid-sm text-apoio">
            Use <code>{"{nome}"}</code> para o primeiro nome de cada corretor. O &quot;Oi&quot; do começo varia de um para o outro.
          </span>
          <textarea
            name="texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={16}
            maxLength={TEXTO_MAXIMO}
            className={CAMPO}
          />
          <span className="text-fluid-xs text-tenue tabular-nums">
            {texto.length}/{TEXTO_MAXIMO}
          </span>
        </label>
        <label className="text-fluid-sm text-titulo flex min-h-11 items-start gap-3">
          <input type="checkbox" name="confirmo" value="sim" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} className="mt-1" />
          <span>
            Revisei a mensagem e a lista. Mandar para {nomes.length} {nomes.length === 1 ? "corretor" : "corretores"} pelo número central, um a
            cada 5 min, das 9h às 21h, de segunda a sábado, até 10 por dia ({previsaoDaFila(nomes.length)}).
          </span>
        </label>
        {!validado.ok && texto.length > 0 && <p className="text-fluid-sm text-perigo">{validado.erro}</p>}
        {estado && !estado.ok && <p className="text-fluid-sm text-perigo">{estado.erro}</p>}
        <button
          type="submit"
          disabled={pendente || !confirmo || !validado.ok || nomes.length === 0}
          className="botao-primario text-fluid-sm min-h-11 rounded-xl px-5 font-medium disabled:opacity-50"
        >
          {pendente ? "Colocando na fila…" : `Começar o envio para ${nomes.length}`}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-titulo text-fluid-lg font-medium">Como chega para {nomes[0] ?? "o primeiro"}</h2>
        <p className="cartao text-fluid-sm text-titulo p-5 whitespace-pre-wrap">{exemplo || "—"}</p>
      </div>
    </div>
  );
}
