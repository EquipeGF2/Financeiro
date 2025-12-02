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
        const linhasCalculadas = datas.map((data) => {
          const totalCobranca = Number(mapaCobranca.get(data) ?? 0);
          const totalSaldo = Number(mapaSaldoDiario.get(data) ?? 0);
          const diferenca = totalCobranca - totalSaldo;

          return {
            data,
            totalCobranca,
            totalSaldoDiario: totalSaldo,
            diferenca,
          } satisfies LinhaAuditoria;
        });

        setLinhas(linhasCalculadas);
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

  const totalDivergencias = useMemo(
    () => linhas.filter((linha) => Math.abs(linha.diferenca) > 0.009).length,
    [linhas]
  );

  const somaTotaisCobranca = useMemo(
    () => linhas.reduce((acc, linha) => acc + linha.totalCobranca, 0),
    [linhas]
  );

  const somaTotaisSaldo = useMemo(
    () => linhas.reduce((acc, linha) => acc + linha.totalSaldoDiario, 0),
    [linhas]
  );

  return (
    <>
      <Header
        title="Auditoria de Receitas"
        description="Compare o total diário lançado na cobrança com as receitas registradas no saldo diário para identificar divergências."
      />

      <div className="space-y-4">
        <Card title="Período de análise" subtitle="Defina o intervalo de datas para realizar a conferência diária.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="date"
              label="Início"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
            />
            <Input
              type="date"
              label="Fim"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
            />
          </div>
        </Card>

        <Card
          title="Resultado da conferência"
          subtitle="Acompanhe o total registrado na cobrança e no saldo diário, com destaque para eventuais divergências."
        >
          {erro && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-red-700">
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="py-8 flex justify-center">
              <Loading text="Carregando dados de auditoria..." />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">Total cobrança (período)</p>
                  <p className="text-xl font-semibold text-gray-800">{formatCurrency(somaTotaisCobranca)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">Total saldo diário (período)</p>
                  <p className="text-xl font-semibold text-gray-800">{formatCurrency(somaTotaisSaldo)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-gray-50">
                  <p className="text-sm text-gray-600">Dias com divergência</p>
                  <p className={`text-xl font-semibold ${totalDivergencias > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {totalDivergencias}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Total Cobrança
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Total Saldo Diário
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Diferença
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {linhas.map((linha) => {
                      const semDiferenca = Math.abs(linha.diferenca) < 0.01;
                      return (
                        <tr key={linha.data} className={semDiferenca ? '' : 'bg-red-50/60'}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">
                            {formatarDataPt(linha.data)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">
                            {formatCurrency(linha.totalCobranca)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">
                            {formatCurrency(linha.totalSaldoDiario)}
                          </td>
                          <td
                            className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${
                              semDiferenca ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {formatCurrency(linha.diferenca)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {semDiferenca ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                Conciliado
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                Divergente
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
};

export default AuditoriaReceitasPage;
