-- ============================================================================
-- MIGRATION: Backfill automático do saldo diário (retroativo)
-- Data: 2025-12-02
-- Descrição: Cria função para preencher registros históricos na tabela
--            sdd_saldo_diario usando os saldos consolidados por banco e
--            executa o backfill imediatamente, mesmo para períodos fechados.
-- ============================================================================

-- Função utilitária para preencher saldos diários retroativos
CREATE OR REPLACE FUNCTION financas.preencher_saldos_diarios_retroativos(
  p_usr_id uuid DEFAULT NULL
)
RETURNS TABLE(
  processados integer,
  inseridos integer,
  atualizados integer,
  usr_id uuid
) AS $$
DECLARE
  v_usr_id uuid;
BEGIN
  SELECT COALESCE(
    p_usr_id,
    (SELECT sdd_usr_id FROM financas.sdd_saldo_diario ORDER BY sdd_criado_em DESC LIMIT 1),
    (SELECT sdb_usr_id FROM financas.sdb_saldo_banco ORDER BY sdb_criado_em DESC LIMIT 1),
    (SELECT u.usr_id FROM financas.usr_usuarios u ORDER BY usr_criado_em DESC LIMIT 1)
  )
  INTO v_usr_id;

  IF v_usr_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar um usuário para registrar os saldos diários.';
  END IF;

  RETURN QUERY WITH totais AS (
    SELECT
      sdd_data AS data_referencia,
      sdd_saldo_final AS saldo_final
    FROM financas.sdd_saldo_diario
  ), calculado AS (
    SELECT
      data_referencia,
      COALESCE(LAG(saldo_final) OVER (ORDER BY data_referencia), saldo_final, 0) AS saldo_inicial,
      saldo_final
    FROM totais
  ), upsert AS (
    INSERT INTO financas.sdd_saldo_diario (
      sdd_data,
      sdd_saldo_inicial,
      sdd_saldo_final,
      sdd_descricao,
      sdd_usr_id
    )
    SELECT
      data_referencia,
      saldo_inicial,
      saldo_final,
      'Backfill automático de saldos históricos',
      v_usr_id
    FROM calculado
    ON CONFLICT (sdd_data) DO UPDATE
      SET
        sdd_saldo_inicial = EXCLUDED.sdd_saldo_inicial,
        sdd_saldo_final = EXCLUDED.sdd_saldo_final,
        sdd_usr_id = EXCLUDED.sdd_usr_id,
        sdd_descricao = EXCLUDED.sdd_descricao,
        sdd_atualizado_em = now()
    RETURNING xmax = 0 AS inserted
  )
  SELECT
    COUNT(*)::integer AS processados,
    COUNT(*) FILTER (WHERE inserted)::integer AS inseridos,
    COUNT(*) FILTER (WHERE NOT inserted)::integer AS atualizados,
    v_usr_id AS usr_id
  FROM upsert;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, financas;

GRANT EXECUTE ON FUNCTION financas.preencher_saldos_diarios_retroativos(uuid) TO anon, authenticated, service_role;

-- Executa o backfill imediatamente para popular períodos retroativos
DO $$
DECLARE
  resultado RECORD;
BEGIN
  SELECT * INTO resultado FROM financas.preencher_saldos_diarios_retroativos();
  RAISE NOTICE 'Backfill saldo diário: % processados (% inseridos, % atualizados) com usr_id %',
    resultado.processados,
    resultado.inseridos,
    resultado.atualizados,
    resultado.usr_id;
END;
$$;
