'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Card, Input, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient } from '@/lib/supabaseClient';

type LinhaAuditoria = {
  data: string;
  totalCobranca: number;
  totalSaldoDiario: number;
  diferenca: number;
};

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const gerarIntervaloDatas = (inicio: string, fim: string): string[] => {
  if (!inicio) return [];
  const datas: string[] = [];
  const dataInicio = new Date(`${inicio}T00:00:00`);
  const dataFim = fim ? new Date(`${fim}T00:00:00`) : dataInicio;
  const atual = new Date(dataInicio);

  while (atual <= dataFim) {
    datas.push(toISODate(atual));
    atual.setDate(atual.getDate() + 1);
  }

  return datas;
};

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

const AuditoriaReceitasPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [periodoFim, setPeriodoFim] = useState(() => toISODate(hoje));
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    return toISODate(inicio);
  });

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaAuditoria[]>([]);

  const carregarAuditoria = useCallback(
    async (inicio: string, fim: string) => {
      try {
        setCarregando(true);
        setErro(null);

        const supabase = getSupabaseClient();
        const [totaisCobrancaRes, receitasSaldoRes] = await Promise.all([
          supabase
            .from('cob_receita_total')
            .select('crt_data, crt_valor_total')
            .gte('crt_data', inicio)
            .lte('crt_data', fim)
            .order('crt_data', { ascending: true }),
          supabase
            .from('rec_receitas')
            .select('rec_data, rec_valor')
            .gte('rec_data', inicio)
            .lte('rec_data', fim),
        ]);

        if (totaisCobrancaRes.error) throw totaisCobrancaRes.error;
        if (receitasSaldoRes.error) throw receitasSaldoRes.error;

        const mapaCobranca = new Map<string, number>();
        (totaisCobrancaRes.data ?? []).forEach((item: any) => {
          mapaCobranca.set(item.crt_data, Number(item.crt_valor_total ?? 0));
        });

        const mapaSaldoDiario = new Map<string, number>();
        (receitasSaldoRes.data ?? []).forEach((item: any) => {
          const data = item.rec_data as string;
          const valor = Number(item.rec_valor ?? 0);
          mapaSaldoDiario.set(data, (mapaSaldoDiario.get(data) ?? 0) + valor);
        });

        const datas = gerarIntervaloDatas(inicio, fim);
        const linhasCalculadas = datas
          .map((data) => {
            const temCobranca = mapaCobranca.has(data);
            const temSaldo = mapaSaldoDiario.has(data);

            if (!temCobranca && !temSaldo) return null;

            const totalCobranca = Number(mapaCobranca.get(data) ?? 0);
            const totalSaldo = Number(mapaSaldoDiario.get(data) ?? 0);
            const diferenca = Number((totalCobranca - totalSaldo).toFixed(2));

            return {
              data,
              totalCobranca,
              totalSaldoDiario: totalSaldo,
              diferenca,
            } satisfies LinhaAuditoria;
          })
          .filter(Boolean) as LinhaAuditoria[];

        setLinhas(linhasCalculadas.reverse());
      } catch (err: any) {
        console.error('Erro ao carregar auditoria de receitas:', err);
        setErro('Não foi possível carregar os dados de auditoria no momento.');
      } finally {
        setCarregando(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!periodoInicio) return;
    const fim = periodoFim || periodoInicio;
    carregarAuditoria(periodoInicio, fim);
  }, [carregarAuditoria, periodoFim, periodoInicio]);

  const intervaloDatas = useMemo(
    () => gerarIntervaloDatas(periodoInicio, periodoFim || periodoInicio),
    [periodoFim, periodoInicio]
  );

  const totaisResumo = useMemo(() => {
    if (!linhas.length) {
      return {
        diasComDado: 0,
        divergencias: 0,
        maiorDiferenca: 0,
        totalCobranca: 0,
        totalSaldoDiario: 0,
      };
    }

    const divergencias = linhas.filter((linha) => Math.abs(linha.diferenca) > 0.009);
    const maiorDiferenca = divergencias.reduce(
      (acumulado, linha) =>
        Math.abs(linha.diferenca) > Math.abs(acumulado) ? linha.diferenca : acumulado,
      0
    );

    const totalCobranca = linhas.reduce((acc, linha) => acc + linha.totalCobranca, 0);
    const totalSaldoDiario = linhas.reduce((acc, linha) => acc + linha.totalSaldoDiario, 0);

    return {
      diasComDado: linhas.length,
      divergencias: divergencias.length,
      maiorDiferenca,
      totalCobranca,
      totalSaldoDiario,
    };
  }, [linhas]);

  return (
    <>
      <Header
        title="Auditoria de Receitas"
        subtitle="Compare o valor total recebido na cobrança com as receitas registradas no saldo diário."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              type="date"
              label="Início"
              value={periodoInicio}
              onChange={(event) => {
                const valor = event.target.value;
                setPeriodoInicio(valor);
                if (valor && valor > periodoFim) {
                  setPeriodoFim(valor);
                }
              }}
            />
            <Input
              type="date"
              label="Fim"
              min={periodoInicio}
              value={periodoFim}
              onChange={(event) => setPeriodoFim(event.target.value)}
            />
            <div className="text-sm text-gray-500">Intervalo: {intervaloDatas.length} dia(s)</div>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Erro ao carregar auditoria">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregando ? (
          <div className="flex justify-center py-12">
            <Loading text="Carregando auditoria de receitas..." />
          </div>
        ) : (
          <>
            <Card
              title="Resumo do Período"
              subtitle="Indicadores para o intervalo selecionado"
              variant="primary"
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dias analisados</p>
                  <p className="text-2xl font-semibold text-gray-900">{totaisResumo.diasComDado}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dias com divergência</p>
                  <p className="text-2xl font-semibold text-error-600">{totaisResumo.divergencias}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Maior diferença</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(Math.abs(totaisResumo.maiorDiferenca))}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Soma das diferenças</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(totaisResumo.totalCobranca - totaisResumo.totalSaldoDiario)}
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Totais por Origem" subtitle="Visão consolidada do período">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                  <p className="text-sm text-gray-600">Valor recebido total (cobrança)</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totaisResumo.totalCobranca)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                  <p className="text-sm text-gray-600">Receitas lançadas no saldo diário</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(totaisResumo.totalSaldoDiario)}
                  </p>
                </div>
              </div>
            </Card>

            <Card
              title="Detalhamento por Dia"
              subtitle="Valor recebido na cobrança x Receita no saldo diário"
            >
              {linhas.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum lançamento encontrado para o período selecionado. Ajuste as datas para visualizar os dias com
                  registros (a partir de 12/11/2025).
                </p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b-2 border-gray-300 bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">Data</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Total Cobrança</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Total Saldo Diário</th>
                        <th className="px-3 py-3 text-right font-semibold text-error-700">Diferença</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {linhas.map((linha) => {
                        const temDivergencia = Math.abs(linha.diferenca) > 0.01;
                        return (
                          <tr
                            key={linha.data}
                            className={temDivergencia ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                          >
                            <td className="px-3 py-3 font-medium text-gray-900">{formatarDataPt(linha.data)}</td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {formatCurrency(linha.totalCobranca)}
                            </td>
                            <td className="px-3 py-3 text-right text-gray-700">
                              {formatCurrency(linha.totalSaldoDiario)}
                            </td>
                            <td className={`px-3 py-3 text-right font-bold ${temDivergencia ? 'text-error-700' : 'text-gray-600'}`}>
                              {temDivergencia && '⚠️ '}
                              {formatCurrency(linha.diferenca)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {temDivergencia ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  Divergente
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  Conciliado
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
};

export default AuditoriaReceitasPage;
