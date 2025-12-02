-- Inserção do saldo inicial da aplicação em 20/03/2025
-- Valor: 4.777.842,88
-- Garante a criação da semana correspondente e utiliza o usuário padrão quando disponível.

DO $$
DECLARE
  v_usr_id uuid;
  v_semana_id bigint;
BEGIN
  -- Seleciona o usuário padrão utilizado em seeds ou, caso não exista, o primeiro usuário cadastrado
  SELECT usr_id
    INTO v_usr_id
    FROM financas.usr_usuarios
   WHERE usr_identificador = '00000000-0000-0000-0000-000000000000'
   LIMIT 1;

  IF v_usr_id IS NULL THEN
    SELECT usr_id
      INTO v_usr_id
      FROM financas.usr_usuarios
     ORDER BY usr_criado_em NULLS FIRST
     LIMIT 1;
  END IF;

  -- Se não houver usuário, registra aviso e encerra sem erro
  IF v_usr_id IS NULL THEN
    RAISE NOTICE 'Saldo inicial de aplicação não inserido: tabela financas.usr_usuarios está vazia.';
    RETURN;
  END IF;

  -- Garante a existência da semana que contém 20/03/2025 (segunda a sexta)
  SELECT pvs_id
    INTO v_semana_id
    FROM financas.pvs_semanas
   WHERE pvs_usr_id = v_usr_id
     AND pvs_semana_inicio = DATE '2025-03-17'
     AND pvs_semana_fim = DATE '2025-03-21'
   LIMIT 1;

  IF v_semana_id IS NULL THEN
    INSERT INTO financas.pvs_semanas (
      pvs_usr_id,
      pvs_semana_inicio,
      pvs_semana_fim,
      pvs_status,
      pvs_observacao
    ) VALUES (
      v_usr_id,
      DATE '2025-03-17',
      DATE '2025-03-21',
      'importado',
      'Criado automaticamente para registrar o saldo inicial da aplicação em 20/03/2025'
    )
    RETURNING pvs_id INTO v_semana_id;
  END IF;

  -- Insere o saldo inicial da aplicação somente se ainda não existir um lançamento igual
  IF NOT EXISTS (
    SELECT 1
      FROM financas.pvi_previsao_itens
     WHERE pvi_usr_id = v_usr_id
       AND pvi_pvs_id = v_semana_id
       AND pvi_data = DATE '2025-03-20'
       AND pvi_tipo = 'saldo_inicial'
       AND pvi_categoria = 'Saldo inicial da aplicação'
  ) THEN
    INSERT INTO financas.pvi_previsao_itens (
      pvi_pvs_id,
      pvi_usr_id,
      pvi_data,
      pvi_tipo,
      pvi_categoria,
      pvi_valor,
      pvi_observacao,
      pvi_importado
    ) VALUES (
      v_semana_id,
      v_usr_id,
      DATE '2025-03-20',
      'saldo_inicial',
      'Saldo inicial da aplicação',
      4777842.88,
      'Valor aplicado existente ao iniciar os controles em 20/03/2025',
      false
    );
  END IF;
END $$;
