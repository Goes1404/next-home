// A amostra de site de uma loja prospectada (0253, 02/11/2026).
//
// Módulo PURO: recebe a linha de `prospeccao_leads` e devolve a página
// inteira em HTML. O molde (`molde.html`, embutido em `molde.ts`) é a mesma
// página que foi validada com as lojas de beleza em 02/11/2026; aqui só se
// preenchem os marcadores `[[CHAVE]]`.
//
// Segurança: tudo o que vem do banco é texto de terceiros (nome da loja,
// endereço do Google). Texto vai escapado para HTML; cor só passa se for
// hexadecimal; ilustração e ícone só da lista fechada; e a configuração que
// o script do molde injeta como HTML (`CFG`) perde os caracteres que abririam
// tag ou atributo.

import { MOLDE_DA_AMOSTRA } from "./molde";
import { padraoDoModelo, TEXTOS_DO_MODO } from "../modelos";
import {
  ehModelo,
  FORMAS,
  ICONES,
  type ConfigDaAmostra,
  type FaixaDaAmostra,
  type Forma,
  type Icone,
  type ItemResolve,
  type LeadParaAmostra,
  type ModoDoPedido,
  type ProdutoDaAmostra,
} from "../tipos";

export type OpcoesDaAmostra = {
  /** Registra a abertura (falso na prévia do painel, `?previa=1`). */
  rastrear: boolean;
  /** Número do WhatsApp da Astro (só dígitos) para o botão "falar com o Eduardo". */
  whatsappDaAstro: string;
  /** Quem assina a abordagem. */
  vendedor: string;
};

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function escaparHtml(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto que o script do molde injeta como HTML: sem caractere de tag nem de atributo. */
export function textoSeguroParaScript(texto: unknown, max = 120): string {
  return String(texto ?? "")
    .replace(/[<>"'`&\\]/g, "")
    .replace(/[\u0000-\u001f\u2028\u2029]/g, " ")
    .trim()
    .slice(0, max);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function cor(valor: unknown, padrao: string): string {
  return typeof valor === "string" && HEX.test(valor) ? valor.toUpperCase() : padrao;
}

function clarear(hex: string, quanto: number): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (v: number) => Math.round(v + (255 - v) * quanto);
  const r = canal((n >> 16) & 255);
  const g = canal((n >> 8) & 255);
  const b = canal(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function rgba(hex: string, alfa: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

function ehForma(valor: unknown): valor is Forma {
  return typeof valor === "string" && (FORMAS as readonly string[]).includes(valor);
}

function ehIcone(valor: unknown): valor is Icone {
  return typeof valor === "string" && (ICONES as readonly string[]).includes(valor);
}

function texto(valor: unknown, padrao: string, max = 200): string {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, max) : padrao;
}

function par(valor: unknown, padrao: [string, string]): [string, string] {
  if (Array.isArray(valor) && valor.length === 2) return [texto(valor[0], padrao[0], 80), texto(valor[1], padrao[1], 120)];
  return padrao;
}

function produtos(lista: unknown, padrao: ProdutoDaAmostra[]): ProdutoDaAmostra[] {
  if (!Array.isArray(lista) || lista.length === 0) return padrao.map(produtoSeguro);
  return lista.slice(0, 8).map((p) => produtoSeguro(p as ProdutoDaAmostra));
}

function produtoSeguro(p: ProdutoDaAmostra): ProdutoDaAmostra {
  const b = Array.isArray(p?.b) ? p.b : [];
  const seguro: ProdutoDaAmostra = {
    n: textoSeguroParaScript(p?.n, 70) || "Produto",
    c: textoSeguroParaScript(p?.c, 40),
    p: textoSeguroParaScript(p?.p, 14),
    b: [ehForma(b[0]) ? b[0] : "tall", cor(b[1], "#FFB3CC"), cor(b[2], "#E8457E"), cor(b[3], "#3B0F2E")],
    bg: cor(p?.bg, "#FFF5F8"),
    t: textoSeguroParaScript(p?.t, 24),
  };
  if (p?.o) seguro.o = textoSeguroParaScript(p.o, 14);
  return seguro;
}

function fileira(lista: unknown, padrao: NonNullable<ConfigDaAmostra["heroA"]>): NonNullable<ConfigDaAmostra["heroA"]> {
  const fonte = Array.isArray(lista) && lista.length ? lista : padrao;
  return fonte.slice(0, 4).map((item) => {
    const [forma, c1, c2, tampa, altura] = Array.isArray(item) ? item : [];
    return [
      ehForma(forma) ? forma : "tall",
      cor(c1, "#FFB3CC"),
      cor(c2, "#E8457E"),
      cor(tampa, "#3B0F2E"),
      Math.min(160, Math.max(60, Number(altura) || 110)),
    ];
  });
}

function iniciaisDe(nome: string): string {
  const palavras = nome
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !/^(dos?|das?|de|e)$/i.test(p));
  const letras = palavras.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  return letras || nome.slice(0, 1).toUpperCase() || "A";
}

function blocoDoHorario(horario: unknown): string {
  if (!Array.isArray(horario) || horario.length !== 7) return "";
  const linhas = horario
    .map((h, i) => `<li><span>${DIAS[i]}</span><span>${escaparHtml(texto(h, "Fechado", 30))}</span></li>`)
    .join("");
  return `<ul class="hours">${linhas}</ul>
          <span class="hours"><span class="tag-ok">Horário sempre igual ao do Google e do Instagram</span></span>`;
}

function blocoDaFaixa(f: FaixaDaAmostra | null | undefined): string {
  if (!f || typeof f !== "object") return "";
  return `<section class="sec" style="padding-top:0">
    <div class="wrap band">
      <div><h2>${escaparHtml(texto(f.titulo, "", 90))}</h2><p>${escaparHtml(texto(f.texto, "", 400))}</p></div>
      <div class="mock"><b>${escaparHtml(texto(f.mockTitulo, "", 60))}</b>${escaparHtml(texto(f.mockTexto, "", 200))}<br><span class="pill">${escaparHtml(texto(f.botao, "", 40))}</span></div>
    </div>
  </section>`;
}

function blocoDoResolve(nome: string, itens: ItemResolve[]): string {
  if (!itens.length) return "";
  const cartoes = itens
    .slice(0, 3)
    .map(
      (i) => `<article><span class="hoje">Hoje: <s>${escaparHtml(texto(i.hoje, "", 80))}</s></span><h3>${escaparHtml(texto(i.titulo, "", 60))}</h3><p>${escaparHtml(texto(i.texto, "", 200))}</p></article>`,
    )
    .join("");
  return `<section class="sec" style="padding-top:0">
    <div class="wrap">
      <div class="sec-head"><div><h2>Pensado para a ${escaparHtml(nome)}</h2><p>O que muda no dia a dia da loja com o site e o clube funcionando juntos.</p></div></div>
      <div class="resolve">${cartoes}</div>
    </div>
  </section>`;
}

function blocoDaCalculadora(calc: ConfigDaAmostra["calculadora"]): string {
  if (!calc) return "";
  const clientes = Math.min(1000, Math.max(50, Math.round(Number(calc.clientes) || 300)));
  const ticket = Math.min(300, Math.max(10, Math.round(Number(calc.ticket) || 60)));
  return `<section class="sec" style="padding-top:0">
    <div class="wrap calc">
      <div>
        <h2>Quanto o clube pode trazer por mês</h2>
        <p>Se 1 em cada 10 clientes cadastradas voltar uma vez a mais por mês por causa do cashback e dos avisos no WhatsApp.</p>
      </div>
      <div>
        <label>Clientes no clube: <span id="calcCliTxt">${clientes}</span><input id="calcCli" type="range" min="50" max="1000" step="10" value="${clientes}"></label>
        <label>Ticket médio: <span id="calcTkTxt">R$ ${ticket}</span><input id="calcTk" type="range" min="10" max="300" step="5" value="${ticket}"></label>
        <small>Venda a mais por mês</small>
        <output id="calcOut">R$ ${Math.round(clientes * 0.1 * ticket)}</output>
      </div>
    </div>
  </section>`;
}

function blocoDosServicos(servicos: string[] | null): string {
  if (!servicos || !servicos.length) return "";
  return `<section class="sec services" id="servicos">
    <div class="wrap svc-wrap">
      <div>
        <div class="sec-head" style="margin-bottom:18px"><div><h2>Agende sem precisar ligar</h2><p>A cliente escolhe o serviço e o dia. A equipe recebe o agendamento organizado e um lembrete vai automático no dia anterior.</p></div></div>
        <p class="note" style="margin-top:0">Serviços desta prévia são exemplos. Entram os que a loja oferece de verdade.</p>
      </div>
      <div class="svc-panel">
        <h3>Qual serviço?</h3><div class="chips" id="svc"></div>
        <h3>Qual dia?</h3><div class="days" id="days"></div>
        <div class="svc-sum"><p id="svcsum"></p><button class="btn btn-primary" data-wa="servico">Agendar</button></div>
      </div>
    </div>
  </section>`;
}

function blocoDaAstro(nome: string, opcoes: OpcoesDaAmostra): string {
  const numero = opcoes.whatsappDaAstro.replace(/\D/g, "");
  if (!numero) return "";
  const mensagem = `Oi, ${opcoes.vendedor}! Vi a amostra do site da ${nome} e quero entender melhor.`;
  const link = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  return `<section class="sec" style="padding-bottom:0">
    <div class="wrap astro-bar">
      <div><h2>Gostou do que viu?</h2><p>Esta prévia foi feita pela Astro Soluções para a ${escaparHtml(nome)}. Em 15 minutos mostramos como ela fica com os produtos e as clientes de vocês.</p></div>
      <a class="btn btn-primary" href="${escaparHtml(link)}" target="_blank" rel="noopener" data-astro-cta="1">Conversar com o ${escaparHtml(opcoes.vendedor)}</a>
    </div>
  </section>`;
}

/**
 * Registra a abertura: só depois de 3 s com a página visível (o robô que
 * monta a prévia do link no WhatsApp não roda script nem espera), e depois o
 * tempo de leitura a cada 15 s e ao sair. Falha de rede é ignorada: o
 * rastreio nunca atrapalha quem está lendo.
 */
function scriptDoRastreio(slug: string): string {
  const dados = JSON.stringify({ slug }).replace(/</g, "\\u003c");
  return `<script>
(function(){
  var D=${dados},URL_="/api/prospeccao/visita",id=null,seg=0,ult=0,iniciou=false;
  function enviar(corpo,sair){try{var b=JSON.stringify(corpo);if(sair&&navigator.sendBeacon){navigator.sendBeacon(URL_,new Blob([b],{type:"text/plain"}));return Promise.resolve(null)}return fetch(URL_,{method:"POST",headers:{"content-type":"text/plain"},body:b,keepalive:true}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}catch(e){return Promise.resolve(null)}}
  function iniciar(){if(iniciou)return;iniciou=true;enviar({slug:D.slug,dispositivo:innerWidth<768?"celular":"computador"}).then(function(r){if(r&&r.id)id=r.id})}
  var espera=setTimeout(function(){if(document.visibilityState==="visible")iniciar()},3000);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){if(!iniciou){clearTimeout(espera);espera=setTimeout(iniciar,3000)}}else if(id){enviar({id:id,segundos:seg},true)}});
  setInterval(function(){if(document.visibilityState==="visible"&&iniciou){seg++;if(id&&seg-ult>=15){ult=seg;enviar({id:id,segundos:seg})}}},1000);
  addEventListener("pagehide",function(){if(id)enviar({id:id,segundos:seg},true)});
})();
</script>`;
}

/** A página inteira da amostra. */
export function renderizarAmostra(lead: LeadParaAmostra, opcoes: OpcoesDaAmostra): string {
  const modelo = ehModelo(lead.modelo) ? lead.modelo : "varejo";
  const padrao = padraoDoModelo(modelo);
  const c = (lead.amostra && typeof lead.amostra === "object" ? lead.amostra : {}) as ConfigDaAmostra;
  const nome = texto(lead.nome, "Sua loja", 120);

  const primaria = cor(c.cores?.primaria, "#D81B6A");
  const profunda = cor(c.cores?.profunda, "#A3124F");
  const tinta = cor(c.cores?.tinta, "#3B0F2E");

  const modo: ModoDoPedido = c.modo === "entrega" || c.modo === "encomenda" || c.modo === "retire" || c.modo === "agenda" ? c.modo : padrao.modo;
  const textosDoModo = TEXTOS_DO_MODO[modo];
  const vitrine = { ...padrao.vitrine, ...(c.vitrine ?? {}) };
  const servicos = c.servicos === null ? null : Array.isArray(c.servicos) ? c.servicos : padrao.servicos;
  const servicosSeguros = servicos ? servicos.slice(0, 6).map((s) => textoSeguroParaScript(s, 40)).filter(Boolean) : null;
  const categorias = (Array.isArray(c.categorias) && c.categorias.length ? c.categorias : padrao.categorias)
    .slice(0, 8)
    .map(([rotulo, icone]) => [textoSeguroParaScript(rotulo, 20), ehIcone(icone) ? icone : "new"] as [string, Icone]);
  const local = texto(c.local, [lead.cidade, lead.bairro].filter(Boolean).join(", "), 60);
  const enderecoTexto = texto(lead.endereco, local, 200);
  const endereco = escaparHtml(enderecoTexto).replace(/\n/g, "<br>");
  const busca = encodeURIComponent(`${nome}, ${enderecoTexto}`.replace(/\n/g, " "));
  const resolve = Array.isArray(c.resolve) ? c.resolve : padrao.resolve;
  const calculadora = c.calculadora === null ? null : (c.calculadora ?? padrao.calculadora);

  const cfg = {
    row1: fileira(c.heroA, padrao.heroA),
    row2: fileira(c.heroB, padrao.heroB),
    cats: categorias,
    products: { novidades: produtos(c.novidades, padrao.novidades), promo: produtos(c.promocoes, padrao.promocoes) },
    addLabel: textosDoModo.botao,
    orderIntro: textosDoModo.pedidoInicio,
    orderOutro: textosDoModo.pedidoFim,
    services: servicosSeguros && servicosSeguros.length ? servicosSeguros : null,
  };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

  const [selo, seloTexto] = par(c.selo, padrao.selo);
  const [tituloA, tituloB] = par(c.titulo, padrao.titulo);
  const [adesivoA1, adesivoA2] = par(c.adesivos?.a, padrao.adesivos.a);
  const [adesivoB1, adesivoB2] = par(c.adesivos?.b, padrao.adesivos.b);
  const clube = texto(c.clube, `${nome.split(" ")[0]} Club`, 40);
  const primeiroNome = nome.split(" ")[0];

  const valores: Record<string, string> = {
    NAME: escaparHtml(nome),
    INITIALS: escaparHtml(texto(c.iniciais, iniciaisDe(nome), 3)),
    CITY: escaparHtml(local),
    ADDR: endereco,
    MAPQ: busca,
    PRIMARY: primaria,
    DEEP: profunda,
    INK: tinta,
    INKSOFT: clarear(tinta, 0.35),
    PETAL: clarear(primaria, 0.78),
    BLUSH: clarear(primaria, 0.91),
    PAPER: clarear(primaria, 0.975),
    LINE: clarear(primaria, 0.8),
    SHADOW: rgba(profunda, 0.45),
    BADGE: escaparHtml(selo),
    BADGETXT: escaparHtml(seloTexto),
    H1A: escaparHtml(tituloA),
    H1B: escaparHtml(tituloB),
    LEAD: escaparHtml(texto(c.chamada, padrao.chamada, 300)),
    STA1: escaparHtml(adesivoA1),
    STA2: escaparHtml(adesivoA2),
    STB1: escaparHtml(adesivoB1),
    STB2: escaparHtml(adesivoB2),
    CTA1: escaparHtml(texto(vitrine.cta, "Ver novidades", 30)),
    TAB1: escaparHtml(texto(vitrine.aba1, "Novidades", 24)),
    TAB2: escaparHtml(texto(vitrine.aba2, "Promoções", 24)),
    VITRINETITULO: escaparHtml(texto(vitrine.titulo, "Vitrine da semana", 60)),
    VITRINETXT: escaparHtml(texto(vitrine.texto, "", 300)),
    HOWNAV: escaparHtml(textosDoModo.nav),
    HOWTITLE: escaparHtml(textosDoModo.titulo),
    HOWTXT: escaparHtml(textosDoModo.texto),
    ADDLABEL: escaparHtml(textosDoModo.botao),
    STEP3T: escaparHtml(textosDoModo.passo3Titulo),
    STEP3P: escaparHtml(textosDoModo.passo3Texto),
    BAGLABEL: escaparHtml(textosDoModo.sacola),
    CLUB: escaparHtml(clube),
    CLUBMSG: escaparHtml(`Oi, Juliana! Chegou a linha que você comprou da última vez na ${primeiroNome}. Seu cashback de R$ 18,40 vale nela 💛`),
    STORETITLE: "Venha conhecer a loja",
    STORESUB: "Endereço, horário e o caminho até a loja, sempre atualizados.",
    HOURSBLOCK: blocoDoHorario(c.horario),
    BAND: blocoDaFaixa(c.faixa),
    RESOLVE: blocoDoResolve(nome, resolve),
    CALC: blocoDaCalculadora(calculadora),
    SERVICES: blocoDosServicos(cfg.services),
    SVCNAV: cfg.services ? '<li><a href="#servicos">Serviços</a></li>' : "",
    ASTROBAR: blocoDaAstro(nome, opcoes),
    RASTREIO: opcoes.rastrear ? scriptDoRastreio(lead.slug) : "",
    CFGJSON: cfgJson,
  };

  return MOLDE_DA_AMOSTRA.replace(/\[\[([A-Z0-9]+)\]\]/g, (_, chave: string) => valores[chave] ?? "");
}
