-- Garante armazenamento do banco e do tipo de conta em lançamentos de cobrança
ALTER TABLE IF EXISTS financas.cob_cobrancas
  ADD COLUMN IF NOT EXISTS cob_ban_tipo_conta varchar(50);

COMMENT ON COLUMN financas.cob_cobrancas.cob_ban_tipo_conta IS 'Tipo da conta bancária no momento do lançamento de cobrança.';

-- Preenche o tipo de conta com base no cadastro de bancos
UPDATE financas.cob_cobrancas cc
SET cob_ban_tipo_conta = ban.ban_tipo_conta
FROM financas.ban_bancos ban
WHERE cc.cob_ban_id = ban.ban_id
  AND (cc.cob_ban_tipo_conta IS NULL OR cc.cob_ban_tipo_conta = '');

-- Tenta aproveitar o vínculo antigo entre conta de receita e banco para registros legados
UPDATE financas.cob_cobrancas cc
SET cob_ban_id = ctr.ctr_ban_id
FROM financas.ctr_contas_receita ctr
WHERE cc.cob_ctr_id = ctr.ctr_id
  AND cc.cob_ban_id IS NULL
  AND ctr.ctr_ban_id IS NOT NULL;

-- Exige identificação de banco nos lançamentos
ALTER TABLE IF EXISTS financas.cob_cobrancas
  ALTER COLUMN cob_ban_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';
