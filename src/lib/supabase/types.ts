/**
 * Tipos gerados a partir do projeto Supabase real (prhhrqyubjcafvucirri) via
 * Management API — `types/typescript`. Não editar à mão; regenerar sempre
 * que `supabase/migrations/` mudar. Última geração: depois da 0024
 * (aplicada manualmente à conexão direta com Postgres — `gen types` local
 * exige Docker, indisponível neste ambiente; colunas conferidas por
 * introspecção antes de editar este arquivo).
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
      cliques_whatsapp: {
        Row: {
          id: string
          created_at: string
          corretor_id: string | null
          empreendimento_id: string | null
          origem: string
          url_origem: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          corretor_id?: string | null
          empreendimento_id?: string | null
          origem: string
          url_origem?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          corretor_id?: string | null
          empreendimento_id?: string | null
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
      corretores: {
        Row: {
          ativo: boolean
          bio: string | null
          created_at: string
          creci: string
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
          whatsapp: string
          video_url: string | null
        }
        Insert: {
          ativo?: boolean
          bio?: string | null
          created_at?: string
          creci: string
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
          whatsapp: string
          video_url?: string | null
        }
        Update: {
          ativo?: boolean
          bio?: string | null
          created_at?: string
          creci?: string
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
          whatsapp?: string
          video_url?: string | null
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
          id: string
          lead_id: string | null
          corretor_id: string
          mensagem_enviada: string
          status_envio: string
          created_at: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          corretor_id: string
          mensagem_enviada: string
          status_envio?: string
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          corretor_id?: string
          mensagem_enviada?: string
          status_envio?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_envios_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "corretores"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_precos_lotes: {
        Row: {
          id: string
          nome_lote: string
          gestor_id: string | null
          total_imoveis: number
          status: string
          created_at: string
          revertido_em: string | null
        }
        Insert: {
          id?: string
          nome_lote: string
          gestor_id?: string | null
          total_imoveis?: number
          status?: string
          created_at?: string
          revertido_em?: string | null
        }
        Update: {
          id?: string
          nome_lote?: string
          gestor_id?: string | null
          total_imoveis?: number
          status?: string
          created_at?: string
          revertido_em?: string | null
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
      historico_precos_itens: {
        Row: {
          id: string
          lote_id: string
          empreendimento_id: string
          preco_anterior: number | null
          preco_novo: number
          variacao_reais: number | null
          variacao_percentual: number | null
          created_at: string
        }
        Insert: {
          id?: string
          lote_id: string
          empreendimento_id: string
          preco_anterior?: number | null
          preco_novo: number
          variacao_reais?: number | null
          variacao_percentual?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          lote_id?: string
          empreendimento_id?: string
          preco_anterior?: number | null
          preco_novo?: number
          variacao_reais?: number | null
          variacao_percentual?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_precos_itens_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "historico_precos_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_precos_itens_empreendimento_id_fkey"
            columns: ["empreendimento_id"]
            isOneToOne: false
            referencedRelation: "empreendimentos"
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
      leads: {
        Row: {
          anuncio_origem: string | null
          consentimento_lgpd: boolean
          corretor_id: string | null
          created_at: string
          detalhes: Json | null
          email: string | null
          email_message_id: string | null
          empreendimento_id: string | null
          etapa: string
          etapa_alterada_em: string
          id: string
          meta_lead_id: string | null
          mensagem: string | null
          nome: string
          origem: string | null
          origem_atribuicao: string | null
          portal_origem: string | null
          telefone: string | null
          telefone_e164: string | null
          tipo: string
          visita_agendada_em: string | null
        }
        Insert: {
          anuncio_origem?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json | null
          email?: string | null
          email_message_id?: string | null
          empreendimento_id?: string | null
          etapa?: string
          etapa_alterada_em?: string
          id?: string
          meta_lead_id?: string | null
          mensagem?: string | null
          nome: string
          origem?: string | null
          origem_atribuicao?: string | null
          portal_origem?: string | null
          telefone?: string | null
          telefone_e164?: string | null
          tipo?: string
          visita_agendada_em?: string | null
        }
        Update: {
          anuncio_origem?: string | null
          consentimento_lgpd?: boolean
          corretor_id?: string | null
          created_at?: string
          detalhes?: Json | null
          email?: string | null
          email_message_id?: string | null
          empreendimento_id?: string | null
          etapa?: string
          etapa_alterada_em?: string
          id?: string
          meta_lead_id?: string | null
          mensagem?: string | null
          nome?: string
          origem?: string | null
          origem_atribuicao?: string | null
          portal_origem?: string | null
          telefone?: string | null
          telefone_e164?: string | null
          tipo?: string
          visita_agendada_em?: string | null
        }
        Relationships: [
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
          id: string
          corretor_id: string
          titulo: string
          conteudo: string
          padrao: boolean
          created_at: string
        }
        Insert: {
          id?: string
          corretor_id: string
          titulo: string
          conteudo: string
          padrao?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          corretor_id?: string
          titulo?: string
          conteudo?: string
          padrao?: boolean
          created_at?: string
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
      corretor_whatsapp_instancias: {
        Row: {
          id: string
          corretor_id: string
          instance_name: string
          status_conexao: "desconectado" | "conectando" | "conectado"
          telefone_conectado: string | null
          qrcode_base64: string | null
          modo_bot: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado"
          nome_assistente: string
          tom_voz: string
          webhook_secret: string | null
          palavra_chave_ativacao: string | null
          conectado_em: string | null
          envios_campanha_data: string | null
          envios_campanha_contador: number
          falhas_seguidas: number
          bloqueado_ate: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          corretor_id: string
          instance_name: string
          status_conexao?: "desconectado" | "conectando" | "conectado"
          telefone_conectado?: string | null
          qrcode_base64?: string | null
          modo_bot?: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado"
          nome_assistente?: string
          tom_voz?: string
          webhook_secret?: string | null
          palavra_chave_ativacao?: string | null
          conectado_em?: string | null
          envios_campanha_data?: string | null
          envios_campanha_contador?: number
          falhas_seguidas?: number
          bloqueado_ate?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          corretor_id?: string
          instance_name?: string
          status_conexao?: "desconectado" | "conectando" | "conectado"
          telefone_conectado?: string | null
          qrcode_base64?: string | null
          modo_bot?: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado"
          nome_assistente?: string
          tom_voz?: string
          webhook_secret?: string | null
          palavra_chave_ativacao?: string | null
          conectado_em?: string | null
          envios_campanha_data?: string | null
          envios_campanha_contador?: number
          falhas_seguidas?: number
          bloqueado_ate?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_conversas: {
        Row: {
          id: string
          corretor_id: string
          lead_id: string | null
          telefone_cliente: string
          nome_cliente: string | null
          alerta_quente_em: string | null
          bot_ativo: boolean
          pausado_humano_ate: string | null
          origem: "organica" | "campanha"
          liberado_por_palavra_chave: boolean
          ultima_mensagem: string | null
          ultima_interacao_em: string
          created_at: string
        }
        Insert: {
          id?: string
          corretor_id: string
          lead_id?: string | null
          telefone_cliente: string
          nome_cliente?: string | null
          alerta_quente_em?: string | null
          bot_ativo?: boolean
          pausado_humano_ate?: string | null
          origem?: "organica" | "campanha"
          liberado_por_palavra_chave?: boolean
          ultima_mensagem?: string | null
          ultima_interacao_em?: string
          created_at?: string
        }
        Update: {
          id?: string
          corretor_id?: string
          lead_id?: string | null
          telefone_cliente?: string
          nome_cliente?: string | null
          alerta_quente_em?: string | null
          bot_ativo?: boolean
          pausado_humano_ate?: string | null
          origem?: "organica" | "campanha"
          liberado_por_palavra_chave?: boolean
          ultima_mensagem?: string | null
          ultima_interacao_em?: string
          created_at?: string
        }
        Relationships: []
      }
      whatsapp_disparo_lock: {
        Row: {
          escopo: string
          dono: string
          travado_ate: string
          atualizado_em: string
        }
        Insert: {
          escopo: string
          dono: string
          travado_ate: string
          atualizado_em?: string
        }
        Update: {
          escopo?: string
          dono?: string
          travado_ate?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      whatsapp_followups: {
        Row: {
          id: string
          conversa_id: string
          instancia_id: string
          agendado_para: string
          tentativa: number
          status: "pendente" | "enviado" | "cancelado" | "descartado"
          motivo: string | null
          created_at: string
          enviado_em: string | null
        }
        Insert: {
          id?: string
          conversa_id: string
          instancia_id: string
          agendado_para: string
          tentativa?: number
          status?: "pendente" | "enviado" | "cancelado" | "descartado"
          motivo?: string | null
          created_at?: string
          enviado_em?: string | null
        }
        Update: {
          id?: string
          conversa_id?: string
          instancia_id?: string
          agendado_para?: string
          tentativa?: number
          status?: "pendente" | "enviado" | "cancelado" | "descartado"
          motivo?: string | null
          created_at?: string
          enviado_em?: string | null
        }
        Relationships: []
      }
      ia_interacoes: {
        Row: {
          id: string
          conversa_id: string | null
          corretor_id: string | null
          origem: "webhook" | "playground" | "followup" | "eval"
          prompt_versao: string
          modelo: string
          latencia_ms: number | null
          fallback: boolean
          acao: string | null
          sugeriu_visita: boolean | null
          transferiu_humano: boolean | null
          anexos_enviados: number | null
          anexos_bloqueados: number | null
          temperatura_score: number | null
          tokens_entrada: number | null
          tokens_saida: number | null
          avaliacao: "boa" | "ruim" | null
          created_at: string
        }
        Insert: {
          id?: string
          conversa_id?: string | null
          corretor_id?: string | null
          origem: "webhook" | "playground" | "followup" | "eval"
          prompt_versao: string
          modelo?: string
          latencia_ms?: number | null
          fallback?: boolean
          acao?: string | null
          sugeriu_visita?: boolean | null
          transferiu_humano?: boolean | null
          anexos_enviados?: number | null
          anexos_bloqueados?: number | null
          temperatura_score?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          avaliacao?: "boa" | "ruim" | null
          created_at?: string
        }
        Update: {
          avaliacao?: "boa" | "ruim" | null
          acao?: string | null
        }
        Relationships: []
      }
      whatsapp_mensagens: {
        Row: {
          id: string
          conversa_id: string
          remetente: "cliente" | "bot" | "corretor"
          tipo: "texto" | "audio" | "imagem" | "documento"
          conteudo: string
          midia_url: string | null
          provider_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversa_id: string
          remetente: "cliente" | "bot" | "corretor"
          tipo?: "texto" | "audio" | "imagem" | "documento"
          conteudo: string
          midia_url?: string | null
          provider_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversa_id?: string
          remetente?: "cliente" | "bot" | "corretor"
          tipo?: "texto" | "audio" | "imagem" | "documento"
          conteudo?: string
          midia_url?: string | null
          provider_message_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      whatsapp_campanhas: {
        Row: {
          id: string
          corretor_id: string
          titulo: string
          empreendimento_id: string | null
          mensagem_base: string
          total_leads: number
          total_enviados: number
          total_respondidos: number
          status: "rascunho" | "em_andamento" | "pausada" | "concluida"
          created_at: string
        }
        Insert: {
          id?: string
          corretor_id: string
          titulo: string
          empreendimento_id?: string | null
          mensagem_base: string
          total_leads?: number
          total_enviados?: number
          total_respondidos?: number
          status?: "rascunho" | "em_andamento" | "pausada" | "concluida"
          created_at?: string
        }
        Update: {
          id?: string
          corretor_id?: string
          titulo?: string
          empreendimento_id?: string | null
          mensagem_base?: string
          total_leads?: number
          total_enviados?: number
          total_respondidos?: number
          status?: "rascunho" | "em_andamento" | "pausada" | "concluida"
          created_at?: string
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
          id: string
          campanha_id: string
          lead_id: string | null
          telefone: string
          mensagem_personalizada: string
          personalizado_por_ia: boolean
          tentativas: number
          status: "pendente" | "enviado" | "erro" | "respondido"
          agendado_para: string
          enviado_em: string | null
          resposta_em: string | null
          erro_motivo: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campanha_id: string
          lead_id?: string | null
          telefone: string
          mensagem_personalizada: string
          personalizado_por_ia?: boolean
          tentativas?: number
          status?: "pendente" | "enviado" | "erro" | "respondido"
          agendado_para?: string
          enviado_em?: string | null
          resposta_em?: string | null
          erro_motivo?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campanha_id?: string
          lead_id?: string | null
          telefone?: string
          mensagem_personalizada?: string
          personalizado_por_ia?: boolean
          tentativas?: number
          status?: "pendente" | "enviado" | "erro" | "respondido"
          agendado_para?: string
          enviado_em?: string | null
          resposta_em?: string | null
          erro_motivo?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lead_observacoes_ia: {
        Row: {
          id: string
          lead_id: string
          orcamento_min: number | null
          orcamento_max: number | null
          forma_pagamento: string | null
          perfil_familiar: string | null
          urgencia_mudanca: string | null
          exigencias_especificas: any
          objecoes_identificadas: any
          temperatura_score: number
          temperatura_label: "quente" | "morno" | "frio"
          resumo_executivo: string
          proximo_passo_sugerido: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          orcamento_min?: number | null
          orcamento_max?: number | null
          forma_pagamento?: string | null
          perfil_familiar?: string | null
          urgencia_mudanca?: string | null
          exigencias_especificas?: any
          objecoes_identificadas?: any
          temperatura_score?: number
          temperatura_label?: "quente" | "morno" | "frio"
          resumo_executivo: string
          proximo_passo_sugerido?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          orcamento_min?: number | null
          orcamento_max?: number | null
          forma_pagamento?: string | null
          perfil_familiar?: string | null
          urgencia_mudanca?: string | null
          exigencias_especificas?: any
          objecoes_identificadas?: any
          temperatura_score?: number
          temperatura_label?: "quente" | "morno" | "frio"
          resumo_executivo?: string
          proximo_passo_sugerido?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      whatsapp_funil_metricas: {
        Row: {
          corretor_id: string | null
          conversas: number | null
          conversas_com_lead: number | null
          leads_quentes: number | null
          visitas_agendadas: number | null
          em_negociacao: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      corretor_atual: { Args: never; Returns: string }
      eh_gestor: { Args: never; Returns: boolean }
      consumir_cota_campanha: {
        Args: { p_instancia_id: string; p_limite: number }
        Returns: number
      }
      travar_disparo: {
        Args: { p_dono: string; p_escopo: string; p_segundos: number }
        Returns: boolean
      }
      destravar_disparo: {
        Args: { p_dono: string; p_escopo: string }
        Returns: undefined
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

