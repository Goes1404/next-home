/**
 * Tipos gerados a partir do projeto Supabase real (prhhrqyubjcafvucirri) via
 * Management API. Regerar sempre que `supabase/migrations/` mudar.
 * Última geração: depois da 0045.
 *
 * ATENÇÃO AO REGERAR: o gerador só conhece os quatro ENUMS NATIVOS do
 * Postgres (status_obra, tipo_imovel, tipo_midia, finalidade_imovel). Todo o
 * resto do vocabulário fechado deste banco é coluna de texto com CHECK, e
 * para essas o gerador devolve `string` — quatro arquivos param de compilar,
 * porque o código depende das uniões. Elas são reaplicadas à mão depois de
 * cada geração, nas três seções (Row/Insert/Update):
 *
 *   - catalogo_candidatos.decisao (0078)
 *   - corretor_whatsapp_instancias.modo_bot
 *   - corretor_whatsapp_instancias.status_conexao
 *   - ia_interacoes.avaliacao
 *   - ia_interacoes.origem
 *   - lead_interacoes.tipo
 *   - lead_observacoes_ia.temperatura_label
 *   - whatsapp_campanhas_fila.variante (0084)
 *   - whatsapp_campanhas.status
 *   - whatsapp_campanhas_fila.status
 *   - whatsapp_conversas.origem
 *   - whatsapp_followups.status
 *   - whatsapp_followups.tipo (0054)
 *   - whatsapp_mensagens.remetente
 *   - whatsapp_mensagens.tipo
 *
 * Ou seja: gerar por cima sem reaplicar isto é regressão silenciosa de
 * tipagem, não atualização.
 *
 * ESCRITA À MÃO, também a reaplicar: a view `pessoas_do_corretor` (0088) e a
 * tabela `imagens_geradas` (0090). As duas são posteriores à última geração, e
 * sem elas `getPaginaDePessoas` e a galeria de imagens não compilam — o
 * cliente do Supabase só aceita nomes de relação que existam neste arquivo.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_eventos: {
        Row: {
          acao: string
          alvo_corretor_id: string | null
          ator_id: string | null
          created_at: string
          detalhes: Json
          id: string
        }
        Insert: {
          acao: string
          alvo_corretor_id?: string | null
          ator_id?: string | null
          created_at?: string
          detalhes?: Json
          id?: string
        }
        Update: {
          acao?: string
          alvo_corretor_id?: string | null
          ator_id?: string | null
          created_at?: string
          detalhes?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_eventos_alvo_corretor_id_fkey"
            columns: ["alvo_corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_eventos_ator_id_fkey"
            columns: ["ator_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_candidatos: {
        Row: {
          area: string | null
          bairro: string | null
          criado_em: string
          decidido_em: string | null
          decisao: "pendente" | "cadastrar" | "descartado" | "ja_temos"
          dormitorios: string | null
          empreendimento_id: string | null
          fonte: string
          id: string
          link: string | null
          motivo: string | null
          nome: string
          ref_externa: string
          status_obra: string | null
          visto_em: string
        }
        Insert: {
          area?: string | null
          bairro?: string | null
          criado_em?: string
          decidido_em?: string | null
          decisao?: "pendente" | "cadastrar" | "descartado" | "ja_temos"
          dormitorios?: string | null
          empreendimento_id?: string | null
          fonte?: string
          id?: string
          link?: string | null
          motivo?: string | null
          nome: string
          ref_externa: string
          status_obra?: string | null
          visto_em?: string
        }
        Update: {
          area?: string | null
          bairro?: string | null
          criado_em?: string
          decidido_em?: string | null
          decisao?: "pendente" | "cadastrar" | "descartado" | "ja_temos"
          dormitorios?: string | null
          empreendimento_id?: string | null
          fonte?: string
          id?: string
          link?: string | null
          motivo?: string | null
          nome?: string
          ref_externa?: string
          status_obra?: string | null
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_candidatos_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliques_whatsapp: {
        Row: {
          corretor_id: string | null
          created_at: string
          empreendimento_id: string | null
          id: string
          origem: string
          url_origem: string | null
          user_agent: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string
          empreendimento_id?: string | null
          id?: string
          origem: string
          url_origem?: string | null
          user_agent?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string
          empreendimento_id?: string | null
          id?: string
          origem?: string
          url_origem?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliques_whatsapp_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliques_whatsapp_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      corretor_destaques: {
        Row: {
          corretor_id: string
          empreendimento_slug: string
          posicao: number
        }
        Insert: {
          corretor_id: string
          empreendimento_slug: string
          posicao: number
        }
        Update: {
          corretor_id?: string
          empreendimento_slug?: string
          posicao?: number
        }
        Relationships: [
          {
            foreignKeyName: "corretor_destaques_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corretor_destaques_empreendimento_slug_fkey"
            columns: ["empreendimento_slug"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["slug"]
          },
        ]
      }
      corretor_disponibilidade: {
        Row: {
          corretor_id: string
          criado_em: string
          dia_semana: number
          hora_fim: number
          hora_inicio: number
          id: string
        }
        Insert: {
          corretor_id: string
          criado_em?: string
          dia_semana: number
          hora_fim: number
          hora_inicio: number
          id?: string
        }
        Update: {
          corretor_id?: string
          criado_em?: string
          dia_semana?: number
          hora_fim?: number
          hora_inicio?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corretor_disponibilidade_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      corretor_whatsapp_instancias: {
        Row: {
          aviso_queda_enviado_em: string | null
          bloqueado_ate: string | null
          conectado_em: string | null
          corretor_id: string
          created_at: string
          desconectado_em: string | null
          envios_campanha_contador: number
          envios_campanha_data: string | null
          falhas_seguidas: number
          id: string
          instance_name: string
          modo_bot: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado"
          nome_assistente: string
          palavra_chave_ativacao: string | null
          palavra_chave_teste: string | null
          palavras_entrada_cliente: string | null
          qrcode_base64: string | null
          status_conexao: "desconectado" | "conectando" | "conectado"
          telefone_conectado: string | null
          tom_voz: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          aviso_queda_enviado_em?: string | null
          bloqueado_ate?: string | null
          conectado_em?: string | null
          corretor_id: string
          created_at?: string
          desconectado_em?: string | null
          envios_campanha_contador?: number
          envios_campanha_data?: string | null
          falhas_seguidas?: number
          id?: string
          instance_name: string
          modo_bot?: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado"
          nome_assistente?: string
          palavra_chave_ativacao?: string | null
          palavra_chave_teste?: string | null
          palavras_entrada_cliente?: string | null
          qrcode_base64?: string | null
          status_conexao?: "desconectado" | "conectando" | "conectado"
          telefone_conectado?: string | null
          tom_voz?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          aviso_queda_enviado_em?: string | null
          bloqueado_ate?: string | null
          conectado_em?: string | null
          corretor_id?: string
          created_at?: string
          desconectado_em?: string | null
          envios_campanha_contador?: number
          envios_campanha_data?: string | null
          falhas_seguidas?: number
          id?: string
          instance_name?: string
          modo_bot?: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado"
          nome_assistente?: string
          palavra_chave_ativacao?: string | null
          palavra_chave_teste?: string | null
          palavras_entrada_cliente?: string | null
          qrcode_base64?: string | null
          status_conexao?: "desconectado" | "conectando" | "conectado"
          telefone_conectado?: string | null
          tom_voz?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corretor_whatsapp_instancias_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: true
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      corretores: {
        Row: {
          ativo: boolean
          bio: string | null
          created_at: string
          creci: string
          deve_trocar_senha: boolean
          em_pausa: boolean
          email: string | null
          foto_url: string | null
          fundo_foto_url: string | null
          fundo_tipo: string
          id: string
          nome: string
          papel: string
          regioes: string[] | null
          slug: string | null
          user_id: string | null
          video_url: string | null
          whatsapp: string
        }
        Insert: {
          ativo?: boolean
          bio?: string | null
          created_at?: string
          creci: string
          deve_trocar_senha?: boolean
          em_pausa?: boolean
          email?: string | null
          foto_url?: string | null
          fundo_foto_url?: string | null
          fundo_tipo?: string
          id?: string
          nome: string
          papel?: string
          regioes?: string[] | null
          slug?: string | null
          user_id?: string | null
          video_url?: string | null
          whatsapp: string
        }
        Update: {
          ativo?: boolean
          bio?: string | null
          created_at?: string
          creci?: string
          deve_trocar_senha?: boolean
          em_pausa?: boolean
          email?: string | null
          foto_url?: string | null
          fundo_foto_url?: string | null
          fundo_tipo?: string
          id?: string
          nome?: string
          papel?: string
          regioes?: string[] | null
          slug?: string | null
          user_id?: string | null
          video_url?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      empreendimento_lazer: {
        Row: {
          empreendimento_id: string
          lazer_item_id: string
        }
        Insert: {
          empreendimento_id: string
          lazer_item_id: string
        }
        Update: {
          empreendimento_id?: string
          lazer_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empreendimento_lazer_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empreendimento_lazer_lazer_item_id_fkey"
            columns: ["lazer_item_id"]
            isOneToOne: false
            referencedRelation: "lazer_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      empreendimentos: {
        Row: {
          bairro: string
          book_titulo: string | null
          book_url: string | null
          cidade: string
          codigo_legado: string | null
          condominio_valor: number | null
          construtora: string | null
          corretor_id: string | null
          created_at: string
          descricao: string | null
          destaque: boolean
          endereco: string | null
          entrega_prevista: string | null
          finalidade: Database["public"]["Enums"]["finalidade_imovel"]
          id: string
          iptu: number | null
          lat: number | null
          lng: number | null
          nome: string
          nomes_alternativos: string[]
          ordem: number
          preco_a_partir: number | null
          publicado: boolean
          seo_descricao: string | null
          seo_titulo: string | null
          slug: string
          status: Database["public"]["Enums"]["status_obra"]
          tagline: string | null
          tipo: Database["public"]["Enums"]["tipo_imovel"]
          total_andares: number | null
          total_torres: number | null
          total_unidades: number | null
          updated_at: string
        }
        Insert: {
          bairro: string
          book_titulo?: string | null
          book_url?: string | null
          cidade: string
          codigo_legado?: string | null
          condominio_valor?: number | null
          construtora?: string | null
          corretor_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          endereco?: string | null
          entrega_prevista?: string | null
          finalidade?: Database["public"]["Enums"]["finalidade_imovel"]
          id?: string
          iptu?: number | null
          lat?: number | null
          lng?: number | null
          nome: string
          nomes_alternativos?: string[]
          ordem?: number
          preco_a_partir?: number | null
          publicado?: boolean
          seo_descricao?: string | null
          seo_titulo?: string | null
          slug: string
          status?: Database["public"]["Enums"]["status_obra"]
          tagline?: string | null
          tipo?: Database["public"]["Enums"]["tipo_imovel"]
          total_andares?: number | null
          total_torres?: number | null
          total_unidades?: number | null
          updated_at?: string
        }
        Update: {
          bairro?: string
          book_titulo?: string | null
          book_url?: string | null
          cidade?: string
          codigo_legado?: string | null
          condominio_valor?: number | null
          construtora?: string | null
          corretor_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          endereco?: string | null
          entrega_prevista?: string | null
          finalidade?: Database["public"]["Enums"]["finalidade_imovel"]
          id?: string
          iptu?: number | null
          lat?: number | null
          lng?: number | null
          nome?: string
          nomes_alternativos?: string[]
          ordem?: number
          preco_a_partir?: number | null
          publicado?: boolean
          seo_descricao?: string | null
          seo_titulo?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["status_obra"]
          tagline?: string | null
          tipo?: Database["public"]["Enums"]["tipo_imovel"]
          total_andares?: number | null
          total_torres?: number | null
          total_unidades?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empreendimentos_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_envios: {
        Row: {
          corretor_id: string
          created_at: string
          id: string
          lead_id: string | null
          mensagem_enviada: string
          status_envio: string
        }
        Insert: {
          corretor_id: string
          created_at?: string
          id?: string
          lead_id?: string | null
          mensagem_enviada: string
          status_envio?: string
        }
        Update: {
          corretor_id?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          mensagem_enviada?: string
          status_envio?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_envios_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_precos_itens: {
        Row: {
          created_at: string
          empreendimento_id: string
          id: string
          lote_id: string
          preco_anterior: number | null
          preco_novo: number
          variacao_percentual: number | null
          variacao_reais: number | null
        }
        Insert: {
          created_at?: string
          empreendimento_id: string
          id?: string
          lote_id: string
          preco_anterior?: number | null
          preco_novo: number
          variacao_percentual?: number | null
          variacao_reais?: number | null
        }
        Update: {
          created_at?: string
          empreendimento_id?: string
          id?: string
          lote_id?: string
          preco_anterior?: number | null
          preco_novo?: number
          variacao_percentual?: number | null
          variacao_reais?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_precos_itens_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_precos_itens_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "historico_precos_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_precos_lotes: {
        Row: {
          created_at: string
          gestor_id: string | null
          id: string
          nome_lote: string
          revertido_em: string | null
          status: string
          total_imoveis: number
        }
        Insert: {
          created_at?: string
          gestor_id?: string | null
          id?: string
          nome_lote: string
          revertido_em?: string | null
          status?: string
          total_imoveis?: number
        }
        Update: {
          created_at?: string
          gestor_id?: string | null
          id?: string
          nome_lote?: string
          revertido_em?: string | null
          status?: string
          total_imoveis?: number
        }
        Relationships: [
          {
            foreignKeyName: "historico_precos_lotes_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_interacoes: {
        Row: {
          acao: string | null
          anexos_bloqueados: number | null
          anexos_enviados: number | null
          avaliacao: "boa" | "ruim" | null
          conversa_id: string | null
          corretor_id: string | null
          created_at: string
          e_teste: boolean
          fallback: boolean
          id: string
          latencia_ms: number | null
          modelo: string | null
          origem: "webhook" | "playground" | "followup" | "eval"
          prompt_versao: string
          sugeriu_visita: boolean | null
          temperatura_score: number | null
          tokens_entrada: number | null
          tokens_saida: number | null
          transferiu_humano: boolean | null
        }
        Insert: {
          acao?: string | null
          anexos_bloqueados?: number | null
          anexos_enviados?: number | null
          avaliacao?: "boa" | "ruim" | null
          conversa_id?: string | null
          corretor_id?: string | null
          created_at?: string
          e_teste?: boolean
          fallback?: boolean
          id?: string
          latencia_ms?: number | null
          modelo?: string | null
          origem: "webhook" | "playground" | "followup" | "eval"
          prompt_versao: string
          sugeriu_visita?: boolean | null
          temperatura_score?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          transferiu_humano?: boolean | null
        }
        Update: {
          acao?: string | null
          anexos_bloqueados?: number | null
          anexos_enviados?: number | null
          avaliacao?: "boa" | "ruim" | null
          conversa_id?: string | null
          corretor_id?: string | null
          created_at?: string
          e_teste?: boolean
          fallback?: boolean
          id?: string
          latencia_ms?: number | null
          modelo?: string | null
          origem?: string
          prompt_versao?: string
          sugeriu_visita?: boolean | null
          temperatura_score?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          transferiu_humano?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_interacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_logs: {
        Row: {
          assunto: string | null
          created_at: string
          de: string | null
          erro_mensagem: string | null
          id: string
          lead_id: string | null
          para: string | null
          payload_raw: Json | null
          status: string
        }
        Insert: {
          assunto?: string | null
          created_at?: string
          de?: string | null
          erro_mensagem?: string | null
          id?: string
          lead_id?: string | null
          para?: string | null
          payload_raw?: Json | null
          status?: string
        }
        Update: {
          assunto?: string | null
          created_at?: string
          de?: string | null
          erro_mensagem?: string | null
          id?: string
          lead_id?: string | null
          para?: string | null
          payload_raw?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lazer_itens: {
        Row: {
          icone: string | null
          id: string
          nome: string
        }
        Insert: {
          icone?: string | null
          id?: string
          nome: string
        }
        Update: {
          icone?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      imagens_geradas: {
        Row: {
          altura: number | null
          corretor_id: string
          created_at: string
          id: string
          largura: number | null
          latencia_ms: number | null
          modelo: string
          prompt: string
          referencia_url: string | null
          url: string
        }
        Insert: {
          altura?: number | null
          corretor_id: string
          created_at?: string
          id?: string
          largura?: number | null
          latencia_ms?: number | null
          modelo: string
          prompt: string
          referencia_url?: string | null
          url: string
        }
        Update: {
          altura?: number | null
          corretor_id?: string
          created_at?: string
          id?: string
          largura?: number | null
          latencia_ms?: number | null
          modelo?: string
          prompt?: string
          referencia_url?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "imagens_geradas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interacoes: {
        Row: {
          conteudo: string
          corretor_id: string | null
          created_at: string
          detalhes: Json
          id: string
          lead_id: string
          tipo: "nota" | "mensagem" | "ligacao" | "etapa" | "visita" | "sistema"
        }
        Insert: {
          conteudo: string
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json
          id?: string
          lead_id: string
          tipo: "nota" | "mensagem" | "ligacao" | "etapa" | "visita" | "sistema"
        }
        Update: {
          conteudo?: string
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json
          id?: string
          lead_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interacoes_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_observacoes_ia: {
        Row: {
          created_at: string
          exigencias_especificas: Json | null
          forma_pagamento: string | null
          id: string
          lead_id: string
          objecoes_identificadas: Json | null
          orcamento_max: number | null
          orcamento_min: number | null
          perfil_familiar: string | null
          proximo_passo_sugerido: string | null
          resumo_executivo: string
          temperatura_label: "quente" | "morno" | "frio"
          temperatura_score: number
          updated_at: string
          urgencia_mudanca: string | null
        }
        Insert: {
          created_at?: string
          exigencias_especificas?: Json | null
          forma_pagamento?: string | null
          id?: string
          lead_id: string
          objecoes_identificadas?: Json | null
          orcamento_max?: number | null
          orcamento_min?: number | null
          perfil_familiar?: string | null
          proximo_passo_sugerido?: string | null
          resumo_executivo: string
          temperatura_label?: "quente" | "morno" | "frio"
          temperatura_score?: number
          updated_at?: string
          urgencia_mudanca?: string | null
        }
        Update: {
          created_at?: string
          exigencias_especificas?: Json | null
          forma_pagamento?: string | null
          id?: string
          lead_id?: string
          objecoes_identificadas?: Json | null
          orcamento_max?: number | null
          orcamento_min?: number | null
          perfil_familiar?: string | null
          proximo_passo_sugerido?: string | null
          resumo_executivo?: string
          temperatura_label?: "quente" | "morno" | "frio"
          temperatura_score?: number
          updated_at?: string
          urgencia_mudanca?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_observacoes_ia_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tarefas: {
        Row: {
          concluida_em: string | null
          corretor_id: string
          created_at: string
          id: string
          lead_id: string
          prazo: string
          titulo: string
        }
        Insert: {
          concluida_em?: string | null
          corretor_id: string
          created_at?: string
          id?: string
          lead_id: string
          prazo: string
          titulo: string
        }
        Update: {
          concluida_em?: string | null
          corretor_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          prazo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tarefas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_metricas: {
        Row: {
          atualizado_em: string
          campanha_id: string
          campanha_nome: string
          cliques: number
          dia: string
          gasto: number
          impressoes: number
          resultados_meta: number
        }
        Insert: {
          atualizado_em?: string
          campanha_id: string
          campanha_nome?: string
          cliques?: number
          dia: string
          gasto?: number
          impressoes?: number
          resultados_meta?: number
        }
        Update: {
          atualizado_em?: string
          campanha_id?: string
          campanha_nome?: string
          cliques?: number
          dia?: string
          gasto?: number
          impressoes?: number
          resultados_meta?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          anuncio_origem: string | null
          arquivado_em: string | null
          consentimento_lgpd: boolean
          corretor_id: string | null
          created_at: string
          detalhes: Json | null
          dormitorios_min: number | null
          email: string | null
          email_message_id: string | null
          empreendimento_id: string | null
          etapa: string
          etapa_alterada_em: string
          id: string
          imovel_interesse_id: string | null
          mensagem: string | null
          meta_ad_id: string | null
          meta_campanha_id: string | null
          meta_conjunto_id: string | null
          meta_lead_id: string | null
          nome: string
          orcamento_max: number | null
          orcamento_min: number | null
          origem: string | null
          origem_atribuicao: string | null
          portal_origem: string | null
          regiao_interesse: string | null
          renda_mensal: number | null
          telefone: string | null
          telefone_e164: string | null
          tentativas_contato: number
          tentativas_sem_resposta: number
          ultima_tentativa_em: string | null
          tipo: string
          visita_agendada_em: string | null
        }
        Insert: {
          anuncio_origem?: string | null
          arquivado_em?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json | null
          dormitorios_min?: number | null
          email?: string | null
          email_message_id?: string | null
          empreendimento_id?: string | null
          etapa?: string
          etapa_alterada_em?: string
          id?: string
          imovel_interesse_id?: string | null
          mensagem?: string | null
          meta_ad_id?: string | null
          meta_campanha_id?: string | null
          meta_conjunto_id?: string | null
          meta_lead_id?: string | null
          nome: string
          orcamento_max?: number | null
          orcamento_min?: number | null
          origem?: string | null
          origem_atribuicao?: string | null
          portal_origem?: string | null
          regiao_interesse?: string | null
          renda_mensal?: number | null
          telefone?: string | null
          telefone_e164?: string | null
          tentativas_contato?: number
          tentativas_sem_resposta?: number
          ultima_tentativa_em?: string | null
          tipo?: string
          visita_agendada_em?: string | null
        }
        Update: {
          anuncio_origem?: string | null
          arquivado_em?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json | null
          dormitorios_min?: number | null
          email?: string | null
          email_message_id?: string | null
          empreendimento_id?: string | null
          etapa?: string
          etapa_alterada_em?: string
          id?: string
          imovel_interesse_id?: string | null
          mensagem?: string | null
          meta_ad_id?: string | null
          meta_campanha_id?: string | null
          meta_conjunto_id?: string | null
          meta_lead_id?: string | null
          nome?: string
          orcamento_max?: number | null
          orcamento_min?: number | null
          origem?: string | null
          origem_atribuicao?: string | null
          portal_origem?: string | null
          regiao_interesse?: string | null
          renda_mensal?: number | null
          telefone?: string | null
          telefone_e164?: string | null
          tentativas_contato?: number
          tentativas_sem_resposta?: number
          ultima_tentativa_em?: string | null
          tipo?: string
          visita_agendada_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_imovel_interesse_id_fkey"
            columns: ["imovel_interesse_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      midias: {
        Row: {
          alt: string | null
          altura: number | null
          blur_data_url: string | null
          empreendimento_id: string
          hash_conteudo: string | null
          id: string
          largura: number | null
          ordem: number
          tipo: Database["public"]["Enums"]["tipo_midia"]
          url: string
        }
        Insert: {
          alt?: string | null
          altura?: number | null
          blur_data_url?: string | null
          empreendimento_id: string
          hash_conteudo?: string | null
          id?: string
          largura?: number | null
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_midia"]
          url: string
        }
        Update: {
          alt?: string | null
          altura?: number | null
          blur_data_url?: string | null
          empreendimento_id?: string
          hash_conteudo?: string | null
          id?: string
          largura?: number | null
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_midia"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "midias_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_mensagens: {
        Row: {
          conteudo: string
          corretor_id: string
          created_at: string
          id: string
          padrao: boolean
          titulo: string
        }
        Insert: {
          conteudo: string
          corretor_id: string
          created_at?: string
          id?: string
          padrao?: boolean
          titulo: string
        }
        Update: {
          conteudo?: string
          corretor_id?: string
          created_at?: string
          id?: string
          padrao?: boolean
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_mensagens_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      tipologias: {
        Row: {
          area_privativa: number | null
          banheiros: number
          dormitorios: number
          empreendimento_id: string
          id: string
          nome: string
          ordem: number
          planta_url: string | null
          preco: number | null
          suites: number
          unidades_disponiveis: number | null
          vagas: number
        }
        Insert: {
          area_privativa?: number | null
          banheiros?: number
          dormitorios?: number
          empreendimento_id: string
          id?: string
          nome: string
          ordem?: number
          planta_url?: string | null
          preco?: number | null
          suites?: number
          unidades_disponiveis?: number | null
          vagas?: number
        }
        Update: {
          area_privativa?: number | null
          banheiros?: number
          dormitorios?: number
          empreendimento_id?: string
          id?: string
          nome?: string
          ordem?: number
          planta_url?: string | null
          preco?: number | null
          suites?: number
          unidades_disponiveis?: number | null
          vagas?: number
        }
        Relationships: [
          {
            foreignKeyName: "tipologias_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_diagnosticos: {
        Row: {
          created_at: string
          destino: string | null
          id: string
          instance_name: string
          passos: Json
        }
        Insert: {
          created_at?: string
          destino?: string | null
          id?: string
          instance_name: string
          passos?: Json
        }
        Update: {
          created_at?: string
          destino?: string | null
          id?: string
          instance_name?: string
          passos?: Json
        }
        Relationships: []
      }
      whatsapp_campanhas: {
        Row: {
          corretor_id: string
          created_at: string
          empreendimento_id: string | null
          id: string
          mensagem_base_b: string | null
          ignorar_janela: boolean
          mensagem_base: string
          status: "rascunho" | "em_andamento" | "pausada" | "concluida"
          titulo: string
          total_enviados: number
          total_leads: number
          total_respondidos: number
        }
        Insert: {
          corretor_id: string
          created_at?: string
          empreendimento_id?: string | null
          id?: string
          mensagem_base_b?: string | null
          ignorar_janela?: boolean
          mensagem_base: string
          status?: "rascunho" | "em_andamento" | "pausada" | "concluida"
          titulo: string
          total_enviados?: number
          total_leads?: number
          total_respondidos?: number
        }
        Update: {
          corretor_id?: string
          created_at?: string
          empreendimento_id?: string | null
          id?: string
          mensagem_base_b?: string | null
          ignorar_janela?: boolean
          mensagem_base?: string
          status?: "rascunho" | "em_andamento" | "pausada" | "concluida"
          titulo?: string
          total_enviados?: number
          total_leads?: number
          total_respondidos?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campanhas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campanhas_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campanhas_fila: {
        Row: {
          agendado_para: string
          campanha_id: string
          created_at: string
          enviado_em: string | null
          erro_motivo: string | null
          id: string
          variante: "A" | "B" | null
          lead_id: string | null
          mensagem_personalizada: string
          personalizado_por_ia: boolean
          resposta_em: string | null
          status: "pendente" | "enviado" | "erro" | "respondido"
          telefone: string
          tentativas: number
        }
        Insert: {
          agendado_para?: string
          campanha_id: string
          created_at?: string
          enviado_em?: string | null
          erro_motivo?: string | null
          id?: string
          variante?: "A" | "B" | null
          lead_id?: string | null
          mensagem_personalizada: string
          personalizado_por_ia?: boolean
          resposta_em?: string | null
          status?: "pendente" | "enviado" | "erro" | "respondido"
          telefone: string
          tentativas?: number
        }
        Update: {
          agendado_para?: string
          campanha_id?: string
          created_at?: string
          enviado_em?: string | null
          erro_motivo?: string | null
          id?: string
          variante?: "A" | "B" | null
          lead_id?: string | null
          mensagem_personalizada?: string
          personalizado_por_ia?: boolean
          resposta_em?: string | null
          status?: "pendente" | "enviado" | "erro" | "respondido"
          telefone?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campanhas_fila_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campanhas_fila_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversas: {
        Row: {
          alerta_quente_em: string | null
          bot_ativo: boolean
          cliente_conhecido: boolean
          corretor_id: string
          corretor_leu_ate: string | null
          created_at: string
          e_teste: boolean
          id: string
          lead_id: string | null
          liberado_por_palavra_chave: boolean
          nao_lidas: number
          nome_cliente: string | null
          origem: "organica" | "campanha"
          pausado_humano_ate: string | null
          telefone_cliente: string
          ultima_interacao_em: string
          ultima_mensagem: string | null
          ultimo_aviso_evolucao_em: string | null
        }
        Insert: {
          alerta_quente_em?: string | null
          bot_ativo?: boolean
          cliente_conhecido?: boolean
          corretor_id: string
          corretor_leu_ate?: string | null
          created_at?: string
          e_teste?: boolean
          id?: string
          lead_id?: string | null
          liberado_por_palavra_chave?: boolean
          nao_lidas?: number
          nome_cliente?: string | null
          origem?: "organica" | "campanha"
          pausado_humano_ate?: string | null
          telefone_cliente: string
          ultima_interacao_em?: string
          ultima_mensagem?: string | null
          ultimo_aviso_evolucao_em?: string | null
        }
        Update: {
          alerta_quente_em?: string | null
          bot_ativo?: boolean
          cliente_conhecido?: boolean
          corretor_id?: string
          corretor_leu_ate?: string | null
          created_at?: string
          e_teste?: boolean
          id?: string
          lead_id?: string | null
          liberado_por_palavra_chave?: boolean
          nao_lidas?: number
          nome_cliente?: string | null
          origem?: "organica" | "campanha"
          pausado_humano_ate?: string | null
          telefone_cliente?: string
          ultima_interacao_em?: string
          ultima_mensagem?: string | null
          ultimo_aviso_evolucao_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_disparo_lock: {
        Row: {
          atualizado_em: string
          dono: string
          escopo: string
          travado_ate: string
        }
        Insert: {
          atualizado_em?: string
          dono: string
          escopo: string
          travado_ate: string
        }
        Update: {
          atualizado_em?: string
          dono?: string
          escopo?: string
          travado_ate?: string
        }
        Relationships: []
      }
      whatsapp_followups: {
        Row: {
          agendado_para: string
          conversa_id: string
          created_at: string
          enviado_em: string | null
          id: string
          instancia_id: string
          motivo: string | null
          status: "pendente" | "enviado" | "cancelado" | "descartado"
          tentativa: number
          tipo: "reengajamento" | "lembrete_visita"
        }
        Insert: {
          agendado_para: string
          conversa_id: string
          created_at?: string
          enviado_em?: string | null
          id?: string
          instancia_id: string
          motivo?: string | null
          status?: "pendente" | "enviado" | "cancelado" | "descartado"
          tentativa?: number
          tipo?: "reengajamento" | "lembrete_visita"
        }
        Update: {
          agendado_para?: string
          conversa_id?: string
          created_at?: string
          enviado_em?: string | null
          id?: string
          instancia_id?: string
          motivo?: string | null
          status?: "pendente" | "enviado" | "cancelado" | "descartado"
          tentativa?: number
          tipo?: "reengajamento" | "lembrete_visita"
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_followups_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_followups_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "corretor_whatsapp_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
          interacao_id: string | null
          midia_url: string | null
          provider_message_id: string | null
          remetente: "cliente" | "bot" | "corretor"
          status_entrega: "enviada" | "entregue" | "lida" | null
          tipo: "texto" | "audio" | "imagem" | "documento"
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string
          id?: string
          interacao_id?: string | null
          midia_url?: string | null
          provider_message_id?: string | null
          remetente: "cliente" | "bot" | "corretor"
          status_entrega?: "enviada" | "entregue" | "lida" | null
          tipo?: "texto" | "audio" | "imagem" | "documento"
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string
          id?: string
          interacao_id?: string | null
          midia_url?: string | null
          provider_message_id?: string | null
          remetente?: "cliente" | "bot" | "corretor"
          status_entrega?: "enviada" | "entregue" | "lida" | null
          tipo?: "texto" | "audio" | "imagem" | "documento"
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "ia_interacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      whatsapp_resposta_metricas: {
        Row: {
          atendidas_em_ate_60s: number | null
          conversas_atendidas: number | null
          conversas_com_fala_do_cliente: number | null
          corretor_id: string | null
          mediana_segundos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas_do_corretor: {
        Row: {
          conversa_id: string | null
          corretor_id: string | null
          etapa: string | null
          lead_id: string | null
          nao_lidas: number | null
          nome: string | null
          pessoa_id: string | null
          previa: string | null
          telefone: string | null
          tem_conversa: boolean | null
          ultima_atividade: string | null
        }
        Relationships: []
      }
      whatsapp_esperando_resposta: {
        Row: {
          conversa_id: string | null
          corretor_id: string | null
          esperando_desde: string | null
          lead_id: string | null
          nome_cliente: string | null
          telefone_cliente: string | null
        }
        Relationships: []
      }
      whatsapp_funil_metricas: {
        Row: {
          conversas: number | null
          conversas_com_lead: number | null
          corretor_id: string | null
          em_negociacao: number | null
          leads_quentes: number | null
          visitas_agendadas: number | null
          visitas_propostas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      configurar_disparo_automatico: {
        Args: { p_token: string; p_url: string }
        Returns: string
      }
      reservar_horario_visita: {
        Args: { p_lead_id: string; p_quando: string }
        Returns: boolean
      }
      configurar_followups_automaticos: {
        Args: { p_token: string; p_url: string }
        Returns: string
      }
      registrar_tentativa_contato: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      registrar_resposta_do_lead: {
        Args: { p_lead_id: string }
        Returns: undefined
      }
      consumir_cota_campanha: {
        Args: { p_instancia_id: string; p_limite: number }
        Returns: number
      }
      /**
       * 0062. Escrita à mão, como o resto das uniões deste arquivo: o
       * gerador devolveria `Json` para o retorno e o chamador perderia a
       * checagem dos motivos.
       */
      consumir_cota_campanha_espacada: {
        Args: {
          p_instancia_id: string
          p_limite: number
          p_intervalo_min?: number
          p_intervalo_max?: number
        }
        Returns: {
          ok: boolean
          motivo?:
            | "aguardando_intervalo"
            | "cota_diaria"
            | "numero_bloqueado"
            | "instancia_inexistente"
          espera_segundos?: number
          total?: number
          intervalo_segundos?: number
        }
      }
      corretor_atual: { Args: never; Returns: string }
      definir_papel_corretor: {
        Args: { alvo: string; novo_papel: string }
        Returns: undefined
      }
      desligar_disparo_automatico: { Args: never; Returns: string }
      sortear_corretor_whatsapp: {
        Args: never
        Returns: { corretor_id: string; telefone: string }[]
      }
      desligar_followups_automaticos: { Args: never; Returns: string }
      destravar_disparo: {
        Args: { p_dono: string; p_escopo: string }
        Returns: undefined
      }
      devolver_cota_campanha: {
        Args: { p_instancia_id: string }
        Returns: number
      }
      eh_gestor: { Args: never; Returns: boolean }
      normalizar_telefone_br: { Args: { bruto: string }; Returns: string }
      resetar_cota_campanha: {
        Args: { p_instancia_id: string }
        Returns: undefined
      }
      travar_disparo: {
        Args: { p_dono: string; p_escopo: string; p_segundos: number }
        Returns: boolean
      }
    }
    Enums: {
      finalidade_imovel: "lancamento" | "venda"
      status_obra:
        | "breve_lancamento"
        | "pre_lancamento"
        | "lancamento"
        | "em_construcao"
        | "ultimas_unidades"
        | "pronto_para_morar"
      tipo_imovel: "apartamento" | "alto_padrao" | "casa" | "terreno"
      tipo_midia: "foto" | "planta" | "video" | "tour360"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      finalidade_imovel: ["lancamento", "venda"],
      status_obra: [
        "breve_lancamento",
        "pre_lancamento",
        "lancamento",
        "em_construcao",
        "ultimas_unidades",
        "pronto_para_morar",
      ],
      tipo_imovel: ["apartamento", "alto_padrao", "casa", "terreno"],
      tipo_midia: ["foto", "planta", "video", "tour360"],
    },
  },
} as const
