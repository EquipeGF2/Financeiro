/**
 * API Route: Sincronizar Saldos Diários
 *
 * Recalcula e sincroniza os saldos iniciais e finais de todos os dias
 * a partir de uma data específica, garantindo que o saldo inicial de cada dia
 * seja igual ao saldo final do dia anterior.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServer } from '@/lib/supabaseClient';

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

    // Cliente Supabase com header x-user-id
    // O usuário já está autenticado e existe no sistema
    // As políticas RLS filtram automaticamente os dados do usuário
    const supabase = getSupabaseServer({ userId });

    console.log('Buscando registros de saldo a partir de', dataInicio);

    // 1. Buscar todos os registros de saldo diário a partir da data de início
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
      console.log('Nenhum registro encontrado para sincronizar');
      return NextResponse.json({
        message: 'Nenhum registro encontrado para sincronizar a partir desta data',
        registrosAtualizados: 0,
      });
    }

    console.log(`Encontrados ${registrosSaldo.length} registros para sincronizar`);

    let saldoFinalAnterior = registrosSaldo[0].sdd_saldo_final ?? 0;
    const registrosAtualizados = [];

    // 2. Para cada dia, ajustar o saldo inicial para o saldo final do dia anterior
    //    preservando a variação registrada no próprio dia
    for (const [index, registro] of registrosSaldo.entries()) {
      if (index === 0) {
        // Primeiro dia da janela: ponto de partida
        console.log(`Dia inicial ${registro.sdd_data}: mantendo saldos existentes.`);
        saldoFinalAnterior = registro.sdd_saldo_final ?? 0;
        continue;
      }

      const dataAtual = registro.sdd_data;
      console.log(`Processando ${dataAtual}...`);

      const variacaoDiaria = Math.round(
        ((registro.sdd_saldo_final ?? 0) - (registro.sdd_saldo_inicial ?? 0)) * 100
      ) / 100;

      const novoSaldoInicial = Math.round(saldoFinalAnterior * 100) / 100;
      const novoSaldoFinal = Math.round((novoSaldoInicial + variacaoDiaria) * 100) / 100;

      console.log(`${dataAtual}: Saldo inicial ${novoSaldoInicial} -> Saldo final ${novoSaldoFinal}`);

      // Atualizar o registro (RLS garante que só atualiza dados do usuário)
      const { error: erroAtualizacao } = await supabase
        .from('sdd_saldo_diario')
        .update({
          sdd_saldo_inicial: novoSaldoInicial,
          sdd_saldo_final: novoSaldoFinal,
        })
        .eq('sdd_id', registro.sdd_id);

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

    console.log(`Sincronização concluída: ${registrosAtualizados.length} registros atualizados`);

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
