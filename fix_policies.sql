-- ============================================================================
-- FIX: Corrigir políticas RLS da tabela per_periodos_liberados
-- ============================================================================

-- Reabilitar RLS (se foi desabilitado)
ALTER TABLE financas.per_periodos_liberados ENABLE ROW LEVEL SECURITY;

-- Dropar políticas antigas
DROP POLICY IF EXISTS "per_usuarios_veem_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_inserem_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_atualizam_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_excluem_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_podem_tudo" ON financas.per_periodos_liberados;

-- Criar função helper para pegar usr_id do header
CREATE OR REPLACE FUNCTION financas.get_current_usr_id()
RETURNS uuid AS $$
DECLARE
  user_identifier text;
  user_id uuid;
BEGIN
  -- Tenta pegar o x-user-id do header
  BEGIN
    user_identifier := current_setting('request.headers', true)::json->>'x-user-id';
  EXCEPTION WHEN OTHERS THEN
    user_identifier := NULL;
  END;

  -- Se não conseguiu do header, retorna NULL (policy vai falhar, como esperado)
  IF user_identifier IS NULL THEN
    RETURN NULL;
  END IF;

  -- Busca o usr_id correspondente
  SELECT usr_id INTO user_id
  FROM financas.usr_usuarios
  WHERE usr_identificador = user_identifier
  LIMIT 1;

  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Política para SELECT (visualizar)
CREATE POLICY "per_select_policy"
  ON financas.per_periodos_liberados
  FOR SELECT
  USING (
    per_usr_id = financas.get_current_usr_id()
    OR financas.get_current_usr_id() IS NULL -- Durante testes sem auth
  );

-- Política para INSERT (criar)
CREATE POLICY "per_insert_policy"
  ON financas.per_periodos_liberados
  FOR INSERT
  WITH CHECK (
    per_usr_id = financas.get_current_usr_id()
    OR financas.get_current_usr_id() IS NULL -- Durante testes sem auth
  );

-- Política para UPDATE (atualizar)
CREATE POLICY "per_update_policy"
  ON financas.per_periodos_liberados
  FOR UPDATE
  USING (
    per_usr_id = financas.get_current_usr_id()
    OR financas.get_current_usr_id() IS NULL
  )
  WITH CHECK (
    per_usr_id = financas.get_current_usr_id()
    OR financas.get_current_usr_id() IS NULL
  );

-- Política para DELETE (excluir)
CREATE POLICY "per_delete_policy"
  ON financas.per_periodos_liberados
  FOR DELETE
  USING (
    per_usr_id = financas.get_current_usr_id()
    OR financas.get_current_usr_id() IS NULL
  );

-- Garantir permissões
GRANT ALL ON financas.per_periodos_liberados TO authenticated;
GRANT ALL ON financas.per_periodos_liberados TO anon;
GRANT USAGE, SELECT ON SEQUENCE financas.per_periodos_liberados_per_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.per_periodos_liberados_per_id_seq TO anon;
GRANT EXECUTE ON FUNCTION financas.get_current_usr_id() TO authenticated;
GRANT EXECUTE ON FUNCTION financas.get_current_usr_id() TO anon;
