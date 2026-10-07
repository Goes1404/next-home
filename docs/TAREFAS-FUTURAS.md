# Tarefas futuras (do dono da conta)

Coisas que dependem de quem tem acesso às contas e não de código. Marque
`[x]` ao concluir.

## SEO: ganhar do site antigo (07/10/2026)

O site antigo (`nexthomeimobiliaria.com.br`) continua no ar e disputa as
mesmas buscas. Em ordem de impacto:

### 1. Perfil da Empresa no Google (cartão do Maps)
- [ ] Em business.google.com → Editar perfil → Informações de contato → Site:
      `https://www.nexthomeimoveis.com`
- [ ] Publicar 2 ou 3 lançamentos em Produtos/Posts com o link da ficha
      (ex.: `https://www.nexthomeimoveis.com/empreendimentos/joy-barueri`)
- [ ] Conferir que endereço e telefone são iguais aos do site:
      Calçada Antares, 264, 2º andar, Alphaville; (11) 97220-7204

### 2. Bios das redes
- [ ] Instagram `@next_home_imoveis`, Facebook, YouTube e LinkedIn com
      `https://www.nexthomeimoveis.com` no campo de site (no Linktree, como
      primeiro botão)

### 3. Link do site antigo para o novo
- [ ] Item no menu do site antigo, texto **"Lançamentos 2026"**, apontando para
      `https://www.nexthomeimoveis.com/empreendimentos`, sem `nofollow`
- [ ] Link no rodapé do site antigo: "Site novo"

### 4. Search Console
- [ ] search.google.com/search-console → Adicionar propriedade → Domínio →
      `nexthomeimoveis.com`
- [ ] Registro TXT (`google-site-verification=…`) na Hostinger: Domínios →
      nexthomeimoveis.com → DNS, nome `@` → Verificar
- [ ] Sitemaps → enviar `https://www.nexthomeimoveis.com/sitemap.xml`
- [ ] Inspeção de URL → Solicitar indexação: home, `/empreendimentos`,
      `/regioes/barueri`
- [ ] Depois de 1 semana: print da aba Desempenho para decidir o próximo passo

## Apresentação

- [ ] Depois da apresentação, apagar o perfil de demonstração: rodar
      `scripts/demo/apagarPerfilDemo.sql` no editor SQL do Supabase
