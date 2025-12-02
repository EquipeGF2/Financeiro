'use client';

import React, { useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { getOrCreateUser, getSupabaseClient, type UsuarioRow } from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

type MaybeArray<T> = T | T[] | null | undefined;

type ReceitaRow = {
  rec_id?: number;
  rec_valor?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown } | null>;
};

type ResultadoDia = {
  data: string;
  saldoInicial: number;
  saldoFinal: number;
  receitas: number;
  despesas: number;
  aplicacoes: number;
};

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const dataISOValida = (valor: string): boolean => /^(\d{4})-(\d{2})-(\d{2})$/.test(valor);

const gerarIntervaloDatas = (inicio: string, fim: string): string[] => {
  if (!dataISOValida(inicio)) return [];
  const datas: string[] = [];
  const inicioDate = new Date(`${inicio}T00:00:00`);
  const fimDate = dataISOValida(fim) ? new Date(`${fim}T00:00:00`) : inicioDate;
  const cursor = new Date(inicioDate);
  while (cursor <= fimDate) {
    datas.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
};

const normalizarRelacao = <T,>(valor: MaybeArray<T>): Exclude<T, null | undefined>[] => {
  if (!valor) return [];
  const arr = Array.isArray(valor) ? valor : [valor];
  return arr.filter((item): item is Exclude<T, null | undefined> => item != null);
};

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

const calcularMovimentoDoDia = async (supabase: ReturnType<typeof getSupabaseClient>, data: string) => {
  const [receitasRes, pagamentosRes] = await Promise.all([
    supabase
      .from('rec_receitas')
      .select('rec_id, rec_valor, ctr_contas_receita(ctr_nome)')
      .eq('rec_data', data),
    supabase
      .from('pag_pagamentos_area')
      .select('pag_valor, pag_are_id, are_areas(are_nome)')
      .eq('pag_data', data),
  ]);

  if (receitasRes.error) throw receitasRes.error;
  if (pagamentosRes.error) throw pagamentosRes.error;

  const receitasUnicas = new Map<number, ReceitaRow>();
  normalizarRelacao(receitasRes.data).forEach((item: any) => {
    const recId = item?.rec_id;
    if (recId && !receitasUnicas.has(recId)) {
      receitasUnicas.set(recId, item);
    } else if (!recId) {
      receitasUnicas.set(Math.random(), item);
    }
  });

  let totalReceitas = 0;
  receitasUnicas.forEach((item) => {
    totalReceitas += arredondar(Number(item.rec_valor ?? 0));
  });

  let totalDespesas = 0;
  let aplicacoes = 0;

  normalizarRelacao(pagamentosRes.data).forEach((item) => {
    const titulo = normalizarRelacao(item.are_areas)[0]?.are_nome ?? '';
    const tituloNormalizado = String(titulo).trim().toUpperCase();
    const valor = arredondar(Number(item.pag_valor ?? 0));

    const ehAplicacao = tituloNormalizado.includes('APLICACAO') || tituloNormalizado.includes('APLICAÇÃO');
    const ehResgate = tituloNormalizado.includes('RESGATE');
    const ehTransferencia = tituloNormalizado.includes('TRANSFERENCIA') || tituloNormalizado.includes('TRANSFERÊNCIA');

    if (ehAplicacao) {
      if (ehResgate) {
        aplicacoes += valor;
      } else if (ehTransferencia) {
        aplicacoes -= valor;
      } else {
        aplicacoes -= valor;
      }
    } else {
      totalDespesas += valor;
    }
  });

  return {
    totalReceitas: arredondar(totalReceitas),
    totalDespesas: arredondar(totalDespesas),
    aplicacoes: arredondar(aplicacoes),
  };
};

export default function RecalcularSaldoDiarioPage() {
  const hoje = useMemo(() => new Date(), []);
  const [inicio, setInicio] = useState(() => {
    const inicioPadrao = new Date(hoje);
    inicioPadrao.setDate(inicioPadrao.getDate() - 6);
    return toISODate(inicioPadrao);
  });
  const [fim, setFim] = useState(() => toISODate(hoje));
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ totalDias: number; ultimoSaldo: number; dias: ResultadoDia[] } | null>(null);

  const handleRecalcular = async () => {
    if (!dataISOValida(inicio)) {
      setErro('Informe uma data inicial válida (AAAA-MM-DD).');
      return;
    }
    if (fim && !dataISOValida(fim)) {
      setErro('Informe uma data final válida (AAAA-MM-DD).');
      return;
    }

    const datas = gerarIntervaloDatas(inicio, fim);
    if (!datas.length) {
      setErro('Período inválido. Verifique as datas selecionadas.');
      return;
    }

    setProcessando(true);
    setErro(null);
    setFeedback(null);
    setResumo(null);

    try {
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data: usuario, error: erroUsuario } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );

      if (erroUsuario) throw erroUsuario;
      if (!usuario) throw new Error('Não foi possível identificar o usuário autenticado.');

      const [primeiroSaldoRes, saldoAnteriorRes] = await Promise.all([
        supabase
          .from('sdd_saldo_diario')
          .select('sdd_data, sdd_saldo_inicial')
          .order('sdd_data', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('sdd_saldo_diario')
          .select('sdd_saldo_final, sdd_data')
          .lt('sdd_data', datas[0])
          .order('sdd_data', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (primeiroSaldoRes.error) throw primeiroSaldoRes.error;
      if (saldoAnteriorRes.error) throw saldoAnteriorRes.error;

      const primeiroSaldo = primeiroSaldoRes.data;
      let saldoAnterior: number | null =
        saldoAnteriorRes.data?.sdd_saldo_final !== undefined && saldoAnteriorRes.data?.sdd_saldo_final !== null
          ? Number(saldoAnteriorRes.data.sdd_saldo_final)
          : null;

      const diasProcessados: ResultadoDia[] = [];

      for (const data of datas) {
        const { totalReceitas, totalDespesas, aplicacoes } = await calcularMovimentoDoDia(supabase, data);

        const { data: registroAtual, error: erroAtual } = await supabase
          .from('sdd_saldo_diario')
          .select('sdd_id, sdd_criado_em, sdd_saldo_inicial')
          .eq('sdd_data', data)
          .maybeSingle();

        if (erroAtual) throw erroAtual;

        const saldoInicialDia = arredondar(
          saldoAnterior !== null
            ? saldoAnterior
            : data === primeiroSaldo?.sdd_data
              ? Number(primeiroSaldo?.sdd_saldo_inicial ?? 0)
              : Number(registroAtual?.sdd_saldo_inicial ?? 0),
        );

        const saldoFinalDia = arredondar(saldoInicialDia + totalReceitas - totalDespesas + aplicacoes);

        const { error: erroUpsert } = await supabase
          .from('sdd_saldo_diario')
          .upsert(
            {
              sdd_data: data,
              sdd_saldo_inicial: saldoInicialDia,
              sdd_saldo_final: saldoFinalDia,
              sdd_descricao: 'Reprocessamento manual',
              sdd_observacao: null,
              sdd_usr_id: (usuario as UsuarioRow).usr_id,
              ...(registroAtual?.sdd_criado_em ? { sdd_criado_em: registroAtual.sdd_criado_em } : {}),
            },
            { onConflict: 'sdd_data' },
          );

        if (erroUpsert) throw erroUpsert;

        diasProcessados.push({
          data,
          saldoInicial: saldoInicialDia,
          saldoFinal: saldoFinalDia,
          receitas: totalReceitas,
          despesas: totalDespesas,
          aplicacoes,
        });

        saldoAnterior = saldoFinalDia;
      }

      setResumo({ totalDias: datas.length, ultimoSaldo: saldoAnterior ?? 0, dias: diasProcessados });
      setFeedback('Saldos recalculados e atualizados com sucesso.');
    } catch (error) {
      console.error('Erro ao recalcular saldos diários:', error);
      setErro(
        traduzirErroSupabase(
          error,
          'Não foi possível recalcular os saldos diários para o período selecionado. Tente novamente mais tarde.',
        ),
      );
    } finally {
      setProcessando(false);
    }
  };

  return (
    <>
      <Header
        title="Recalcular Saldos Diários"
        subtitle="Atualize em lote o saldo final do dia conforme a fórmula de movimentação"
      />

      <div className="page-content space-y-6">
        <Card title="Período para recálculo" subtitle="Informe o intervalo a ser reprocessado no banco">
          <div className="grid gap-4 md:grid-cols-4 md:items-end">
            <Input
              label="Data inicial"
              type="date"
              value={inicio}
              onChange={(event) => {
                const valor = event.target.value;
                setInicio(valor);
                if (valor && valor > fim) {
                  setFim(valor);
                }
              }}
              max={fim}
            />
            <Input
              label="Data final"
              type="date"
              value={fim}
              min={inicio}
              onChange={(event) => setFim(event.target.value)}
            />
            <div className="text-sm text-gray-600">
              Dias no intervalo: {gerarIntervaloDatas(inicio, fim).length}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleRecalcular} disabled={processando}>
                {processando ? 'Recalculando...' : 'Recalcular período'}
              </Button>
            </div>
          </div>
        </Card>

        {erro && (
          <Card variant="danger" title="Erro ao recalcular">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {feedback && !erro && (
          <Card variant="success" title="Processamento concluído">
            <p className="text-sm text-success-700">{feedback}</p>
          </Card>
        )}

        {processando && (
          <div className="flex justify-center py-10">
            <Loading text="Atualizando saldos diários..." />
          </div>
        )}

        {resumo && !processando && (
          <Card
            title="Resumo do recálculo"
            subtitle="Valores gravados na tabela sdd_saldo_diario"
            variant="primary"
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dias processados</p>
                <p className="text-2xl font-semibold text-gray-900">{resumo.totalDias}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo final do último dia</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(resumo.ultimoSaldo)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Período selecionado</p>
                <p className="text-sm text-gray-900">
                  {inicio ? new Date(inicio).toLocaleDateString('pt-BR') : '-'} a{' '}
                  {fim ? new Date(fim).toLocaleDateString('pt-BR') : new Date(inicio).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b-2 border-gray-300 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Data</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Saldo inicial</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Receitas</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Despesas</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Aplicações</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Saldo final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {resumo.dias.map((dia) => (
                    <tr key={dia.data}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {new Date(dia.data).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(dia.saldoInicial)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(dia.receitas)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(dia.despesas)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(dia.aplicacoes)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(dia.saldoFinal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {!resumo && !processando && !erro && (
          <Card title="Como funciona" variant="default">
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
              <li>O saldo inicial de cada dia usa o saldo final do dia anterior já registrado.</li>
              <li>
                O primeiro dia existente mantém o saldo inicial original, evitando que o valor seja sobrescrito durante o
                recálculo.
              </li>
              <li>
                A fórmula aplicada é: saldo inicial + receitas - despesas + resgates de aplicação - transferências para
                aplicação.
              </li>
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
