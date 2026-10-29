import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { FONTES_DA_ASTRO } from "@/lib/fontesDaAstro";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { COR_DA_BARRA_DO_ACESSO } from "./ComportamentoDeApp";
import s from "./telaDeAcesso.module.css";

/**
 * A casca das telas de ACESSO da Astro Soluções (29/10/2026): entrar,
 * esqueci a senha, criar senha (link do convite) e trocar senha.
 *
 * Antes, só o login tinha a marca da Astro; as outras três usavam a paleta do
 * site e saíam verdes da Next Home ("está puxando um verde da Next"). Agora
 * as quatro são o mesmo céu azul animado com a folha clara presa ao pé (no
 * computador, o cartão à direita). CSS em `telaDeAcesso.module.css`.
 *
 * Os formulários continuam os de sempre: usam os tokens do painel, que a
 * folha reaponta para a paleta clara e azul da Astro (`TOKENS_DA_FOLHA`).
 */

/** Estrelas em posições fixas (nada de sorteio: daria divergência de hidratação). */
const ESTRELAS = Array.from({ length: 18 }, (_, i) => ({
  top: `${(i * 37 + 7) % 46}%`,
  left: `${(i * 61 + 13) % 100}%`,
}));

/** Os tokens dos formulários na paleta da Astro (folha clara, acento azul). */
export const TOKENS_DA_FOLHA = {
  "--color-acento": "#2f5ea8",
  "--color-acento-hover": "#244c8c",
  "--color-acento-suave": "#244c8c",
  "--color-acento-linha": "rgb(47 94 168 / 0.38)",
  "--color-acento-lavado": "rgb(47 94 168 / 0.12)",
  "--color-sobre-cor": "#ffffff",
  "--color-superficie": "#ffffff",
  "--color-elevado": "#f3f6fb",
  "--color-linha": "#e3e8f1",
  "--color-linha-forte": "#cfd7e6",
  "--color-titulo": "#0d1b33",
  "--color-corpo": "#34405a",
  "--color-apoio": "#56627b",
  "--color-tenue": "#6b7690",
  "--color-vidro": "rgb(13 27 51 / 0.05)",
} as CSSProperties;

export function TelaDeAcesso({
  titulo,
  apoio,
  chamada,
  textoDaChamada,
  recursos,
  aviso,
  rodape,
  children,
}: {
  /** O título da folha ("Entrar", "Esqueci a senha"…). */
  titulo: string;
  apoio?: ReactNode;
  /** A frase grande do céu. */
  chamada: string;
  textoDaChamada?: string;
  /** Lista só do computador, ao lado da chamada (o login usa). */
  recursos?: readonly string[];
  /** Faixa de aviso acima do formulário (link vencido etc.). */
  aviso?: ReactNode;
  /** Links ao pé da folha, antes da linha final. */
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const [nomeA, nomeB] = MARCA_DA_PLATAFORMA.wordmark;
  return (
    // `data-astro` tira as cores da Next do documento; `data-cor-da-barra`
    // pinta a barra de status do celular no marinho do céu (SCRIPT_DA_BARRA).
    <main data-astro="acesso" data-cor-da-barra={COR_DA_BARRA_DO_ACESSO} className={`${FONTES_DA_ASTRO} ${s.tela}`}>
      <div aria-hidden className={s.ceu}>
        <span className={s.nevoa} />
        <span className={s.nevoa} />
        <span className={s.nevoa} />
        <span className={s.cometa} />
        <svg className={s.orbita} viewBox="0 0 320 100" preserveAspectRatio="none">
          <ellipse cx="160" cy="50" rx="158" ry="48" pathLength={1} />
        </svg>
        <svg className={s.estrelaGrande} viewBox="0 0 24 24">
          <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="#fff" />
        </svg>
        {ESTRELAS.map((e, i) => (
          <span key={i} className={s.ponto} style={{ top: e.top, left: e.left }} />
        ))}
      </div>

      <section className={s.topo}>
        <p className={`${s.titulo} ${s.marca}`}>
          <SeloAstro className="size-9" />
          <span>
            {nomeA}
            <span>{nomeB}</span>
          </span>
        </p>
        <h2 className={`${s.titulo} ${s.chamada}`}>{chamada}</h2>
        {textoDaChamada && <p className={s.apoio}>{textoDaChamada}</p>}
        {recursos && (
          <ul className={s.recursos}>
            {recursos.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.folha} style={TOKENS_DA_FOLHA} aria-labelledby="titulo-da-folha">
        <h1 id="titulo-da-folha" className={`${s.titulo} ${s.folhaTitulo}`}>
          {titulo}
        </h1>
        {apoio && <div className={s.folhaApoio}>{apoio}</div>}
        {aviso && (
          <div role="alert" className={s.aviso}>
            {aviso}
          </div>
        )}

        {children}

        {rodape}

        <footer className={s.rodape}>
          <span>© {MARCA_DA_PLATAFORMA.nome}</span>
          <nav aria-label="Documentos">
            <Link href="/astro/privacidade">Privacidade</Link>
            <Link href="/astro/termos">Termos</Link>
          </nav>
        </footer>
      </section>
    </main>
  );
}

/** Link secundário de largura inteira ao pé da folha ("Voltar para entrar"). */
export function LinkDaFolha({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={s.voltar}>
      {children}
    </Link>
  );
}
