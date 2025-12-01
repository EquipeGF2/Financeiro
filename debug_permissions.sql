-- ============================================================================
-- SCRIPT DE DEBUG: Identificar problema de permissão
-- ============================================================================

-- 1. Verificar se a tabela existe
SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'financas'
  AND table_name = 'per_periodos_liberados';

-- 2. Verificar permissões da tabela
SELECT
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'financas'
  AND table_name = 'per_periodos_liberados'
ORDER BY grantee, privilege_type;

-- 3. Verificar permissões da sequência
SELECT
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.usage_privileges
WHERE object_schema = 'financas'
  AND object_name = 'per_periodos_liberados_per_id_seq'
ORDER BY grantee, privilege_type;

-- 4. Verificar se RLS está ativo
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'financas'
  AND tablename = 'per_periodos_liberados';

-- 5. Listar todas as policies ativas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'financas'
  AND tablename = 'per_periodos_liberados';

-- 6. Verificar role atual
SELECT current_user, current_role, session_user;

-- 7. Verificar se há usuários na tabela usr_usuarios
SELECT
  COUNT(*) as total_usuarios,
  COUNT(DISTINCT usr_identificador) as identificadores_unicos
FROM financas.usr_usuarios;

-- ============================================================================
-- SOLUÇÃO TEMPORÁRIA: Desabilitar RLS completamente para teste
-- ============================================================================
-- Execute apenas se quiser testar sem RLS

-- ALTER TABLE financas.per_periodos_liberados DISABLE ROW LEVEL SECURITY;

-- Depois de testar, reabilite:
-- ALTER TABLE financas.per_periodos_liberados ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SOLUÇÃO ALTERNATIVA: Políticas permissivas para ambiente de desenvolvimento
-- ============================================================================

-- Dropar todas as policies
DROP POLICY IF EXISTS "per_usuarios_veem_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_inserem_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_atualizam_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_excluem_seus_dados" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_select_policy" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_insert_policy" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_update_policy" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_delete_policy" ON financas.per_periodos_liberados;
DROP POLICY IF EXISTS "per_usuarios_podem_tudo" ON financas.per_periodos_liberados;

-- Criar policy permissiva (TEMPORÁRIA para desenvolvimento)
CREATE POLICY "per_allow_all_dev"
  ON financas.per_periodos_liberados
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Garantir todas as permissões novamente
GRANT ALL ON financas.per_periodos_liberados TO authenticated;
GRANT ALL ON financas.per_periodos_liberados TO anon;
GRANT ALL ON financas.per_periodos_liberados TO public;

GRANT USAGE, SELECT ON SEQUENCE financas.per_periodos_liberados_per_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.per_periodos_liberados_per_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE financas.per_periodos_liberados_per_id_seq TO public;

-- Verificar se funcionou
SELECT
  'Policies criadas com sucesso' as status,
  COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'financas'
  AND tablename = 'per_periodos_liberados';
