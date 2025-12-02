-- =============================================================================
-- MIGRATION: Criar tabela de total diário de receitas de cobrança
-- Data: 2025-12-20
-- Descrição: Armazena o somatório diário dos lançamentos de cobrança para
--            comparação com os valores lançados no Saldo Diário.
-- =============================================================================

-- Limpeza preventiva
DROP TABLE IF EXISTS financas.cob_receita_total CASCADE;
DROP FUNCTION IF EXISTS financas.recalcular_cob_receita_total(date) CASCADE;
DROP FUNCTION IF EXISTS financas.sync_cob_receita_total() CASCADE;

-- =============================================================================
-- TABELA: cob_receita_total
-- =============================================================================
CREATE TABLE financas.cob_receita_total (
  crt_data date PRIMARY KEY,
  crt_valor_total numeric(15,2) NOT NULL DEFAULT 0,
  crt_qtd_lancamentos integer NOT NULL DEFAULT 0,
  crt_criado_em timestamptz DEFAULT now(),
  crt_atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE financas.cob_receita_total IS 'Totais diários das receitas lançadas na cobrança para conciliação com o saldo diário.';
COMMENT ON COLUMN financas.cob_receita_total.crt_data IS 'Data de referência do total diário.';
COMMENT ON COLUMN financas.cob_receita_total.crt_valor_total IS 'Somatório das receitas lançadas na cobrança na data.';
COMMENT ON COLUMN financas.cob_receita_total.crt_qtd_lancamentos IS 'Quantidade de lançamentos considerados no total diário.';

CREATE INDEX IF NOT EXISTS idx_cob_receita_total_data ON financas.cob_receita_total (crt_data DESC);

-- =============================================================================
-- FUNÇÕES DE SINCRONIZAÇÃO
-- =============================================================================
CREATE OR REPLACE FUNCTION financas.recalcular_cob_receita_total(p_data date)
RETURNS void AS $$
DECLARE
  v_total numeric(15,2);
  v_qtd   integer;
BEGIN
  SELECT COALESCE(SUM(cob_valor), 0), COUNT(*)
  INTO v_total, v_qtd
  FROM financas.cob_cobrancas
  WHERE cob_data = p_data;

  INSERT INTO financas.cob_receita_total (crt_data, crt_valor_total, crt_qtd_lancamentos, crt_criado_em)
  VALUES (p_data, v_total, v_qtd, now())
  ON CONFLICT (crt_data)
  DO UPDATE SET
    crt_valor_total    = EXCLUDED.crt_valor_total,
    crt_qtd_lancamentos = EXCLUDED.crt_qtd_lancamentos,
    crt_atualizado_em  = now();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION financas.recalcular_cob_receita_total IS 'Recalcula o total diário de receitas de cobrança para a data informada.';

CREATE OR REPLACE FUNCTION financas.sync_cob_receita_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalcular o dia afetado
  PERFORM financas.recalcular_cob_receita_total(COALESCE(NEW.cob_data, OLD.cob_data));

  -- Se houve mudança de data em updates, recalcular também a data anterior
  IF TG_OP = 'UPDATE' AND NEW.cob_data IS DISTINCT FROM OLD.cob_data THEN
    PERFORM financas.recalcular_cob_receita_total(OLD.cob_data);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cob_receita_total ON financas.cob_cobrancas;
CREATE TRIGGER trg_cob_receita_total
  AFTER INSERT OR UPDATE OR DELETE ON financas.cob_cobrancas
  FOR EACH ROW
  EXECUTE FUNCTION financas.sync_cob_receita_total();

-- Carga inicial com dados já existentes
INSERT INTO financas.cob_receita_total (crt_data, crt_valor_total, crt_qtd_lancamentos, crt_criado_em)
SELECT
  cob_data,
  COALESCE(SUM(cob_valor), 0) AS total,
  COUNT(*) AS quantidade,
  now()
FROM financas.cob_cobrancas
GROUP BY cob_data
ON CONFLICT (crt_data)
DO UPDATE SET
  crt_valor_total = EXCLUDED.crt_valor_total,
  crt_qtd_lancamentos = EXCLUDED.crt_qtd_lancamentos,
  crt_atualizado_em = now();

-- =============================================================================
-- RLS E PERMISSÕES
-- =============================================================================
ALTER TABLE financas.cob_receita_total ENABLE ROW LEVEL SECURITY;

CREATE POLICY cob_receita_total_select
  ON financas.cob_receita_total
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY cob_receita_total_insert
  ON financas.cob_receita_total
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY cob_receita_total_update
  ON financas.cob_receita_total
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON financas.cob_receita_total TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
