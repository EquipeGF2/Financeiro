-- Garante que todos os usuários possam ler sdd_saldo_diario
-- Corrige divergências na tela Auditoria > Saldos Diários entre usuários diferentes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'financas'
      AND table_name = 'sdd_saldo_diario'
  ) THEN
    -- Relaxa a política antiga para permitir leitura compartilhada
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'financas'
        AND tablename = 'sdd_saldo_diario'
        AND policyname = 'usuarios_veem_seus_saldos_diarios'
    ) THEN
      EXECUTE 'alter policy usuarios_veem_seus_saldos_diarios on financas.sdd_saldo_diario using (true);';
    END IF;

    -- Garante política explícita de leitura compartilhada
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'financas'
        AND tablename = 'sdd_saldo_diario'
        AND policyname = 'usuarios_leem_saldos_diarios_compartilhados'
    ) THEN
      EXECUTE 'create policy usuarios_leem_saldos_diarios_compartilhados on financas.sdd_saldo_diario for select to anon, authenticated using (true);';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
