-- ============================================================================
-- MIGRATION: Criar Tabela de Períodos Liberados
-- Data: 2025-12-01
-- Descrição: Cria tabela para controle de períodos liberados para digitação
--           no saldo diário, permitindo edição de datas fechadas
-- ============================================================================

-- Create table
CREATE TABLE IF NOT EXISTS financas.per_periodos_liberados (
  per_id serial PRIMARY KEY,
  per_data_inicio date NOT NULL,
  per_data_fim date NOT NULL,
  per_motivo text,
  per_ativo boolean DEFAULT true,
  per_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  per_criado_em timestamptz DEFAULT now(),
  per_atualizado_em timestamptz DEFAULT now(),

  CONSTRAINT ck_per_data_valida CHECK (per_data_fim >= per_data_inicio)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_per_usr_id
  ON financas.per_periodos_liberados(per_usr_id);

CREATE INDEX IF NOT EXISTS idx_per_datas
  ON financas.per_periodos_liberados(per_data_inicio, per_data_fim);

-- Create trigger for auto-update timestamp
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_periodos_liberados()
RETURNS TRIGGER AS $$
BEGIN
  NEW.per_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_timestamp_periodos_liberados
  BEFORE UPDATE ON financas.per_periodos_liberados
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_periodos_liberados();

-- Enable RLS
ALTER TABLE financas.per_periodos_liberados ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "per_usuarios_veem_seus_dados"
  ON financas.per_periodos_liberados FOR SELECT
  USING (per_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "per_usuarios_inserem_seus_dados"
  ON financas.per_periodos_liberados FOR INSERT
  WITH CHECK (per_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "per_usuarios_atualizam_seus_dados"
  ON financas.per_periodos_liberados FOR UPDATE
  USING (per_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "per_usuarios_excluem_seus_dados"
  ON financas.per_periodos_liberados FOR DELETE
  USING (per_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- Grant permissions
GRANT ALL ON financas.per_periodos_liberados TO authenticated;
GRANT ALL ON financas.per_periodos_liberados TO anon;

-- Comment
COMMENT ON TABLE financas.per_periodos_liberados IS 'Controla períodos liberados para digitação no saldo diário, permitindo edição de datas fechadas';
COMMENT ON COLUMN financas.per_periodos_liberados.per_data_inicio IS 'Data inicial do período liberado';
COMMENT ON COLUMN financas.per_periodos_liberados.per_data_fim IS 'Data final do período liberado';
COMMENT ON COLUMN financas.per_periodos_liberados.per_motivo IS 'Motivo da liberação do período';
COMMENT ON COLUMN financas.per_periodos_liberados.per_ativo IS 'Indica se o período está ativo/liberado';
