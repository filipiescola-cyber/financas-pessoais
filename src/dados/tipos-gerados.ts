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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      aliquotas_ir: {
        Row: {
          aliquota: number
          dias_max: number | null
          dias_min: number
          id: string
        }
        Insert: {
          aliquota: number
          dias_max?: number | null
          dias_min: number
          id?: string
        }
        Update: {
          aliquota?: number
          dias_max?: number | null
          dias_min?: number
          id?: string
        }
        Relationships: []
      }
      amortizacoes_divida: {
        Row: {
          apos_parcela: number
          created_at: string
          data: string
          divida_id: string
          id: string
          modo: string
          parcelas_reduzidas: number
          transacao_id: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          apos_parcela: number
          created_at?: string
          data: string
          divida_id: string
          id?: string
          modo: string
          parcelas_reduzidas?: number
          transacao_id?: string | null
          usuario_id?: string
          valor: number
        }
        Update: {
          apos_parcela?: number
          created_at?: string
          data?: string
          divida_id?: string
          id?: string
          modo?: string
          parcelas_reduzidas?: number
          transacao_id?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "amortizacoes_divida_divida_id_fkey"
            columns: ["divida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amortizacoes_divida_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      aportes_meta: {
        Row: {
          created_at: string
          data: string
          id: string
          meta_id: string
          transacao_id: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          meta_id: string
          transacao_id?: string | null
          usuario_id?: string
          valor: number
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          meta_id?: string
          transacao_id?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "aportes_meta_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aportes_meta_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cartoes: {
        Row: {
          conta_id: string
          conta_pagamento_id: string | null
          dia_fechamento: number
          dia_vencimento: number
          limite: number | null
          usuario_id: string
        }
        Insert: {
          conta_id: string
          conta_pagamento_id?: string | null
          dia_fechamento: number
          dia_vencimento: number
          limite?: number | null
          usuario_id?: string
        }
        Update: {
          conta_id?: string
          conta_pagamento_id?: string | null
          dia_fechamento?: number
          dia_vencimento?: number
          limite?: number | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: true
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: true
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "cartoes_conta_pagamento_id_fkey"
            columns: ["conta_pagamento_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartoes_conta_pagamento_id_fkey"
            columns: ["conta_pagamento_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      categorias: {
        Row: {
          ativo: boolean
          categoria_pai_id: string | null
          cor: string | null
          icone: string | null
          id: string
          natureza: string | null
          nome: string
          sistema: boolean
          tipo: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          categoria_pai_id?: string | null
          cor?: string | null
          icone?: string | null
          id?: string
          natureza?: string | null
          nome: string
          sistema?: boolean
          tipo: string
          usuario_id?: string
        }
        Update: {
          ativo?: boolean
          categoria_pai_id?: string | null
          cor?: string | null
          icone?: string | null
          id?: string
          natureza?: string | null
          nome?: string
          sistema?: boolean
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          chave: string
          usuario_id: string
          valor: Json
        }
        Insert: {
          chave: string
          usuario_id?: string
          valor: Json
        }
        Update: {
          chave?: string
          usuario_id?: string
          valor?: Json
        }
        Relationships: []
      }
      contas: {
        Row: {
          ativo: boolean
          conta_pai_id: string | null
          cor: string | null
          created_at: string
          data_conferencia: string | null
          encerrada_em: string | null
          id: string
          instituicao: string | null
          nome: string
          pluggy_account_id: string | null
          saldo_conferido: number | null
          saldo_inicial: number
          tipo: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          conta_pai_id?: string | null
          cor?: string | null
          created_at?: string
          data_conferencia?: string | null
          encerrada_em?: string | null
          id?: string
          instituicao?: string | null
          nome: string
          pluggy_account_id?: string | null
          saldo_conferido?: number | null
          saldo_inicial?: number
          tipo: string
          usuario_id?: string
        }
        Update: {
          ativo?: boolean
          conta_pai_id?: string | null
          cor?: string | null
          created_at?: string
          data_conferencia?: string | null
          encerrada_em?: string | null
          id?: string
          instituicao?: string | null
          nome?: string
          pluggy_account_id?: string | null
          saldo_conferido?: number | null
          saldo_inicial?: number
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_conta_pai_id_fkey"
            columns: ["conta_pai_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_conta_pai_id_fkey"
            columns: ["conta_pai_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      dividas: {
        Row: {
          ativo: boolean
          categoria_juros_id: string | null
          conta_id: string | null
          cor: string | null
          created_at: string
          id: string
          instituicao: string | null
          nome: string
          parcelas: number
          parcelas_pagas: number
          primeira_parcela: string
          quitada_em: string | null
          sistema: string
          taxa_mensal: number
          usuario_id: string
          valor_financiado: number
        }
        Insert: {
          ativo?: boolean
          categoria_juros_id?: string | null
          conta_id?: string | null
          cor?: string | null
          created_at?: string
          id?: string
          instituicao?: string | null
          nome: string
          parcelas: number
          parcelas_pagas?: number
          primeira_parcela: string
          quitada_em?: string | null
          sistema?: string
          taxa_mensal?: number
          usuario_id?: string
          valor_financiado: number
        }
        Update: {
          ativo?: boolean
          categoria_juros_id?: string | null
          conta_id?: string | null
          cor?: string | null
          created_at?: string
          id?: string
          instituicao?: string | null
          nome?: string
          parcelas?: number
          parcelas_pagas?: number
          primeira_parcela?: string
          quitada_em?: string | null
          sistema?: string
          taxa_mensal?: number
          usuario_id?: string
          valor_financiado?: number
        }
        Relationships: [
          {
            foreignKeyName: "dividas_categoria_juros_id_fkey"
            columns: ["categoria_juros_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      faturas: {
        Row: {
          cartao_id: string
          data_fechamento: string
          data_vencimento: string
          id: string
          mes_referencia: string
          status: string
          transacao_pagamento_id: string | null
          usuario_id: string
          valor_total: number
        }
        Insert: {
          cartao_id: string
          data_fechamento: string
          data_vencimento: string
          id?: string
          mes_referencia: string
          status?: string
          transacao_pagamento_id?: string | null
          usuario_id?: string
          valor_total?: number
        }
        Update: {
          cartao_id?: string
          data_fechamento?: string
          data_vencimento?: string
          id?: string
          mes_referencia?: string
          status?: string
          transacao_pagamento_id?: string | null
          usuario_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "faturas_transacao_pagamento_id_fkey"
            columns: ["transacao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          data: string
          descricao: string | null
        }
        Insert: {
          data: string
          descricao?: string | null
        }
        Update: {
          data?: string
          descricao?: string | null
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          conciliadas: number
          conta_id: string
          formato: string
          id: string
          ignoradas_duplicadas: number
          importadas: number
          importado_em: string
          nome_arquivo: string
          periodo_fim: string | null
          periodo_inicio: string | null
          total_linhas: number
          usuario_id: string
        }
        Insert: {
          conciliadas?: number
          conta_id: string
          formato: string
          id?: string
          ignoradas_duplicadas?: number
          importadas?: number
          importado_em?: string
          nome_arquivo: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          total_linhas?: number
          usuario_id?: string
        }
        Update: {
          conciliadas?: number
          conta_id?: string
          formato?: string
          id?: string
          ignoradas_duplicadas?: number
          importadas?: number
          importado_em?: string
          nome_arquivo?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          total_linhas?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      indexadores: {
        Row: {
          id: string
          nome: string
          taxa_anual: number
          vigente_desde: string
        }
        Insert: {
          id?: string
          nome: string
          taxa_anual: number
          vigente_desde: string
        }
        Update: {
          id?: string
          nome?: string
          taxa_anual?: number
          vigente_desde?: string
        }
        Relationships: []
      }
      investimentos: {
        Row: {
          ativo: boolean
          calculo_automatico: boolean
          conta_id: string | null
          cotacao_moeda: number | null
          data_aplicacao: string
          data_conferencia: string | null
          data_cotacao: string | null
          id: string
          indexador: string | null
          instituicao: string | null
          isento_ir: boolean
          liquidez_diaria: boolean
          moeda: string
          nome: string
          percentual_indexador: number | null
          por_cotacao: boolean
          preco_unitario: number | null
          saldo_conferido: number | null
          saldo_manual: number | null
          taxa_prefixada: number | null
          tipo: string
          usuario_id: string
          valor_aplicado: number
          vencimento: string | null
        }
        Insert: {
          ativo?: boolean
          calculo_automatico?: boolean
          conta_id?: string | null
          cotacao_moeda?: number | null
          data_aplicacao: string
          data_conferencia?: string | null
          data_cotacao?: string | null
          id?: string
          indexador?: string | null
          instituicao?: string | null
          isento_ir?: boolean
          liquidez_diaria?: boolean
          moeda?: string
          nome: string
          percentual_indexador?: number | null
          por_cotacao?: boolean
          preco_unitario?: number | null
          saldo_conferido?: number | null
          saldo_manual?: number | null
          taxa_prefixada?: number | null
          tipo: string
          usuario_id?: string
          valor_aplicado: number
          vencimento?: string | null
        }
        Update: {
          ativo?: boolean
          calculo_automatico?: boolean
          conta_id?: string | null
          cotacao_moeda?: number | null
          data_aplicacao?: string
          data_conferencia?: string | null
          data_cotacao?: string | null
          id?: string
          indexador?: string | null
          instituicao?: string | null
          isento_ir?: boolean
          liquidez_diaria?: boolean
          moeda?: string
          nome?: string
          percentual_indexador?: number | null
          por_cotacao?: boolean
          preco_unitario?: number | null
          saldo_conferido?: number | null
          saldo_manual?: number | null
          taxa_prefixada?: number | null
          tipo?: string
          usuario_id?: string
          valor_aplicado?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investimentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investimentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      memoria_descricao: {
        Row: {
          categoria_id: string | null
          conta_id: string | null
          descricao: string
          id: string
          ultimo_uso: string
          usuario_id: string
          vezes_usada: number
        }
        Insert: {
          categoria_id?: string | null
          conta_id?: string | null
          descricao: string
          id?: string
          ultimo_uso?: string
          usuario_id?: string
          vezes_usada?: number
        }
        Update: {
          categoria_id?: string | null
          conta_id?: string | null
          descricao?: string
          id?: string
          ultimo_uso?: string
          usuario_id?: string
          vezes_usada?: number
        }
        Relationships: [
          {
            foreignKeyName: "memoria_descricao_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_descricao_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memoria_descricao_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      metas: {
        Row: {
          fonte: string
          id: string
          nome: string
          prazo: string | null
          usuario_id: string
          valor_alvo: number
        }
        Insert: {
          fonte?: string
          id?: string
          nome: string
          prazo?: string | null
          usuario_id?: string
          valor_alvo: number
        }
        Update: {
          fonte?: string
          id?: string
          nome?: string
          prazo?: string | null
          usuario_id?: string
          valor_alvo?: number
        }
        Relationships: []
      }
      metas_investimentos: {
        Row: {
          investimento_id: string
          meta_id: string
          usuario_id: string
        }
        Insert: {
          investimento_id: string
          meta_id: string
          usuario_id?: string
        }
        Update: {
          investimento_id?: string
          meta_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_investimentos_investimento_id_fkey"
            columns: ["investimento_id"]
            isOneToOne: false
            referencedRelation: "investimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_investimentos_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos: {
        Row: {
          categoria_id: string | null
          conta_id: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number
          tipo: string
          usuario_id: string
          valor_padrao: number | null
        }
        Insert: {
          categoria_id?: string | null
          conta_id?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          tipo?: string
          usuario_id?: string
          valor_padrao?: number | null
        }
        Update: {
          categoria_id?: string | null
          conta_id?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          tipo?: string
          usuario_id?: string
          valor_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modelos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      movimentacoes_investimento: {
        Row: {
          cotacao_moeda: number | null
          data: string
          id: string
          investimento_id: string
          percentual_indexador: number | null
          preco_unitario: number | null
          quantidade: number | null
          tipo: string
          transacao_id: string | null
          usuario_id: string
          valor: number
          vencimento: string | null
        }
        Insert: {
          cotacao_moeda?: number | null
          data: string
          id?: string
          investimento_id: string
          percentual_indexador?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          tipo: string
          transacao_id?: string | null
          usuario_id?: string
          valor: number
          vencimento?: string | null
        }
        Update: {
          cotacao_moeda?: number | null
          data?: string
          id?: string
          investimento_id?: string
          percentual_indexador?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          tipo?: string
          transacao_id?: string | null
          usuario_id?: string
          valor?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_investimento_investimento_id_fkey"
            columns: ["investimento_id"]
            isOneToOne: false
            referencedRelation: "investimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_investimento_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ocorrencias_puladas: {
        Row: {
          created_at: string
          data_competencia: string
          recorrencia_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          data_competencia: string
          recorrencia_id: string
          usuario_id?: string
        }
        Update: {
          created_at?: string
          data_competencia?: string
          recorrencia_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencias_puladas_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          categoria_id: string
          id: string
          mes_referencia: string
          usuario_id: string
          valor_planejado: number
        }
        Insert: {
          categoria_id: string
          id?: string
          mes_referencia: string
          usuario_id?: string
          valor_planejado: number
        }
        Update: {
          categoria_id?: string
          id?: string
          mes_referencia?: string
          usuario_id?: string
          valor_planejado?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_importacao: {
        Row: {
          col_data: number | null
          col_descricao: number | null
          col_valor: number | null
          col_valor_saida: number | null
          conta_id: string | null
          decimal_virgula: boolean
          delimitador: string | null
          formato: string
          formato_data: string | null
          id: string
          inverter_sinal: boolean
          linhas_cabecalho: number
          nome: string
          usuario_id: string
        }
        Insert: {
          col_data?: number | null
          col_descricao?: number | null
          col_valor?: number | null
          col_valor_saida?: number | null
          conta_id?: string | null
          decimal_virgula?: boolean
          delimitador?: string | null
          formato: string
          formato_data?: string | null
          id?: string
          inverter_sinal?: boolean
          linhas_cabecalho?: number
          nome: string
          usuario_id?: string
        }
        Update: {
          col_data?: number | null
          col_descricao?: number | null
          col_valor?: number | null
          col_valor_saida?: number | null
          conta_id?: string | null
          decimal_virgula?: boolean
          delimitador?: string | null
          formato?: string
          formato_data?: string | null
          id?: string
          inverter_sinal?: boolean
          linhas_cabecalho?: number
          nome?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_importacao_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_importacao_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      recorrencias: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          comeca_em: string
          conta_id: string
          created_at: string
          descricao: string
          dia: number
          frequencia: string
          id: string
          incremento: number
          natureza: string | null
          regra_do_dia: string
          termina_em: string | null
          tipo: string
          usuario_id: string
          valor_previsto: number | null
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          comeca_em?: string
          conta_id: string
          created_at?: string
          descricao: string
          dia: number
          frequencia: string
          id?: string
          incremento?: number
          natureza?: string | null
          regra_do_dia?: string
          termina_em?: string | null
          tipo?: string
          usuario_id?: string
          valor_previsto?: number | null
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          comeca_em?: string
          conta_id?: string
          created_at?: string
          descricao?: string
          dia?: number
          frequencia?: string
          id?: string
          incremento?: number
          natureza?: string | null
          regra_do_dia?: string
          termina_em?: string | null
          tipo?: string
          usuario_id?: string
          valor_previsto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      rendimentos: {
        Row: {
          data: string
          id: string
          investimento_id: string
          rendimento_acumulado: number
          rendimento_dia: number
          saldo_bruto: number
          usuario_id: string
        }
        Insert: {
          data: string
          id?: string
          investimento_id: string
          rendimento_acumulado: number
          rendimento_dia: number
          saldo_bruto: number
          usuario_id?: string
        }
        Update: {
          data?: string
          id?: string
          investimento_id?: string
          rendimento_acumulado?: number
          rendimento_dia?: number
          saldo_bruto?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rendimentos_investimento_id_fkey"
            columns: ["investimento_id"]
            isOneToOne: false
            referencedRelation: "investimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes: {
        Row: {
          categoria_id: string | null
          conta_id: string
          created_at: string
          data_caixa: string
          data_competencia: string
          descricao: string | null
          descricao_original: string | null
          divida_id: string | null
          divida_parcela: number | null
          fatura_id: string | null
          fatura_paga_id: string | null
          fitid: string | null
          grupo_parcelamento_id: string | null
          id: string
          importacao_id: string | null
          motivo_empresa: string | null
          natureza: string | null
          observacao: string | null
          origem: string
          parcela_num: number | null
          parcela_total: number | null
          pluggy_transaction_id: string | null
          recorrencia_id: string | null
          revisado: boolean
          rotativo_de_fatura_id: string | null
          tipo: string
          transacao_pai_id: string | null
          transferencia_par_id: string | null
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          conta_id: string
          created_at?: string
          data_caixa: string
          data_competencia: string
          descricao?: string | null
          descricao_original?: string | null
          divida_id?: string | null
          divida_parcela?: number | null
          fatura_id?: string | null
          fatura_paga_id?: string | null
          fitid?: string | null
          grupo_parcelamento_id?: string | null
          id?: string
          importacao_id?: string | null
          motivo_empresa?: string | null
          natureza?: string | null
          observacao?: string | null
          origem?: string
          parcela_num?: number | null
          parcela_total?: number | null
          pluggy_transaction_id?: string | null
          recorrencia_id?: string | null
          revisado?: boolean
          rotativo_de_fatura_id?: string | null
          tipo: string
          transacao_pai_id?: string | null
          transferencia_par_id?: string | null
          usuario_id?: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          conta_id?: string
          created_at?: string
          data_caixa?: string
          data_competencia?: string
          descricao?: string | null
          descricao_original?: string | null
          divida_id?: string | null
          divida_parcela?: number | null
          fatura_id?: string | null
          fatura_paga_id?: string | null
          fitid?: string | null
          grupo_parcelamento_id?: string | null
          id?: string
          importacao_id?: string | null
          motivo_empresa?: string | null
          natureza?: string | null
          observacao?: string | null
          origem?: string
          parcela_num?: number | null
          parcela_total?: number | null
          pluggy_transaction_id?: string | null
          recorrencia_id?: string | null
          revisado?: boolean
          rotativo_de_fatura_id?: string | null
          tipo?: string
          transacao_pai_id?: string | null
          transferencia_par_id?: string | null
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "saldos_contas"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "transacoes_divida_id_fkey"
            columns: ["divida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_fatura_fk"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_fatura_paga_id_fkey"
            columns: ["fatura_paga_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_importacao_fk"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_recorrencia_fk"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_rotativo_de_fatura_id_fkey"
            columns: ["rotativo_de_fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transacao_pai_id_fkey"
            columns: ["transacao_pai_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_transferencia_par_id_fkey"
            columns: ["transferencia_par_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      saldos_contas: {
        Row: {
          ativo: boolean | null
          conta_id: string | null
          conta_nome: string | null
          conta_tipo: string | null
          saldo_atual: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      saldo_ate: { Args: { p_conta?: string; p_data: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
