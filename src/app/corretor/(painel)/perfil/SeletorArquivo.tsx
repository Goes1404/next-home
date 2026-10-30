"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import type { EstadoForm } from "@/app/corretor/actions";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { prepararImagemParaEnvio, type OpcoesDeReducao } from "@/lib/imagem/reduzir";

/**
 * O corpo de uma função da Vercel aceita no máximo 4,5 MB. Acima disso o
 * pedido é recusado ANTES de chegar ao servidor e a Server Action lança no
 * navegador — era a tela "Não conseguimos carregar esta página" ao trocar a
 * foto do perfil com uma foto de celular (30/10/2026). Imagem agora é
 * reduzida no navegador; o que não dá para reduzir (vídeo) é barrado aqui.
 */
export const TETO_DO_CORPO_DA_VERCEL = 4 * 1024 * 1024;

export function SeletorArquivo({
  action,
  accept,
  rotulo,
  dica,
  reducao,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  accept: string;
  rotulo: string;
  dica: string;
  /** Imagem: reduzir no navegador antes de enviar. Sem isto, o arquivo vai como está. */
  reducao?: OpcoesDeReducao;
}) {
  // A action nunca derruba a página: falha de rede ou corpo recusado vira aviso.
  const [estado, dispatch, pendente] = useActionState(async (anterior: EstadoForm, dados: FormData): Promise<EstadoForm> => {
    try {
      return await action(anterior, dados);
    } catch (erro) {
      return { erro: ehActionDeOutroBuild(erro) ? avisoDePaginaVelha() : "Não foi possível enviar agora. Tente de novo." };
    }
  }, undefined);
  const [preparando, iniciar] = useTransition();
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const ocupado = pendente || preparando;

  function aoEscolher() {
    const arquivo = campo.current?.files?.[0];
    if (campo.current) campo.current.value = "";
    if (!arquivo) return;
    setAvisoLocal(null);
    iniciar(async () => {
      let paraEnviar: File = arquivo;
      if (reducao && arquivo.type.startsWith("image/")) {
        const preparo = await prepararImagemParaEnvio(arquivo, reducao);
        if (!preparo.ok) {
          setAvisoLocal(preparo.erro);
          return;
        }
        paraEnviar = preparo.arquivo;
      }
      if (paraEnviar.size > TETO_DO_CORPO_DA_VERCEL) {
        const mb = Math.floor(TETO_DO_CORPO_DA_VERCEL / (1024 * 1024));
        setAvisoLocal(`Arquivo grande demais para enviar. Escolha um de até ${mb} MB.`);
        return;
      }
      const dados = new FormData();
      dados.set("arquivo", paraEnviar);
      // Depois de um await, a action precisa de uma transição própria.
      startTransition(() => dispatch(dados));
    });
  }

  const erro = avisoLocal ?? estado?.erro;
  return (
    <div>
      <label className="text-fluid-sm inline-flex cursor-pointer items-center gap-2 rounded-full border border-linha-forte px-4 py-2 text-corpo transition-colors hover:border-acento-linha">
        {preparando ? "Preparando…" : pendente ? "Enviando…" : rotulo}
        <input
          ref={campo}
          type="file"
          name="arquivo"
          accept={accept}
          disabled={ocupado}
          className="hidden"
          onChange={aoEscolher}
        />
      </label>
      <p className="text-fluid-xs mt-1 text-tenue">{dica}</p>
      {erro && <p className="text-fluid-xs mt-1 text-perigo">{erro}</p>}
      {!avisoLocal && estado?.ok && <p className="text-fluid-xs mt-1 text-acento-suave">{estado.ok}</p>}
    </div>
  );
}
