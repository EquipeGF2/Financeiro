/**
 * Utilitário para verificar se uma data está liberada para edição
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getUltimosDiasUteis,
  formatDateToISO,
  parseISODate,
} from './diasUteis';

/**
 * Verifica se há lançamentos na data especificada
 */
export async function temLancamentosNaData(
  supabase: SupabaseClient<any, any, any>,
  data: string
): Promise<boolean> {
  try {
    // Verifica pagamentos por área
    const { count: countPag, error: errorPag } = await supabase
      .from('pag_pagamentos_area')
      .select('*', { count: 'exact', head: true })
      .eq('pag_data', data);

    if (errorPag) throw errorPag;
    if (countPag && countPag > 0) return true;

    // Verifica receitas
    const { count: countRec, error: errorRec } = await supabase
      .from('rec_receitas')
      .select('*', { count: 'exact', head: true })
      .eq('rec_data', data);

    if (errorRec) throw errorRec;
    if (countRec && countRec > 0) return true;

    // Verifica pagamentos banco
    const { count: countPagBanco, error: errorPagBanco } = await supabase
      .from('pbk_pagamentos_banco')
      .select('*', { count: 'exact', head: true })
      .eq('pbk_data', data);

    if (errorPagBanco) throw errorPagBanco;
    if (countPagBanco && countPagBanco > 0) return true;

    // Verifica saldo banco
    const { count: countSaldo, error: errorSaldo } = await supabase
      .from('sdb_saldo_banco')
      .select('*', { count: 'exact', head: true })
      .eq('sdb_data', data);

    if (errorSaldo) throw errorSaldo;
    if (countSaldo && countSaldo > 0) return true;

    return false;
  } catch (error) {
    console.error('Erro ao verificar lançamentos:', error);
    return true; // Em caso de erro, bloqueia por segurança
  }
}

/**
 * Verifica se a data está liberada manualmente na tabela de períodos
 */
export async function dataLiberadaManualmente(
  supabase: SupabaseClient<any, any, any>,
  data: string
): Promise<boolean> {
  try {
    const { data: periodos, error } = await supabase
      .from('per_periodos_liberados')
      .select('per_id')
      .eq('per_ativo', true)
      .lte('per_data_inicio', data)
      .gte('per_data_fim', data)
      .limit(1);

    if (error) throw error;
    return periodos && periodos.length > 0;
  } catch (error) {
    console.error('Erro ao verificar período liberado:', error);
    return false;
  }
}

/**
 * Verifica se a data está nos últimos N dias úteis
 */
export function dataEstaNosUltimosDiasUteis(
  data: string,
  quantidadeDias: number = 4
): boolean {
  const dataObj = parseISODate(data);
  const ultimosDias = getUltimosDiasUteis(quantidadeDias);

  return ultimosDias.some(diaUtil => {
    const diaUtilStr = formatDateToISO(diaUtil);
    return diaUtilStr === data;
  });
}

/**
 * Verifica se uma data está liberada para edição
 *
 * Regras:
 * 1. Se foi liberada manualmente (per_periodos_liberados): LIBERADO
 * 2. Se está nos últimos 4 dias úteis: SEMPRE LIBERADO (independente de ter lançamentos)
 * 3. Caso contrário: BLOQUEADO
 */
export async function dataLiberadaParaEdicao(
  supabase: SupabaseClient<any, any, any>,
  data: string
): Promise<{
  liberada: boolean;
  motivo: string;
}> {
  try {
    // 1. Verifica se foi liberada manualmente (prioridade máxima)
    const liberadaManual = await dataLiberadaManualmente(supabase, data);
    if (liberadaManual) {
      return {
        liberada: true,
        motivo: 'Período liberado manualmente pelo administrador',
      };
    }

    // 2. Verifica se está nos últimos 4 dias úteis
    const nosUltimosDias = dataEstaNosUltimosDiasUteis(data, 4);

    if (nosUltimosDias) {
      // Se está nos últimos 4 dias úteis, SEMPRE permite edição
      // (mesmo que já tenha lançamentos - permite adicionar mais lançamentos)
      return {
        liberada: true,
        motivo: 'Data está nos últimos 4 dias úteis',
      };
    }

    // 3. Data fora do período permitido
    return {
      liberada: false,
      motivo: 'Data fora do período permitido. Solicite liberação ao administrador.',
    };
  } catch (error) {
    console.error('Erro ao verificar se data está liberada:', error);
    return {
      liberada: false,
      motivo: 'Erro ao verificar permissão. Tente novamente.',
    };
  }
}

/**
 * Obtém a lista de datas liberadas para seleção
 * Retorna os últimos 4 dias úteis que não têm lançamentos
 */
export async function obterDatasLiberadas(
  supabase: SupabaseClient<any, any, any>
): Promise<string[]> {
  const ultimosDias = getUltimosDiasUteis(4);
  const datasLiberadas: string[] = [];

  for (const dia of ultimosDias) {
    const dataStr = formatDateToISO(dia);
    const temLancamentos = await temLancamentosNaData(supabase, dataStr);

    if (!temLancamentos) {
      datasLiberadas.push(dataStr);
    }
  }

  // Também inclui períodos liberados manualmente
  const { data: periodosLiberados } = await supabase
    .from('per_periodos_liberados')
    .select('per_data_inicio, per_data_fim')
    .eq('per_ativo', true);

  if (periodosLiberados) {
    for (const periodo of periodosLiberados) {
      const dataInicio = parseISODate(periodo.per_data_inicio);
      const dataFim = parseISODate(periodo.per_data_fim);

      let dataAtual = new Date(dataInicio);
      while (dataAtual <= dataFim) {
        const dataStr = formatDateToISO(dataAtual);
        if (!datasLiberadas.includes(dataStr)) {
          datasLiberadas.push(dataStr);
        }
        dataAtual.setDate(dataAtual.getDate() + 1);
      }
    }
  }

  return datasLiberadas.sort().reverse();
}
