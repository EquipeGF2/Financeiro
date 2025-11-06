-- ============================================================================
-- MIGRATION: Adicionar coluna de e-mail aos usuários
-- Data: 2025-11-07
-- Descrição: inclui coluna opcional usr_email e garante comentários/índices
-- ============================================================================

ALTER TABLE financas.usr_usuarios
  ADD COLUMN IF NOT EXISTS usr_email varchar(150);

COMMENT ON COLUMN financas.usr_usuarios.usr_email IS 'E-mail utilizado para notificações e relatórios';

-- Índice auxiliar para buscas por e-mail (evita duplicidade de nomes)
CREATE INDEX IF NOT EXISTS idx_usr_email
  ON financas.usr_usuarios(usr_email)
  WHERE usr_email IS NOT NULL;
