/**
 * API Route: Sincronizar Saldos Diários
 *
 * Recalcula e sincroniza os saldos iniciais e finais de todos os dias
 * a partir de uma data específica, garantindo que o saldo inicial de cada dia
 * seja igual ao saldo final do dia anterior.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dataInicio, userId } = body;

    console.log('Iniciando sincronização:', { dataInicio, userId: userId?.slice(0, 8) });

    if (!dataInicio) {
      return NextResponse.json(
        { error: 'Data de início é obrigatória' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Identificação do usuário é obrigatória' },
        { status: 400 }
      );
    }

    // Primeiro, garantir que o usuário existe na tabela usr_usuarios
    // Fazemos isso sem header para evitar problemas de RLS circular
    const supabaseNoAuth = createClient(supabaseUrl, supabaseKey);

    console.log('Verificando se usuário existe...');
    const { data: usuarioExiste } = await supabaseNoAuth
      .from('usr_usuarios')
      .select('usr_id')
      .eq('usr_identificador', userId)
      .maybeSingle();

    if (!usuarioExiste) {
      console.log('Usuário não existe, criando...');
      const { error: erroCriarUsuario } = await supabaseNoAuth
        .from('usr_usuarios')
        .insert({
          usr_identificador: userId,
          usr_nome: `Usuário ${userId.slice(0, 8)}`,
          usr_ativo: true,
        });

      if (erroCriarUsuario) {
        console.error('Erro ao criar usuário:', erroCriarUsuario);
        return NextResponse.json(
          { error: 'Erro ao criar usuário', details: erroCriarUsuario.message },
          { status: 500 }
        );
      }
      console.log('Usuário criado com sucesso');
    } else {
      console.log('Usuário já existe:', usuarioExiste.usr_id);
    }

    // Cliente Supabase com header x-user-id
    // As políticas RLS filtram automaticamente os dados do usuário
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          'x-user-id': userId,
        },
      },
    });

    console.log('Cliente Supabase criado com header x-user-id');

    // 1. Buscar o saldo final do dia anterior à data de início
    const { data: saldoDiaAnterior, error: erroSaldoAnterior } = await supabase
      .from('sdd_saldo_diario')
      .select('sdd_saldo_final')
      .lt('sdd_data', dataInicio)
      .order('sdd_data', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroSaldoAnterior) {
      console.error('Erro ao buscar saldo anterior:', erroSaldoAnterior);
      throw erroSaldoAnterior;
    }

    // 2. Buscar todos os registros de saldo diário a partir da data de início
    const { data: registrosSaldo, error: erroRegistros } = await supabase
      .from('sdd_saldo_diario')
      .select('*')
      .gte('sdd_data', dataInicio)
      .order('sdd_data', { ascending: true });

    if (erroRegistros) {
      console.error('Erro ao buscar registros de saldo:', erroRegistros);
      throw erroRegistros;
    }

    if (!registrosSaldo || registrosSaldo.length === 0) {
      return NextResponse.json({
        message: 'Nenhum registro encontrado para sincronizar a partir desta data',
        registrosAtualizados: 0,
      });
    }

    let saldoFinalAnterior = saldoDiaAnterior?.sdd_saldo_final ?? 0;
    const registrosAtualizados = [];

    // 3. Para cada dia, recalcular os saldos
    for (const registro of registrosSaldo) {
      const dataAtual = registro.sdd_data;

      // Buscar receitas do dia (RLS filtra automaticamente pelo usuário)
      const { data: receitas, error: erroReceitas } = await supabase
        .from('rec_receitas')
        .select('rec_valor')
        .eq('rec_data', dataAtual);

      if (erroReceitas) {
        console.error(`Erro ao buscar receitas para ${dataAtual}:`, erroReceitas);
        continue;
      }

      // Buscar despesas do dia (RLS filtra automaticamente pelo usuário)
      const { data: despesas, error: erroDespesas } = await supabase
        .from('pag_pagamentos_area')
        .select('pag_valor, are_areas(are_nome)')
        .eq('pag_data', dataAtual);

      if (erroDespesas) {
        console.error(`Erro ao buscar despesas para ${dataAtual}:`, erroDespesas);
        continue;
      }

      // Calcular totais
      const totalReceitas = (receitas || []).reduce(
        (acc, r) => acc + (Number(r.rec_valor) || 0),
        0
      );

      // Separar aplicações de despesas normais
      let totalDespesas = 0;
      let aplicacoes = 0;

      (despesas || []).forEach((d: any) => {
        const valor = Number(d.pag_valor) || 0;
        const areaNome = d.are_areas?.are_nome || '';
        const areaNormalizada = areaNome.trim().toUpperCase();

        const ehAplicacao = areaNormalizada.includes('APLICACAO') ||
                           areaNormalizada.includes('APLICAÇÃO');

        if (ehAplicacao) {
          const ehResgate = areaNormalizada.includes('RESGATE');
          const ehTransferencia = areaNormalizada.includes('TRANSFERENCIA') ||
                                 areaNormalizada.includes('TRANSFERÊNCIA');

          if (ehResgate) {
            aplicacoes += valor; // Resgate: entrada
          } else if (ehTransferencia) {
            aplicacoes -= valor; // Transferência: saída
          } else {
            aplicacoes -= valor; // Padrão: saída
          }
        } else {
          totalDespesas += valor;
        }
      });

      // Recalcular saldos
      const novoSaldoInicial = Math.round(saldoFinalAnterior * 100) / 100;
      const novoSaldoFinal = Math.round(
        (novoSaldoInicial + totalReceitas - totalDespesas + aplicacoes) * 100
      ) / 100;

      // Atualizar o registro (RLS garante que só atualiza dados do usuário)
      const { error: erroAtualizacao } = await supabase
        .from('sdd_saldo_diario')
        .update({
          sdd_saldo_inicial: novoSaldoInicial,
          sdd_saldo_final: novoSaldoFinal,
        })
        .eq('sdd_data', dataAtual);

      if (erroAtualizacao) {
        console.error(`Erro ao atualizar saldo para ${dataAtual}:`, erroAtualizacao);
        continue;
      }

      registrosAtualizados.push({
        data: dataAtual,
        saldoInicialAnterior: registro.sdd_saldo_inicial,
        saldoInicialNovo: novoSaldoInicial,
        saldoFinalAnterior: registro.sdd_saldo_final,
        saldoFinalNovo: novoSaldoFinal,
      });

      // Preparar para o próximo dia
      saldoFinalAnterior = novoSaldoFinal;
    }

    return NextResponse.json({
      message: 'Sincronização concluída com sucesso',
      registrosAtualizados: registrosAtualizados.length,
      detalhes: registrosAtualizados,
    });
  } catch (error: any) {
    console.error('Erro ao sincronizar saldos:', error);
    console.error('Detalhes do erro:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack
    });
    return NextResponse.json(
      {
        error: 'Erro ao sincronizar saldos',
        message: error?.message || String(error),
        details: error?.details,
        code: error?.code,
        hint: error?.hint
      },
      { status: 500 }
    );
  }
}
