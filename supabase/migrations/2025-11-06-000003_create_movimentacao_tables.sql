-- ============================================================================
-- MIGRATION: Criar tabelas de movimentação (transacionais)
-- Data: 2025-11-06
-- Descrição: Tabelas pag_pagamentos_area, rec_receitas,
--            pbk_pagamentos_banco, sdb_saldo_banco
-- ============================================================================

-- ============================================================================
-- TABELA: pag_pagamentos_area (Pagamentos por Área)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.pag_pagamentos_area (
  pag_id bigserial PRIMARY KEY,
  pag_are_id bigint NOT NULL REFERENCES financas.are_areas(are_id) ON DELETE RESTRICT,
  pag_data date NOT NULL DEFAULT CURRENT_DATE,
  pag_valor numeric(15,2) NOT NULL,
  pag_descricao text,
  pag_observacao text,
  pag_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  pag_criado_em timestamptz DEFAULT now(),
  pag_atualizado_em timestamptz DEFAULT now(),

  -- Constraint para garantir valores positivos
  CONSTRAINT chk_pag_valor CHECK (pag_valor >= 0)
);

-- Comentários
COMMENT ON TABLE financas.pag_pagamentos_area IS 'Pagamentos diários por área de negócio';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_id IS 'ID único do pagamento';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_are_id IS 'Área de negócio relacionada';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_data IS 'Data do pagamento';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_valor IS 'Valor do pagamento (sempre positivo)';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_descricao IS 'Descrição do pagamento';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_observacao IS 'Observações adicionais';
COMMENT ON COLUMN financas.pag_pagamentos_area.pag_usr_id IS 'Usuário que registrou o pagamento';

-- Índices
CREATE INDEX IF NOT EXISTS idx_pag_are_id ON financas.pag_pagamentos_area(pag_are_id);
CREATE INDEX IF NOT EXISTS idx_pag_data ON financas.pag_pagamentos_area(pag_data DESC);
CREATE INDEX IF NOT EXISTS idx_pag_usr_id ON financas.pag_pagamentos_area(pag_usr_id);
CREATE INDEX IF NOT EXISTS idx_pag_data_area ON financas.pag_pagamentos_area(pag_data, pag_are_id);

-- Trigger
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_pagamentos_area()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pag_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pag_updated ON financas.pag_pagamentos_area;
CREATE TRIGGER trg_pag_updated
  BEFORE UPDATE ON financas.pag_pagamentos_area
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_pagamentos_area();

-- RLS
ALTER TABLE financas.pag_pagamentos_area ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_seus_pagamentos_area"
  ON financas.pag_pagamentos_area FOR SELECT
  TO anon, authenticated
  USING (pag_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_pagamentos_area"
  ON financas.pag_pagamentos_area FOR INSERT
  TO anon, authenticated
  WITH CHECK (pag_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_seus_pagamentos_area"
  ON financas.pag_pagamentos_area FOR UPDATE
  TO anon, authenticated
  USING (pag_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (pag_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_seus_pagamentos_area"
  ON financas.pag_pagamentos_area FOR DELETE
  TO anon, authenticated
  USING (pag_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- TABELA: rec_receitas (Receitas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.rec_receitas (
  rec_id bigserial PRIMARY KEY,
  rec_ctr_id bigint NOT NULL REFERENCES financas.ctr_contas_receita(ctr_id) ON DELETE RESTRICT,
  rec_data date NOT NULL DEFAULT CURRENT_DATE,
  rec_valor numeric(15,2) NOT NULL,
  rec_descricao text,
  rec_observacao text,
  rec_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  rec_criado_em timestamptz DEFAULT now(),
  rec_atualizado_em timestamptz DEFAULT now(),

  -- Constraint para garantir valores positivos
  CONSTRAINT chk_rec_valor CHECK (rec_valor >= 0)
);

-- Comentários
COMMENT ON TABLE financas.rec_receitas IS 'Receitas por conta de receita';
COMMENT ON COLUMN financas.rec_receitas.rec_id IS 'ID único da receita';
COMMENT ON COLUMN financas.rec_receitas.rec_ctr_id IS 'Conta de receita relacionada';
COMMENT ON COLUMN financas.rec_receitas.rec_data IS 'Data da receita';
COMMENT ON COLUMN financas.rec_receitas.rec_valor IS 'Valor da receita (sempre positivo)';
COMMENT ON COLUMN financas.rec_receitas.rec_descricao IS 'Descrição da receita';
COMMENT ON COLUMN financas.rec_receitas.rec_observacao IS 'Observações adicionais';
COMMENT ON COLUMN financas.rec_receitas.rec_usr_id IS 'Usuário que registrou a receita';

-- Índices
CREATE INDEX IF NOT EXISTS idx_rec_ctr_id ON financas.rec_receitas(rec_ctr_id);
CREATE INDEX IF NOT EXISTS idx_rec_data ON financas.rec_receitas(rec_data DESC);
CREATE INDEX IF NOT EXISTS idx_rec_usr_id ON financas.rec_receitas(rec_usr_id);
CREATE INDEX IF NOT EXISTS idx_rec_data_conta ON financas.rec_receitas(rec_data, rec_ctr_id);

-- Trigger
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_receitas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.rec_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rec_updated ON financas.rec_receitas;
CREATE TRIGGER trg_rec_updated
  BEFORE UPDATE ON financas.rec_receitas
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_receitas();

-- RLS
ALTER TABLE financas.rec_receitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_suas_receitas"
  ON financas.rec_receitas FOR SELECT
  TO anon, authenticated
  USING (rec_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_receitas"
  ON financas.rec_receitas FOR INSERT
  TO anon, authenticated
  WITH CHECK (rec_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_suas_receitas"
  ON financas.rec_receitas FOR UPDATE
  TO anon, authenticated
  USING (rec_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (rec_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_suas_receitas"
  ON financas.rec_receitas FOR DELETE
  TO anon, authenticated
  USING (rec_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- TABELA: pbk_pagamentos_banco (Pagamentos por Banco)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.pbk_pagamentos_banco (
  pbk_id bigserial PRIMARY KEY,
  pbk_ban_id bigint NOT NULL REFERENCES financas.ban_bancos(ban_id) ON DELETE RESTRICT,
  pbk_data date NOT NULL DEFAULT CURRENT_DATE,
  pbk_valor numeric(15,2) NOT NULL,
  pbk_descricao text,
  pbk_observacao text,
  pbk_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  pbk_criado_em timestamptz DEFAULT now(),
  pbk_atualizado_em timestamptz DEFAULT now(),

  -- Constraint para garantir valores positivos
  CONSTRAINT chk_pbk_valor CHECK (pbk_valor >= 0)
);

-- Comentários
COMMENT ON TABLE financas.pbk_pagamentos_banco IS 'Pagamentos (débitos) por banco';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_id IS 'ID único do pagamento';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_ban_id IS 'Banco relacionado';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_data IS 'Data do pagamento';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_valor IS 'Valor do pagamento (sempre positivo)';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_descricao IS 'Descrição do pagamento';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_observacao IS 'Observações adicionais';
COMMENT ON COLUMN financas.pbk_pagamentos_banco.pbk_usr_id IS 'Usuário que registrou o pagamento';

-- Índices
CREATE INDEX IF NOT EXISTS idx_pbk_ban_id ON financas.pbk_pagamentos_banco(pbk_ban_id);
CREATE INDEX IF NOT EXISTS idx_pbk_data ON financas.pbk_pagamentos_banco(pbk_data DESC);
CREATE INDEX IF NOT EXISTS idx_pbk_usr_id ON financas.pbk_pagamentos_banco(pbk_usr_id);
CREATE INDEX IF NOT EXISTS idx_pbk_data_banco ON financas.pbk_pagamentos_banco(pbk_data, pbk_ban_id);

-- Trigger
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_pagamentos_banco()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pbk_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pbk_updated ON financas.pbk_pagamentos_banco;
CREATE TRIGGER trg_pbk_updated
  BEFORE UPDATE ON financas.pbk_pagamentos_banco
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_pagamentos_banco();

-- RLS
ALTER TABLE financas.pbk_pagamentos_banco ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_seus_pagamentos_banco"
  ON financas.pbk_pagamentos_banco FOR SELECT
  TO anon, authenticated
  USING (pbk_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_pagamentos_banco"
  ON financas.pbk_pagamentos_banco FOR INSERT
  TO anon, authenticated
  WITH CHECK (pbk_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_seus_pagamentos_banco"
  ON financas.pbk_pagamentos_banco FOR UPDATE
  TO anon, authenticated
  USING (pbk_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (pbk_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_seus_pagamentos_banco"
  ON financas.pbk_pagamentos_banco FOR DELETE
  TO anon, authenticated
  USING (pbk_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- TABELA: sdb_saldo_banco (Saldo por Banco)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.sdb_saldo_banco (
  sdb_id bigserial PRIMARY KEY,
  sdb_ban_id bigint NOT NULL REFERENCES financas.ban_bancos(ban_id) ON DELETE RESTRICT,
  sdb_data date NOT NULL DEFAULT CURRENT_DATE,
  sdb_saldo numeric(15,2) NOT NULL,
  sdb_descricao text,
  sdb_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  sdb_criado_em timestamptz DEFAULT now(),
  sdb_atualizado_em timestamptz DEFAULT now(),

  -- Constraint para garantir um único saldo por banco por dia
  CONSTRAINT uq_sdb_banco_data UNIQUE(sdb_ban_id, sdb_data)
);

-- Comentários
COMMENT ON TABLE financas.sdb_saldo_banco IS 'Saldo diário por banco';
COMMENT ON COLUMN financas.sdb_saldo_banco.sdb_id IS 'ID único do registro de saldo';
COMMENT ON COLUMN financas.sdb_saldo_banco.sdb_ban_id IS 'Banco relacionado';
COMMENT ON COLUMN financas.sdb_saldo_banco.sdb_data IS 'Data do saldo';
COMMENT ON COLUMN financas.sdb_saldo_banco.sdb_saldo IS 'Valor do saldo (pode ser negativo)';
COMMENT ON COLUMN financas.sdb_saldo_banco.sdb_descricao IS 'Descrição ou observação do saldo';
COMMENT ON COLUMN financas.sdb_saldo_banco.sdb_usr_id IS 'Usuário que registrou o saldo';

-- Índices
CREATE INDEX IF NOT EXISTS idx_sdb_ban_id ON financas.sdb_saldo_banco(sdb_ban_id);
CREATE INDEX IF NOT EXISTS idx_sdb_data ON financas.sdb_saldo_banco(sdb_data DESC);
CREATE INDEX IF NOT EXISTS idx_sdb_usr_id ON financas.sdb_saldo_banco(sdb_usr_id);

-- Trigger
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_saldo_banco()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sdb_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sdb_updated ON financas.sdb_saldo_banco;
CREATE TRIGGER trg_sdb_updated
  BEFORE UPDATE ON financas.sdb_saldo_banco
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_saldo_banco();

-- RLS
ALTER TABLE financas.sdb_saldo_banco ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_seus_saldos"
  ON financas.sdb_saldo_banco FOR SELECT
  TO anon, authenticated
  USING (sdb_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_saldos"
  ON financas.sdb_saldo_banco FOR INSERT
  TO anon, authenticated
  WITH CHECK (sdb_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_seus_saldos"
  ON financas.sdb_saldo_banco FOR UPDATE
  TO anon, authenticated
  USING (sdb_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (sdb_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_seus_saldos"
  ON financas.sdb_saldo_banco FOR DELETE
  TO anon, authenticated
  USING (sdb_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- VIEWS E FUNÇÕES AUXILIARES
-- ============================================================================

-- View: Resumo do Dashboard
CREATE OR REPLACE VIEW financas.v_dashboard_resumo AS
SELECT
  CURRENT_DATE as data,

  -- Total de pagamentos por área (hoje)
  (SELECT COALESCE(SUM(pag_valor), 0)
   FROM financas.pag_pagamentos_area
   WHERE pag_data = CURRENT_DATE) as total_pagamentos_area,

  -- Total de receitas (hoje)
  (SELECT COALESCE(SUM(rec_valor), 0)
   FROM financas.rec_receitas
   WHERE rec_data = CURRENT_DATE) as total_receitas,

  -- Total de pagamentos por banco (hoje)
  (SELECT COALESCE(SUM(pbk_valor), 0)
   FROM financas.pbk_pagamentos_banco
   WHERE pbk_data = CURRENT_DATE) as total_pagamentos_banco,

  -- Saldo total em todos os bancos (último registro de cada banco)
  (SELECT COALESCE(SUM(sdb_saldo), 0)
   FROM financas.sdb_saldo_banco sdb
   WHERE sdb_data = (
     SELECT MAX(sdb2.sdb_data)
     FROM financas.sdb_saldo_banco sdb2
     WHERE sdb2.sdb_ban_id = sdb.sdb_ban_id
   )) as saldo_total_bancos;

COMMENT ON VIEW financas.v_dashboard_resumo IS 'Resumo agregado para dashboard principal';

-- Function: Calcular saldo de um banco em uma data específica
CREATE OR REPLACE FUNCTION financas.calcular_saldo_banco(
  p_ban_id bigint,
  p_data date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_saldo_inicial numeric;
  v_total_receitas numeric;
  v_total_pagamentos numeric;
BEGIN
  -- Busca saldo inicial do banco
  SELECT COALESCE(ban_saldo_inicial, 0) INTO v_saldo_inicial
  FROM financas.ban_bancos
  WHERE ban_id = p_ban_id;

  -- Calcula receitas até a data (todas as receitas do usuário)
  SELECT COALESCE(SUM(rec_valor), 0) INTO v_total_receitas
  FROM financas.rec_receitas
  WHERE rec_data <= p_data;

  -- Calcula pagamentos do banco até a data
  SELECT COALESCE(SUM(pbk_valor), 0) INTO v_total_pagamentos
  FROM financas.pbk_pagamentos_banco
  WHERE pbk_ban_id = p_ban_id AND pbk_data <= p_data;

  -- Retorna saldo calculado
  RETURN v_saldo_inicial + v_total_receitas - v_total_pagamentos;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION financas.calcular_saldo_banco IS 'Calcula o saldo de um banco em uma data específica';
