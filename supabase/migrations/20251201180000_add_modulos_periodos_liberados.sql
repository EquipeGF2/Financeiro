-- ============================================================================
-- MIGRATION: Adicionar controle de módulos em períodos liberados
-- Data: 2025-12-01
-- Descrição: Adiciona campos para controlar quais módulos estão liberados
--            (saldo_diario, previsao_semanal, cobranca)
-- ============================================================================

-- Adicionar colunas para controlar módulos liberados
ALTER TABLE financas.per_periodos_liberados
  ADD COLUMN IF NOT EXISTS per_saldo_diario boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS per_previsao_semanal boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS per_cobranca boolean DEFAULT false;

-- Comentários
COMMENT ON COLUMN financas.per_periodos_liberados.per_saldo_diario
  IS 'Indica se o período está liberado para Saldo Diário';
COMMENT ON COLUMN financas.per_periodos_liberados.per_previsao_semanal
  IS 'Indica se o período está liberado para Previsão Semanal';
COMMENT ON COLUMN financas.per_periodos_liberados.per_cobranca
  IS 'Indica se o período está liberado para Cobranças';

-- Atualizar registros existentes para manter compatibilidade
-- (todos os períodos liberados existentes eram apenas para saldo diário)
UPDATE financas.per_periodos_liberados
SET
  per_saldo_diario = true,
  per_previsao_semanal = false,
  per_cobranca = false
WHERE per_saldo_diario IS NULL;
