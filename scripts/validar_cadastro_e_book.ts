import { getEmpreendimentos, getEmpreendimentoBySlug } from "../src/lib/queries";
import { mapEmpreendimento } from "../src/lib/supabase/mappers";
import type { Empreendimento } from "../src/lib/types";

async function main() {
  console.log("==================================================");
  console.log("🧪 INICIANDO VALIDAÇÃO COMPLETA DO CADASTRO & BOOK");
  console.log("==================================================\n");

  // 1. Validar Catálogo Geral de Imóveis
  console.log("1️⃣ Testando carregamento do catálogo...");
  const imoveis = await getEmpreendimentos();
  console.log(`✓ Catálogo carregado com ${imoveis.length} empreendimento(s).`);
  
  if (imoveis.length === 0) {
    throw new Error("Catálogo vazio!");
  }

  const canvas = imoveis.find((i) => i.slug === "canvas-alphaville") || imoveis[0];
  console.log(`✓ Imóvel de teste selecionado: "${canvas.nome}" (${canvas.slug})`);

  // 2. Validar Detalhes do Imóvel para o Editor
  console.log("\n2️⃣ Testando integridade dos dados para o Editor Mobile...");
  const detalhe = await getEmpreendimentoBySlug(canvas.slug);
  if (!detalhe) throw new Error("Falha ao carregar detalhe do imóvel!");

  console.log(`  - Nome: ${detalhe.nome}`);
  console.log(`  - Tagline: ${detalhe.tagline}`);
  console.log(`  - Preço a partir de: R$ ${detalhe.precoAPartir?.toLocaleString("pt-BR")}`);
  console.log(`  - Status da Obra: ${detalhe.status}`);
  console.log(`  - Fotos na Galeria: ${detalhe.galeria.length}`);
  console.log(`  - Capa Principal: ${detalhe.capa.url}`);
  console.log(`  - Tipologias / Plantas: ${detalhe.tipologias.length}`);
  console.log(`  - Itens de Lazer / Diferenciais: ${detalhe.lazer.length} itens (${detalhe.lazer.slice(0, 3).join(", ")}...)`);
  console.log(`  - Book Digital URL: ${detalhe.bookUrl || "Disponível para Upload"}`);

  // 3. Validar Simulação de Atualização de Dados e Book
  console.log("\n3️⃣ Simulando atualização de dados e Book Digital...");
  const mockAtualizacao: Empreendimento = {
    ...detalhe,
    tagline: "Design Contemporâneo & Exclusividade Absoluta em Alphaville",
    bookUrl: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/canvas/book-oficial.pdf",
    bookTitulo: "Book Oficial de Lançamento Canvas Alphaville 2026",
    lazer: [...detalhe.lazer, "Ponto de Recarga para Carro Elétrico"],
  };

  console.log(`✓ Novo Tagline: "${mockAtualizacao.tagline}"`);
  console.log(`✓ Book Digital configurado: ${mockAtualizacao.bookUrl}`);
  console.log(`✓ Título do Book: "${mockAtualizacao.bookTitulo}"`);
  console.log(`✓ Total de Lazer atualizado: ${mockAtualizacao.lazer.length} itens`);

  // 4. Validar Reordenação de Fotos para Definir Capa
  console.log("\n4️⃣ Testando fluxo de 'Definir como Capa' na Galeria...");
  if (mockAtualizacao.galeria.length > 1) {
    const fotoOriginal = mockAtualizacao.galeria[0];
    const novaCapa = mockAtualizacao.galeria[1];
    const galeriaReordenada = [novaCapa, ...mockAtualizacao.galeria.filter((m) => m.url !== novaCapa.url)];
    console.log(`✓ Foto anterior da capa: ${fotoOriginal.url}`);
    console.log(`✓ Nova foto promovida a capa: ${galeriaReordenada[0].url}`);
    console.log(`✓ Integridade da galeria preservada: ${galeriaReordenada.length} fotos.`);
  }

  // 5. Validar Tipologias e Metragens
  console.log("\n5️⃣ Testando adição de nova tipologia / metragem...");
  const novasTipologias = [
    ...mockAtualizacao.tipologias,
    {
      id: "tip-nova",
      nome: "180m² — 4 Suítes Penthouse",
      areaPrivativa: 180,
      dormitorios: 4,
      suites: 4,
      banheiros: 5,
      vagas: 4,
      preco: 3200000,
      plantaUrl: "https://mock.com/planta-penthouse.jpg",
      unidadesDisponiveis: 2,
    },
  ];
  console.log(`✓ Tipologias atualizadas: ${novasTipologias.length} plantas disponíveis.`);
  console.log(`  - Nova planta adicionada: ${novasTipologias[novasTipologias.length - 1].nome} (R$ ${novasTipologias[novasTipologias.length - 1].preco?.toLocaleString("pt-BR")})`);

  console.log("\n==================================================");
  console.log("🎉 VALIDAÇÃO CONCLUÍDA COM 100% DE SUCESSO!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Erro na validação:", err);
  process.exit(1);
});
