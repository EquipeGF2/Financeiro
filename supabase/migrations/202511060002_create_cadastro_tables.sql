-- ============================================================================
-- MIGRATION: Criar tabelas de cadastro (mestres)
-- Data: 2025-11-06
-- Descrição: Tabelas are_areas, ctr_contas_receita, ban_bancos
-- ============================================================================

-- ============================================================================
-- TABELA: are_areas (Áreas de Negócio)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.are_areas (
  are_id bigserial PRIMARY KEY,
  are_codigo varchar(20) NOT NULL UNIQUE,
  are_nome varchar(100) NOT NULL,
  are_descricao text,
  are_ativo boolean DEFAULT true,
  are_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  are_criado_em timestamptz DEFAULT now(),
  are_atualizado_em timestamptz DEFAULT now()
);

-- Comentários
COMMENT ON TABLE financas.are_areas IS 'Áreas de negócio / departamentos';
COMMENT ON COLUMN financas.are_areas.are_id IS 'ID único da área';
COMMENT ON COLUMN financas.are_areas.are_codigo IS 'Código único de identificação';
COMMENT ON COLUMN financas.are_areas.are_nome IS 'Nome da área';
COMMENT ON COLUMN financas.are_areas.are_descricao IS 'Descrição detalhada da área';
COMMENT ON COLUMN financas.are_areas.are_ativo IS 'Indica se a área está ativa';
COMMENT ON COLUMN financas.are_areas.are_usr_id IS 'Usuário que criou o registro';

-- Índices
CREATE INDEX IF NOT EXISTS idx_are_codigo ON financas.are_areas(are_codigo);
CREATE INDEX IF NOT EXISTS idx_are_ativo ON financas.are_areas(are_ativo) WHERE are_ativo = true;
CREATE INDEX IF NOT EXISTS idx_are_usr_id ON financas.are_areas(are_usr_id);
CREATE INDEX IF NOT EXISTS idx_are_nome ON financas.are_areas(are_nome);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_areas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.are_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_are_areas_updated ON financas.are_areas;
CREATE TRIGGER trg_are_areas_updated
  BEFORE UPDATE ON financas.are_areas
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_areas();

-- RLS
ALTER TABLE financas.are_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_suas_areas"
  ON financas.are_areas FOR SELECT
  TO anon, authenticated
  USING (are_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_areas"
  ON financas.are_areas FOR INSERT
  TO anon, authenticated
  WITH CHECK (are_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_suas_areas"
  ON financas.are_areas FOR UPDATE
  TO anon, authenticated
  USING (are_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (are_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_suas_areas"
  ON financas.are_areas FOR DELETE
  TO anon, authenticated
  USING (are_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- TABELA: ctr_contas_receita (Contas de Receita)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.ctr_contas_receita (
  ctr_id bigserial PRIMARY KEY,
  ctr_codigo varchar(20) NOT NULL UNIQUE,
  ctr_nome varchar(100) NOT NULL,
  ctr_descricao text,
  ctr_ativo boolean DEFAULT true,
  ctr_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  ctr_criado_em timestamptz DEFAULT now(),
  ctr_atualizado_em timestamptz DEFAULT now()
);

-- Comentários
COMMENT ON TABLE financas.ctr_contas_receita IS 'Contas para classificação de receitas';
COMMENT ON COLUMN financas.ctr_contas_receita.ctr_id IS 'ID único da conta';
COMMENT ON COLUMN financas.ctr_contas_receita.ctr_codigo IS 'Código único de identificação';
COMMENT ON COLUMN financas.ctr_contas_receita.ctr_nome IS 'Nome da conta de receita';
COMMENT ON COLUMN financas.ctr_contas_receita.ctr_descricao IS 'Descrição da conta';
COMMENT ON COLUMN financas.ctr_contas_receita.ctr_ativo IS 'Indica se a conta está ativa';
COMMENT ON COLUMN financas.ctr_contas_receita.ctr_usr_id IS 'Usuário que criou o registro';

-- Índices
CREATE INDEX IF NOT EXISTS idx_ctr_codigo ON financas.ctr_contas_receita(ctr_codigo);
CREATE INDEX IF NOT EXISTS idx_ctr_ativo ON financas.ctr_contas_receita(ctr_ativo) WHERE ctr_ativo = true;
CREATE INDEX IF NOT EXISTS idx_ctr_usr_id ON financas.ctr_contas_receita(ctr_usr_id);
CREATE INDEX IF NOT EXISTS idx_ctr_nome ON financas.ctr_contas_receita(ctr_nome);

-- Trigger
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_contas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ctr_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ctr_contas_updated ON financas.ctr_contas_receita;
CREATE TRIGGER trg_ctr_contas_updated
  BEFORE UPDATE ON financas.ctr_contas_receita
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_contas();

-- RLS
ALTER TABLE financas.ctr_contas_receita ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_suas_contas"
  ON financas.ctr_contas_receita FOR SELECT
  TO anon, authenticated
  USING (ctr_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_contas"
  ON financas.ctr_contas_receita FOR INSERT
  TO anon, authenticated
  WITH CHECK (ctr_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_suas_contas"
  ON financas.ctr_contas_receita FOR UPDATE
  TO anon, authenticated
  USING (ctr_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (ctr_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_suas_contas"
  ON financas.ctr_contas_receita FOR DELETE
  TO anon, authenticated
  USING (ctr_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- TABELA: ban_bancos (Bancos e Contas Bancárias)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.ban_bancos (
  ban_id bigserial PRIMARY KEY,
  ban_codigo varchar(20) NOT NULL UNIQUE,
  ban_nome varchar(100) NOT NULL,
  ban_numero_conta varchar(50) NOT NULL,
  ban_agencia varchar(20),
  ban_tipo_conta varchar(20),
  ban_saldo_inicial numeric(15,2) DEFAULT 0,
  ban_ativo boolean DEFAULT true,
  ban_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  ban_criado_em timestamptz DEFAULT now(),
  ban_atualizado_em timestamptz DEFAULT now(),

  -- Constraint para garantir valores positivos ou zero
  CONSTRAINT chk_ban_saldo_inicial CHECK (ban_saldo_inicial >= 0)
);

-- Comentários
COMMENT ON TABLE financas.ban_bancos IS 'Bancos e contas bancárias';
COMMENT ON COLUMN financas.ban_bancos.ban_id IS 'ID único do banco';
COMMENT ON COLUMN financas.ban_bancos.ban_codigo IS 'Código único de identificação';
COMMENT ON COLUMN financas.ban_bancos.ban_nome IS 'Nome do banco';
COMMENT ON COLUMN financas.ban_bancos.ban_numero_conta IS 'Número da conta bancária';
COMMENT ON COLUMN financas.ban_bancos.ban_agencia IS 'Número da agência';
COMMENT ON COLUMN financas.ban_bancos.ban_tipo_conta IS 'Tipo de conta (Corrente, Poupança, etc)';
COMMENT ON COLUMN financas.ban_bancos.ban_saldo_inicial IS 'Saldo inicial da conta';
COMMENT ON COLUMN financas.ban_bancos.ban_ativo IS 'Indica se o banco está ativo';
COMMENT ON COLUMN financas.ban_bancos.ban_usr_id IS 'Usuário que criou o registro';

-- Índices
CREATE INDEX IF NOT EXISTS idx_ban_codigo ON financas.ban_bancos(ban_codigo);
CREATE INDEX IF NOT EXISTS idx_ban_ativo ON financas.ban_bancos(ban_ativo) WHERE ban_ativo = true;
CREATE INDEX IF NOT EXISTS idx_ban_usr_id ON financas.ban_bancos(ban_usr_id);
CREATE INDEX IF NOT EXISTS idx_ban_nome ON financas.ban_bancos(ban_nome);

-- Trigger
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_bancos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ban_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ban_bancos_updated ON financas.ban_bancos;
CREATE TRIGGER trg_ban_bancos_updated
  BEFORE UPDATE ON financas.ban_bancos
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_bancos();

-- RLS
ALTER TABLE financas.ban_bancos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_seus_bancos"
  ON financas.ban_bancos FOR SELECT
  TO anon, authenticated
  USING (ban_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_bancos"
  ON financas.ban_bancos FOR INSERT
  TO anon, authenticated
  WITH CHECK (ban_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_seus_bancos"
  ON financas.ban_bancos FOR UPDATE
  TO anon, authenticated
  USING (ban_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (ban_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_seus_bancos"
  ON financas.ban_bancos FOR DELETE
  TO anon, authenticated
  USING (ban_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));
