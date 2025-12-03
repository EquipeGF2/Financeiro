'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { gerarIntervaloDatas } from './datas';

type AnySupabaseClient = SupabaseClient<any, any, any>;

export type TipoMovimentacaoAplicacao = 'aplicacao' | 'resgate';

export interface MovimentoAplicacao {
  data: string;
  tipo: TipoMovimentacaoAplicacao;
  valor: number;
  descricao: string;
  origem: 'pagamentos' | 'receitas';
  saldoApos?: number;
}

export interface SaldoDiarioAplicacao {
  data: string;
  saldoFinal: number;
  aplicadoNoDia: number;
  resgatadoNoDia: number;
  saldoMovimentacao: number;
}

export interface ExtratoAplicacao {
  saldoInicial: number;
  saldoFinal: number;
  totalAplicacoes: number;
  totalResgates: number;
  movimentos: MovimentoAplicacao[];
  saldosDiarios: SaldoDiarioAplicacao[];
  dataBase?: string | null;
}

interface RegistroSaldoInicial {
  pvi_data: string;
  pvi_valor: number;
}

interface PagamentoAplicacao {
  pag_data: string;
  pag_valor: number;
  pag_descricao?: string | null;
  pag_are_id?: number | null;
  are_areas: { are_nome?: string | null } | { are_nome?: string | null }[] | null;
}

interface ReceitaAplicacao {
  rec_data: string;
  rec_valor: number;
  rec_ctr_id?: number | null;
  ctr_contas_receita:
    | { ctr_nome?: string | null }
    | { ctr_nome?: string | null }[]
    | null;
}

const extrairRelacao = <T,>(valor: T | T[] | null | undefined): T | null => {
  if (!valor) return null;
  return Array.isArray(valor) ? valor[0] ?? null : valor;
};

const normalizarNumero = (valor: unknown): number => Number(valor ?? 0);
const normalizarData = (valor: unknown): string | null => {
  if (!valor || typeof valor !== 'string') return null;
  const data = valor.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
};

export async function carregarExtratoAplicacao(
  supabase: AnySupabaseClient,
  inicio: string,
  fim: string,
): Promise<ExtratoAplicacao> {
  if (!inicio || !fim) {
    throw new Error('Período inválido para consultar o saldo de aplicação.');
  }

  // 1) Descobrir a data base (saldo inicial da aplicação)
  const saldoInicialRes = await supabase
    .from('pvi_previsao_itens')
    .select('pvi_data, pvi_valor')
    .eq('pvi_tipo', 'saldo_inicial')
    .ilike('pvi_categoria', '%aplica%')
    .order('pvi_data', { ascending: true })
    .limit(1)
    .maybeSingle<RegistroSaldoInicial>();

  if (saldoInicialRes.error) {
    throw saldoInicialRes.error;
  }

  const registroSaldo = saldoInicialRes.data;
  const dataBase = registroSaldo?.pvi_data ?? inicio;
  const valorSaldoInicialBase = normalizarNumero(registroSaldo?.pvi_valor);

  // 2) Buscar movimentos de aplicação e resgate a partir da data base até o fim do período solicitado
  const [pagamentosRes, receitasRes] = await Promise.all([
    supabase
      .from('pag_pagamentos_area')
      .select('pag_data, pag_valor, pag_descricao, pag_are_id, are_areas(are_nome)')
      .eq('pag_are_id', 15)
      .gte('pag_data', dataBase)
      .lte('pag_data', fim)
      .order('pag_data', { ascending: true }),
    supabase
      .from('rec_receitas')
      .select('rec_data, rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome)')
      .eq('rec_ctr_id', 4)
      .gte('rec_data', dataBase)
      .lte('rec_data', fim)
      .order('rec_data', { ascending: true }),
  ]);

  if (pagamentosRes.error) throw pagamentosRes.error;
  if (receitasRes.error) throw receitasRes.error;

  const pagamentos = (pagamentosRes.data as PagamentoAplicacao[] | null) ?? [];
  const receitas = (receitasRes.data as ReceitaAplicacao[] | null) ?? [];

  const movimentos: MovimentoAplicacao[] = [];

  pagamentos.forEach((pagamento) => {
    const dataMovimento = normalizarData(pagamento.pag_data);
    if (!dataMovimento) return;

    if (pagamento.pag_are_id && pagamento.pag_are_id !== 15) return;

    const rel = extrairRelacao(pagamento.are_areas);
    const nomeArea = rel?.are_nome ?? 'Transferência aplicação';
    const descricaoInformada = pagamento.pag_descricao?.trim();
    const descricaoMovimento = descricaoInformada && descricaoInformada.length > 0
      ? descricaoInformada
      : nomeArea;

    const valor = normalizarNumero(pagamento.pag_valor);
    if (valor === 0) return;

    movimentos.push({
      data: dataMovimento,
      tipo: 'aplicacao',
      valor,
      descricao: descricaoMovimento,
      origem: 'pagamentos',
    });
  });

  receitas.forEach((receita) => {
    const dataMovimento = normalizarData(receita.rec_data);
    if (!dataMovimento) return;

    if (receita.rec_ctr_id && receita.rec_ctr_id !== 4) return;

    const rel = extrairRelacao(receita.ctr_contas_receita);
    const nomeConta = rel?.ctr_nome ?? 'Resgate aplicação';

    const valor = normalizarNumero(receita.rec_valor);
    if (valor === 0) return;

    movimentos.push({
      data: dataMovimento,
      tipo: 'resgate',
      valor,
      descricao: nomeConta,
      origem: 'receitas',
    });
  });

  const movimentosOrdenados = movimentos.sort((a, b) => a.data.localeCompare(b.data));

  // 3) Calcular o saldo antes do início do período
  let saldoAcumulado = valorSaldoInicialBase;
  let saldoInicialPeriodo = valorSaldoInicialBase;

  movimentosOrdenados.forEach((movimento) => {
    const ajuste = movimento.tipo === 'resgate' ? -movimento.valor : movimento.valor;
    if (movimento.data < inicio) {
      saldoAcumulado += ajuste;
      saldoInicialPeriodo = saldoAcumulado;
    }
  });

  // 4) Registrar movimentos no período com saldo após cada lançamento
  const movimentosPeriodo: MovimentoAplicacao[] = [];
  saldoAcumulado = saldoInicialPeriodo;

  movimentosOrdenados.forEach((movimento) => {
    if (movimento.data < inicio || movimento.data > fim) return;
    const ajuste = movimento.tipo === 'resgate' ? -movimento.valor : movimento.valor;
    saldoAcumulado += ajuste;
    movimentosPeriodo.push({ ...movimento, saldoApos: saldoAcumulado });
  });

  const totalAplicacoes = movimentosPeriodo
    .filter((mov) => mov.tipo === 'aplicacao')
    .reduce((acc, mov) => acc + mov.valor, 0);
  const totalResgates = movimentosPeriodo
    .filter((mov) => mov.tipo === 'resgate')
    .reduce((acc, mov) => acc + mov.valor, 0);

  // 5) Consolidar saldos diários
  const datasPeriodo = gerarIntervaloDatas(inicio, fim);
  const saldosDiarios: SaldoDiarioAplicacao[] = [];
  let saldoPorDia = saldoInicialPeriodo;
  let idxMov = 0;

  datasPeriodo.forEach((data) => {
    let aplicadoNoDia = 0;
    let resgatadoNoDia = 0;

    while (idxMov < movimentosPeriodo.length && movimentosPeriodo[idxMov].data <= data) {
      const mov = movimentosPeriodo[idxMov];
      if (mov.data !== data) {
        idxMov += 1;
        continue;
      }

      if (mov.tipo === 'aplicacao') aplicadoNoDia += mov.valor;
      if (mov.tipo === 'resgate') resgatadoNoDia += mov.valor;

      saldoPorDia = mov.saldoApos ?? saldoPorDia;
      idxMov += 1;
    }

    const temMovimento = aplicadoNoDia !== 0 || resgatadoNoDia !== 0;
    if (temMovimento) {
      saldosDiarios.push({
        data,
        saldoFinal: saldoPorDia,
        aplicadoNoDia,
        resgatadoNoDia,
        saldoMovimentacao: aplicadoNoDia - resgatadoNoDia,
      });
    }
  });

  const saldoFinal =
    movimentosPeriodo.length > 0 ? movimentosPeriodo[movimentosPeriodo.length - 1].saldoApos ?? saldoInicialPeriodo : saldoInicialPeriodo;

  return {
    saldoInicial: saldoInicialPeriodo,
    saldoFinal,
    totalAplicacoes,
    totalResgates,
    movimentos: movimentosPeriodo,
    saldosDiarios,
    dataBase: registroSaldo?.pvi_data ?? null,
  };
}
