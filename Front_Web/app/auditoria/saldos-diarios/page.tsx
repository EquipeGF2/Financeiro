'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Card, Input, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient } from '@/lib/supabaseClient';

interface SaldoBancoRow {
  sdb_data: string;
  sdb_saldo: number;
  sdb_ban_id: number;
  ban_bancos: { ban_nome: string } | { ban_nome: string }[] | null;
}

interface SaldoDiarioRow {
  sdd_data: string;
  sdd_saldo_inicial: number;
  sdd_saldo_final: number;
}

interface AuditoriaLinha {
  data: string;
  saldosPorBanco: Record<string, number>;
  totalSaldosBancos: number;
  saldoFinalDia: number;
  diferenca: number;
}

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

const extrairNomeBanco = (relacao: any): string => {
  if (!relacao) return 'Sem banco';
  if (Array.isArray(relacao)) {
    return relacao[0]?.ban_nome || 'Sem banco';
  }
  return relacao.ban_nome || 'Sem banco';
};

const AuditoriaSaldosDiariosPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [periodoFim, setPeriodoFim] = useState(() => toISODate(hoje));
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    return toISODate(inicio);
  });

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<AuditoriaLinha[]>([]);
  const [bancos, setBancos] = useState<string[]>([]);

  const carregarAuditoria = useCallback(
    async (inicio: string, fim: string) => {
      try {
        setCarregando(true);
        setErro(null);
        const supabase = getSupabaseClient();

        // Buscar saldo diário de um dia antes para usar como saldo inicial
        const dataObj = new Date(inicio + 'T00:00:00');
        dataObj.setDate(dataObj.getDate() - 1);
        const diaAnterior = dataObj.toISOString().split('T')[0];

        // Buscar todos os dados necessários
        const [saldosBancosRes, saldosDiariosRes, receitasRes, pagamentosAreaRes, pagamentosBancoRes] = await Promise.all([
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_data, sdb_saldo, sdb_ban_id, ban_bancos(ban_nome)')
            .gte('sdb_data', inicio)
            .lte('sdb_data', fim)
            .order('sdb_data', { ascending: true }),
          supabase
            .from('sdd_saldo_diario')
            .select('sdd_data, sdd_saldo_inicial, sdd_saldo_final')
            .gte('sdd_data', diaAnterior)
            .lte('sdd_data', fim)
            .order('sdd_data', { ascending: true }),
          supabase
            .from('rec_receitas')
            .select('rec_data, rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome)')
            .gte('rec_data', inicio)
            .lte('rec_data', fim),
          supabase
            .from('pag_pagamentos_area')
            .select('pag_data, pag_valor')
            .gte('pag_data', inicio)
            .lte('pag_data', fim),
          supabase
            .from('pbk_pagamentos_banco')
            .select('pbk_data, pbk_valor')
            .gte('pbk_data', inicio)
            .lte('pbk_data', fim),
        ]);

        if (saldosBancosRes.error) throw saldosBancosRes.error;
        if (saldosDiariosRes.error) throw saldosDiariosRes.error;
        if (receitasRes.error) throw receitasRes.error;
        if (pagamentosAreaRes.error) throw pagamentosAreaRes.error;
        if (pagamentosBancoRes.error) throw pagamentosBancoRes.error;

        const saldosBancos = (saldosBancosRes.data as SaldoBancoRow[]) ?? [];
        const saldosDiarios = saldosDiariosRes.data ?? [];
        const receitas = receitasRes.data ?? [];
        const pagamentosArea = pagamentosAreaRes.data ?? [];
        const pagamentosBanco = pagamentosBancoRes.data ?? [];

        // Identificar bancos únicos
        const bancosUnicos = Array.from(
          new Set(
            saldosBancos.map((item) => extrairNomeBanco(item.ban_bancos))
          )
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // Criar mapas por data
        const mapaSaldosBancosPorData = new Map<string, Map<string, number>>();
        saldosBancos.forEach((item) => {
          const nomeBanco = extrairNomeBanco(item.ban_bancos);
          if (!mapaSaldosBancosPorData.has(item.sdb_data)) {
            mapaSaldosBancosPorData.set(item.sdb_data, new Map());
          }
          const mapaBancos = mapaSaldosBancosPorData.get(item.sdb_data)!;
          mapaBancos.set(nomeBanco, Number(item.sdb_saldo ?? 0));
        });

        // Criar mapas de saldo inicial e final registrados
        const mapaSaldosIniciais = new Map<string, number>();
        const mapaSaldosFinais = new Map<string, number>();
        saldosDiarios.forEach((item: any) => {
          mapaSaldosIniciais.set(item.sdd_data, Number(item.sdd_saldo_inicial ?? 0));
          mapaSaldosFinais.set(item.sdd_data, Number(item.sdd_saldo_final ?? 0));
        });

        // Criar mapas de movimentação por data
        const mapaReceitasPorData = new Map<string, number>();
        const mapaAplicacoesPorData = new Map<string, number>();

        receitas.forEach((item: any) => {
          const data = item.rec_data;
          const valor = Number(item.rec_valor ?? 0);
          const contaNome = item.ctr_contas_receita?.ctr_nome || '';
          const contaNomeNorm = contaNome.toUpperCase().trim();

          const ehAplicacao = contaNomeNorm.includes('APLICACAO') || contaNomeNorm.includes('APLICAÇÃO');

          if (ehAplicacao) {
            // Aplicações: valores podem ser positivos (resgate) ou negativos (aplicação)
            // Como não temos o tipo, consideramos o valor como está
            mapaAplicacoesPorData.set(data, (mapaAplicacoesPorData.get(data) ?? 0) + valor);
          } else {
            mapaReceitasPorData.set(data, (mapaReceitasPorData.get(data) ?? 0) + valor);
          }
        });

        const mapaPagamentosAreaPorData = new Map<string, number>();
        pagamentosArea.forEach((item: any) => {
          const data = item.pag_data;
          const valor = Number(item.pag_valor ?? 0);
          mapaPagamentosAreaPorData.set(data, (mapaPagamentosAreaPorData.get(data) ?? 0) + valor);
        });

        const mapaPagamentosBancoPorData = new Map<string, number>();
        pagamentosBanco.forEach((item: any) => {
          const data = item.pbk_data;
          const valor = Number(item.pbk_valor ?? 0);
          mapaPagamentosBancoPorData.set(data, (mapaPagamentosBancoPorData.get(data) ?? 0) + valor);
        });

        // Gerar linhas de auditoria
        const datas = gerarIntervaloDatas(inicio, fim);
        const linhasCalculadas: AuditoriaLinha[] = [];
        let saldoFinalAnterior = mapaSaldosFinais.get(diaAnterior) ?? 0;

        datas.forEach((data) => {
          const saldosBancosDia = mapaSaldosBancosPorData.get(data);

          // Calcular saldo final do dia
          let saldoFinalDia = mapaSaldosFinais.get(data);

          // Se não houver saldo final registrado, calcular
          if (!saldoFinalDia || saldoFinalDia === 0) {
            const saldoInicial = mapaSaldosIniciais.get(data) ?? saldoFinalAnterior;
            const receitas = mapaReceitasPorData.get(data) ?? 0;
            const pagArea = mapaPagamentosAreaPorData.get(data) ?? 0;
            const pagBanco = mapaPagamentosBancoPorData.get(data) ?? 0;
            const aplicacoes = mapaAplicacoesPorData.get(data) ?? 0;

            saldoFinalDia = saldoInicial + receitas - pagArea - pagBanco + aplicacoes;
          }

          saldoFinalAnterior = saldoFinalDia;

          const saldosPorBanco: Record<string, number> = {};
          let totalSaldosBancos = 0;

          bancosUnicos.forEach((banco) => {
            const saldo = saldosBancosDia?.get(banco) ?? 0;
            saldosPorBanco[banco] = Number(saldo.toFixed(2));
            totalSaldosBancos += saldo;
          });

          totalSaldosBancos = Number(totalSaldosBancos.toFixed(2));
          const diferenca = Number((totalSaldosBancos - saldoFinalDia).toFixed(2));

          // Apenas incluir dias que possuem saldo bancário lançado
          if (saldosBancosDia?.size) {
            linhasCalculadas.push({
              data,
              saldosPorBanco,
              totalSaldosBancos,
              saldoFinalDia,
              diferenca,
            });
          }
        });

        setLinhas(linhasCalculadas.reverse()); // Mais recente primeiro
        setBancos(bancosUnicos);
      } catch (error) {
        console.error('Erro ao carregar auditoria de saldos diários:', error);
        setErro('Não foi possível carregar os dados de auditoria no momento.');
      } finally {
        setCarregando(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!periodoInicio || !periodoFim) return;
    carregarAuditoria(periodoInicio, periodoFim);
  }, [carregarAuditoria, periodoInicio, periodoFim]);

  const intervaloDatas = useMemo(
    () => gerarIntervaloDatas(periodoInicio, periodoFim),
    [periodoInicio, periodoFim]
  );

  const totaisResumo = useMemo(() => {
    if (!linhas.length) {
      return {
        diasComDado: 0,
        divergencias: 0,
        maiorDiferenca: 0,
      };
    }
    const divergencias = linhas.filter((linha) => Math.abs(linha.diferenca) > 0.01);
    const maiorDiferenca = divergencias.reduce(
      (acc, linha) =>
        Math.abs(linha.diferenca) > Math.abs(acc) ? linha.diferenca : acc,
      0
    );
    return {
      diasComDado: linhas.length,
      divergencias: divergencias.length,
      maiorDiferenca,
    };
  }, [linhas]);

  return (
    <>
      <Header
        title="Auditoria de Saldos Diários"
        subtitle="Compare a soma dos saldos dos bancos com o saldo final registrado no dia"
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
            <div className="text-sm text-gray-500">
              Intervalo: {intervaloDatas.length} dia(s)
            </div>
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
            <Loading text="Carregando auditoria de saldos..." />
          </div>
        ) : (
          <>
            <Card
              title="Resumo da Auditoria"
              subtitle="Indicadores do período analisado"
              variant="primary"
            >
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dias analisados
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {totaisResumo.diasComDado}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dias com divergência
                  </p>
                  <p className="text-2xl font-semibold text-error-600">
                    {totaisResumo.divergencias}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Maior diferença
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(Math.abs(totaisResumo.maiorDiferenca))}
                  </p>
                </div>
              </div>
            </Card>

            <Card
              title="Detalhamento por Dia"
              subtitle="Saldos dos bancos vs Saldo final do dia"
            >
              {linhas.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum dado encontrado para o período selecionado.
                </p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b-2 border-gray-300 bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">
                          Data
                        </th>
                        {bancos.map((banco) => (
                          <th
                            key={banco}
                            className="px-3 py-3 text-right font-semibold text-gray-700"
                          >
                            {banco}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-right font-semibold text-blue-700">
                          Total Saldos Bancos
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">
                          Saldo Final do Dia
                        </th>
                        <th className="px-3 py-3 text-right font-semibold text-error-700">
                          Diferença
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {linhas.map((linha) => {
                        const temDivergencia = Math.abs(linha.diferenca) > 0.01;
                        return (
                          <tr
                            key={linha.data}
                            className={
                              temDivergencia
                                ? 'bg-red-50 hover:bg-red-100'
                                : 'hover:bg-gray-50'
                            }
                          >
                            <td className="px-3 py-3 font-medium text-gray-900">
                              {formatarDataPt(linha.data)}
                            </td>
                            {bancos.map((banco) => (
                              <td
                                key={`${linha.data}-${banco}`}
                                className="px-3 py-3 text-right text-gray-700"
                              >
                                {formatCurrency(linha.saldosPorBanco[banco] ?? 0)}
                              </td>
                            ))}
                            <td className="px-3 py-3 text-right font-semibold text-blue-900">
                              {formatCurrency(linha.totalSaldosBancos)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-gray-900">
                              {formatCurrency(linha.saldoFinalDia)}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-bold ${
                                temDivergencia ? 'text-error-700' : 'text-gray-600'
                              }`}
                            >
                              {temDivergencia && '⚠️ '}
                              {formatCurrency(linha.diferenca)}
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

export default AuditoriaSaldosDiariosPage;
