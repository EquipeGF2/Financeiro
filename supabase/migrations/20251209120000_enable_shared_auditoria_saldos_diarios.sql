-- Habilita leitura compartilhada dos saldos diários para todos os usuários
-- Isso garante que o relatório de Auditoria > Saldos Diários exiba os mesmos
-- valores independentemente do usuário logado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'financas'
      AND table_name = 'sdd_saldo_diario'
  ) THEN
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
