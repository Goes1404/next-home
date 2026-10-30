import Link from "next/link";
import { Sparkles, TriangleAlert, Wrench, X } from "lucide-react";
import { linkExterno, ROTULO_DO_TIPO, type TipoDeAviso } from "@/lib/plataforma/avisoAosClientes";
import estilos from "./faixaDoAviso.module.css";

/**
 * A faixa de UM aviso da Astro (0242, 29/10/2026). Só desenho: quem decide
 * se aparece e guarda o "fechei" é `AvisosDaAstro` (painel); a prévia de
 * `/plataforma/avisos` usa este mesmo componente, então o que o
 * administrador vê ao escrever é exatamente o que o cliente vai ver.
 *
 * Sem `onFechar` (a prévia), o X aparece mas não age.
 */

const ICONE: Record<TipoDeAviso, typeof Sparkles> = {
  importante: TriangleAlert,
  manutencao: Wrench,
  novidade: Sparkles,
};

export type DadosDaFaixa = {
  titulo: string;
  texto: string;
  tipo: TipoDeAviso;
  link: string | null;
};

export function FaixaDoAviso({
  aviso,
  onFechar,
  saindo = false,
  onFimDaSaida,
}: {
  aviso: DadosDaFaixa;
  onFechar?: () => void;
  saindo?: boolean;
  onFimDaSaida?: () => void;
}) {
  const Icone = ICONE[aviso.tipo];
  const externo = aviso.link ? linkExterno(aviso.link) : false;
  return (
    <div
      role="status"
      data-tipo={aviso.tipo}
      className={`${estilos.faixa} ${estilos[aviso.tipo]} ${saindo ? estilos.saindo : ""}`}
      onAnimationEnd={saindo ? onFimDaSaida : undefined}
    >
      <span aria-hidden className={estilos.icone}>
        <Icone className="size-4" strokeWidth={2} />
      </span>
      <div className={estilos.conteudo}>
        <p className="text-fluid-sm text-titulo leading-snug">
          <span className="sr-only">{ROTULO_DO_TIPO[aviso.tipo]} da Astro: </span>
          <strong className="font-semibold">{aviso.titulo}</strong>
          <span className="text-corpo"> {aviso.texto}</span>
          {aviso.link && (
            <>
              {" "}
              {externo ? (
                <a href={aviso.link} target="_blank" rel="noopener noreferrer" className={`text-fluid-sm ${estilos.link}`}>
                  Saiba mais <span aria-hidden className={estilos.seta}>→</span>
                  <span className="sr-only"> (abre em outra aba)</span>
                </a>
              ) : (
                <Link href={aviso.link} className={`text-fluid-sm ${estilos.link}`}>
                  Saiba mais <span aria-hidden className={estilos.seta}>→</span>
                </Link>
              )}
            </>
          )}
        </p>
      </div>
      {onFechar ? (
        <button type="button" onClick={onFechar} className={estilos.fechar} aria-label={`Fechar o aviso: ${aviso.titulo}`}>
          <X className="size-4" aria-hidden />
        </button>
      ) : (
        <span aria-hidden className={estilos.fechar}>
          <X className="size-4" />
        </span>
      )}
    </div>
  );
}
