-- ============================================================================
-- MIGRATION: Corrigir políticas RLS para sistema sem login
-- Data: 2025-11-06
-- Descrição: Simplifica as políticas RLS para funcionar com usuário sem login
--            O filtro por usuário será feito no nível da aplicação
-- ============================================================================

-- ============================================================================
-- REMOVER POLÍTICAS ANTIGAS (que não funcionam sem auth)
-- ============================================================================

-- usr_usuarios
DROP POLICY IF EXISTS "usuarios_publicos" ON financas.usr_usuarios;
DROP POLICY IF EXISTS "usuarios_podem_se_registrar" ON financas.usr_usuarios;
DROP POLICY IF EXISTS "usuarios_atualizam_apenas_seus" ON financas.usr_usuarios;

-- are_areas
DROP POLICY IF EXISTS "usuarios_veem_suas_areas" ON financas.are_areas;
DROP POLICY IF EXISTS "usuarios_criam_areas" ON financas.are_areas;
DROP POLICY IF EXISTS "usuarios_atualizam_suas_areas" ON financas.are_areas;
DROP POLICY IF EXISTS "usuarios_deletam_suas_areas" ON financas.are_areas;

-- ctr_contas_receita
DROP POLICY IF EXISTS "usuarios_veem_suas_contas" ON financas.ctr_contas_receita;
DROP POLICY IF EXISTS "usuarios_criam_contas" ON financas.ctr_contas_receita;
DROP POLICY IF EXISTS "usuarios_atualizam_suas_contas" ON financas.ctr_contas_receita;
DROP POLICY IF EXISTS "usuarios_deletam_suas_contas" ON financas.ctr_contas_receita;

-- ban_bancos
DROP POLICY IF EXISTS "usuarios_veem_seus_bancos" ON financas.ban_bancos;
DROP POLICY IF EXISTS "usuarios_criam_bancos" ON financas.ban_bancos;
DROP POLICY IF EXISTS "usuarios_atualizam_seus_bancos" ON financas.ban_bancos;
DROP POLICY IF EXISTS "usuarios_deletam_seus_bancos" ON financas.ban_bancos;

-- pag_pagamentos_area
DROP POLICY IF EXISTS "usuarios_veem_seus_pagamentos_area" ON financas.pag_pagamentos_area;
DROP POLICY IF EXISTS "usuarios_criam_pagamentos_area" ON financas.pag_pagamentos_area;
DROP POLICY IF EXISTS "usuarios_atualizam_seus_pagamentos_area" ON financas.pag_pagamentos_area;
DROP POLICY IF EXISTS "usuarios_deletam_seus_pagamentos_area" ON financas.pag_pagamentos_area;

-- rec_receitas
DROP POLICY IF EXISTS "usuarios_veem_suas_receitas" ON financas.rec_receitas;
DROP POLICY IF EXISTS "usuarios_criam_receitas" ON financas.rec_receitas;
DROP POLICY IF EXISTS "usuarios_atualizam_suas_receitas" ON financas.rec_receitas;
DROP POLICY IF EXISTS "usuarios_deletam_suas_receitas" ON financas.rec_receitas;

-- pbk_pagamentos_banco
DROP POLICY IF EXISTS "usuarios_veem_seus_pagamentos_banco" ON financas.pbk_pagamentos_banco;
DROP POLICY IF EXISTS "usuarios_criam_pagamentos_banco" ON financas.pbk_pagamentos_banco;
DROP POLICY IF EXISTS "usuarios_atualizam_seus_pagamentos_banco" ON financas.pbk_pagamentos_banco;
DROP POLICY IF EXISTS "usuarios_deletam_seus_pagamentos_banco" ON financas.pbk_pagamentos_banco;

-- sdb_saldo_banco
DROP POLICY IF EXISTS "usuarios_veem_seus_saldos" ON financas.sdb_saldo_banco;
DROP POLICY IF EXISTS "usuarios_criam_saldos" ON financas.sdb_saldo_banco;
DROP POLICY IF EXISTS "usuarios_atualizam_seus_saldos" ON financas.sdb_saldo_banco;
DROP POLICY IF EXISTS "usuarios_deletam_seus_saldos" ON financas.sdb_saldo_banco;

-- ============================================================================
-- CRIAR POLÍTICAS SIMPLES (permissivas para anon role)
-- ============================================================================
-- IMPORTANTE: O filtro por usuário será feito no nível da aplicação
-- A segurança está em SEMPRE incluir WHERE usr_id = ? nas queries
-- ============================================================================

-- usr_usuarios
CREATE POLICY "anon_full_access_usuarios"
  ON financas.usr_usuarios
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- are_areas
CREATE POLICY "anon_full_access_areas"
  ON financas.are_areas
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ctr_contas_receita
CREATE POLICY "anon_full_access_contas"
  ON financas.ctr_contas_receita
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ban_bancos
CREATE POLICY "anon_full_access_bancos"
  ON financas.ban_bancos
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- pag_pagamentos_area
CREATE POLICY "anon_full_access_pagamentos_area"
  ON financas.pag_pagamentos_area
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- rec_receitas
CREATE POLICY "anon_full_access_receitas"
  ON financas.rec_receitas
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- pbk_pagamentos_banco
CREATE POLICY "anon_full_access_pagamentos_banco"
  ON financas.pbk_pagamentos_banco
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- sdb_saldo_banco
CREATE POLICY "anon_full_access_saldo_banco"
  ON financas.sdb_saldo_banco
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- NOTA IMPORTANTE
-- ============================================================================
-- Com estas políticas permissivas, a segurança depende de:
-- 1. SEMPRE filtrar por usr_id nas queries da aplicação
-- 2. Validar o usr_id antes de inserir/atualizar/deletar
-- 3. Não expor endpoints que permitam acesso sem filtro
--
-- Exemplo de query segura:
-- SELECT * FROM financas.are_areas WHERE are_usr_id = $1
--
-- Futuramente, quando implementar autenticação real, as políticas
-- podem ser restringidas usando auth.uid()
-- ============================================================================
