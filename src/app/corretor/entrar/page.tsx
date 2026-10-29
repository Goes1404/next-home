import { SeloAstro } from "@/components/marca/SeloAstro";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { FONTES_DA_ASTRO } from "@/lib/fontesDaAstro";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { FormularioLogin } from "./FormularioLogin";
import s from "./entrar.module.css";

/**
 * Login da Astro Soluções — redesenhado em 29/10/2026 para o app no celular.
 *
 * No celular, a marca fica no alto, sobre a noite azul com a órbita do logo,
 * e o formulário numa folha clara presa ao pé da tela: o e-mail aparece sem
 * rolar, e o polegar alcança tudo. No computador, duas colunas (`entrar.module.css`).
 *
 * A entrada é SEMPRE da plataforma (Astro Soluções), em qualquer endereço; a
 * imobiliária aparece depois do login, na barra do topo do painel. O endereço
 * só muda o pé: no site de um cliente há "Voltar para o site".
 *
 * O formulário (`FormularioLogin`) não mudou: usa os tokens do painel, que
 * esta tela reaponta para a paleta clara e azul da Astro no `style` abaixo.
 */

type Rodape = "convite" | "site";

async function rodapeDoEndereco(): Promise<Rodape> {
  const host = (await headers()).get("host");
  return ehEnderecoSoDoPainel(host) ? "convite" : "site";
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: `Entrar · ${MARCA_DA_PLATAFORMA.nome}` },
    robots: { index: false, follow: false },
  };
}

/** Estrelas em posições fixas (nada de sorteio: daria divergência de hidratação). */
const ESTRELAS = Array.from({ length: 18 }, (_, i) => ({
  top: `${(i * 37 + 7) % 46}%`,
  left: `${(i * 61 + 13) % 100}%`,
}));

const RECURSOS = ["IA que responde seus leads no WhatsApp", "Funil, agenda de visitas e vendas", "A equipe inteira num lugar só"];

/** Os tokens do formulário na paleta da Astro (folha clara, acento azul). */
const TOKENS_DO_FORMULARIO = {
  "--color-acento": "#2f5ea8",
  "--color-acento-hover": "#244c8c",
  "--color-sobre-cor": "#ffffff",
  "--color-superficie": "#ffffff",
  "--color-elevado": "#f3f6fb",
  "--color-linha": "#e3e8f1",
  "--color-linha-forte": "#cfd7e6",
  "--color-titulo": "#0d1b33",
  "--color-corpo": "#34405a",
  "--color-apoio": "#56627b",
  "--color-tenue": "#6b7690",
} as CSSProperties;

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; next?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const rodape = await rodapeDoEndereco();
  const [nomeA, nomeB] = MARCA_DA_PLATAFORMA.wordmark;
  // Link do convite ou da recuperação que já foi usado, venceu ou chegou
  // adulterado (`/auth/confirmar`): explica e aponta a saída.
  const linkExpirado = parametros.link === "expirado";
  // Para onde voltar depois de entrar (o proxy manda quando `/plataforma`
  // abre sem sessão). Só repassado: a action confere com `destinoSeguro`.
  const next = typeof parametros.next === "string" ? parametros.next : undefined;

  return (
    <main className={`${FONTES_DA_ASTRO} ${s.tela}`}>
      <div aria-hidden className={s.ceu}>
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
        <h2 className={`${s.titulo} ${s.chamada}`}>Seus leads estão esperando.</h2>
        <p className={s.apoio}>{MARCA_DA_PLATAFORMA.apoio}</p>
        <ul className={s.recursos}>
          {RECURSOS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className={s.folha} style={TOKENS_DO_FORMULARIO} aria-labelledby="titulo-entrar">
        <div aria-hidden className={s.puxador} />
        <h1 id="titulo-entrar" className={`${s.titulo} ${s.folhaTitulo}`}>
          Entrar
        </h1>
        <p className={s.folhaApoio}>Use o e-mail do convite da sua imobiliária ou da Astro.</p>

        {linkExpirado && (
          <p role="alert" className={s.aviso}>
            {"Este link já foi usado ou expirou. Peça outro em 'Esqueci a senha'."}
          </p>
        )}

        <FormularioLogin next={next} />

        {rodape === "site" && (
          <Link href="/" className={s.voltar}>
            Voltar para o site
          </Link>
        )}

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
