'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Card, Input, Loading } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient } from '@/lib/supabaseClient';

interface SaldoBancoRow {
  sdb_data: string;
  sdb_saldo: number;
  sdb_ban_id: number | null;
  ban_bancos: { ban_nome?: string | null } | { ban_nome?: string | null }[] | null;
}

interface BancoRow {
  ban_id: number;
  ban_nome: string;
  ban_saldo_inicial: number;
}

interface MovimentacaoDia {
  receitas: number;
  pagamentosArea: number;
  pagamentosBanco: number;
  saldoCalculado: number;
  saldoRegistrado: number;
  diferenca: number;
}

interface AuditoriaLinha {
  data: string;
  movimentacao: MovimentacaoDia;
  detalhesBancos: Record<string, {
    saldoRegistrado: number;
    saldoCalculado: number;
    diferenca: number;
  }>;
}

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const gerarIntervaloDatas = (inicio: string, fim: string): string[] => {
  if (!inicio) {
    return [];
  }
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

const extrairRelacao = <T,>(valor: T | T[] | null | undefined): T | null => {
  if (!valor) {
    return null;
  }
  return Array.isArray(valor) ? valor[0] ?? null : valor;
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

        // Buscar saldos de um dia antes do início para calcular saldo inicial
        const dataObj = new Date(inicio + 'T00:00:00');
        dataObj.setDate(dataObj.getDate() - 1);
        const inicioAnterior = dataObj.toISOString().split('T')[0];

        // Buscar todos os dados necessários
        const [bancosRes, saldosRes, receitasRes, pagamentosAreaRes, pagamentosBancoRes] = await Promise.all([
          supabase
            .from('ban_bancos')
            .select('ban_id, ban_nome, ban_saldo_inicial')
            .order('ban_nome', { ascending: true }),
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_data, sdb_saldo, sdb_ban_id, ban_bancos(ban_id, ban_nome)')
            .gte('sdb_data', inicioAnterior)
            .lte('sdb_data', fim)
            .order('sdb_data', { ascending: true }),
          supabase
            .from('rec_receitas')
            .select('rec_data, rec_valor, rec_ctr_id, ctr_contas_receita(ctr_ban_id)')
            .gte('rec_data', inicio)
            .lte('rec_data', fim),
          supabase
            .from('pag_pagamentos_area')
            .select('pag_data, pag_valor')
            .gte('pag_data', inicio)
            .lte('pag_data', fim),
          supabase
            .from('pbk_pagamentos_banco')
            .select('pbk_data, pbk_valor, pbk_ban_id')
            .gte('pbk_data', inicio)
            .lte('pbk_data', fim),
        ]);

        if (bancosRes.error) throw bancosRes.error;
        if (saldosRes.error) throw saldosRes.error;
        if (receitasRes.error) throw receitasRes.error;
        if (pagamentosAreaRes.error) throw pagamentosAreaRes.error;
        if (pagamentosBancoRes.error) throw pagamentosBancoRes.error;

        const bancos = (bancosRes.data as BancoRow[] | null) ?? [];
        const saldos = (saldosRes.data as any[] | null) ?? [];
        const receitas = receitasRes.data ?? [];
        const pagamentosArea = pagamentosAreaRes.data ?? [];
        const pagamentosBanco = pagamentosBancoRes.data ?? [];

        // Criar mapas de movimentação por data
        const mapaReceitasPorData = new Map<string, number>();
        const mapaReceitasPorBancoPorData = new Map<string, Map<number, number>>();

        receitas.forEach((item: any) => {
          const data = item.rec_data;
          const valor = Number(item.rec_valor ?? 0);
          mapaReceitasPorData.set(data, (mapaReceitasPorData.get(data) ?? 0) + valor);

          // Associar receita ao banco se a conta tiver banco vinculado
          const bancoId = item.ctr_contas_receita?.ctr_ban_id;
          if (bancoId) {
            if (!mapaReceitasPorBancoPorData.has(data)) {
              mapaReceitasPorBancoPorData.set(data, new Map());
            }
            const mapaBancos = mapaReceitasPorBancoPorData.get(data)!;
            mapaBancos.set(bancoId, (mapaBancos.get(bancoId) ?? 0) + valor);
          }
        });

        const mapaPagamentosAreaPorData = new Map<string, number>();
        pagamentosArea.forEach((item: any) => {
          const data = item.pag_data;
          const valor = Number(item.pag_valor ?? 0);
          mapaPagamentosAreaPorData.set(data, (mapaPagamentosAreaPorData.get(data) ?? 0) + valor);
        });

        const mapaPagamentosBancoPorData = new Map<string, number>();
        const mapaPagamentosPorBancoPorData = new Map<string, Map<number, number>>();

        pagamentosBanco.forEach((item: any) => {
          const data = item.pbk_data;
          const valor = Number(item.pbk_valor ?? 0);
          const bancoId = Number(item.pbk_ban_id);

          mapaPagamentosBancoPorData.set(data, (mapaPagamentosBancoPorData.get(data) ?? 0) + valor);

          if (!mapaPagamentosPorBancoPorData.has(data)) {
            mapaPagamentosPorBancoPorData.set(data, new Map());
          }
          const mapaBancos = mapaPagamentosPorBancoPorData.get(data)!;
          mapaBancos.set(bancoId, (mapaBancos.get(bancoId) ?? 0) + valor);
        });

        // Criar mapa de saldos registrados por banco e data
        const mapaSaldosRegistrados = new Map<string, Map<number, number>>();
        saldos.forEach((item: any) => {
          const data = item.sdb_data;
          const valor = Number(item.sdb_saldo ?? 0);
          const bancoId = Number(item.sdb_ban_id);

          if (!mapaSaldosRegistrados.has(data)) {
            mapaSaldosRegistrados.set(data, new Map());
          }
          mapaSaldosRegistrados.get(data)!.set(bancoId, valor);
        });

        // Calcular saldos dia a dia
        const datas = gerarIntervaloDatas(inicio, fim);
        const saldosCalculadosPorBanco = new Map<number, number>();

        // Inicializar com saldos do dia anterior ou saldo inicial
        bancos.forEach(banco => {
          const saldoDiaAnterior = mapaSaldosRegistrados.get(inicioAnterior)?.get(banco.ban_id);
          saldosCalculadosPorBanco.set(
            banco.ban_id,
            saldoDiaAnterior ?? Number(banco.ban_saldo_inicial ?? 0)
          );
        });

        const linhasCalculadas: AuditoriaLinha[] = [];
        const bancosNomes = new Set<string>();

        datas.forEach(data => {
          const receitasDia = mapaReceitasPorData.get(data) ?? 0;
          const pagamentosAreaDia = mapaPagamentosAreaPorData.get(data) ?? 0;
          const pagamentosBancoDia = mapaPagamentosBancoPorData.get(data) ?? 0;

          const receitasPorBanco = mapaReceitasPorBancoPorData.get(data);
          const pagamentosPorBanco = mapaPagamentosPorBancoPorData.get(data);
          const saldosRegistradosDia = mapaSaldosRegistrados.get(data);

          const detalhesBancos: Record<string, {
            saldoRegistrado: number;
            saldoCalculado: number;
            diferenca: number;
          }> = {};

          let totalSaldoCalculado = 0;
          let totalSaldoRegistrado = 0;
          let temDados = false;

          bancos.forEach(banco => {
            bancosNomes.add(banco.ban_nome);

            // Calcular movimentação do banco no dia
            const receitasBanco = receitasPorBanco?.get(banco.ban_id) ?? 0;
            const pagamentosBanco = pagamentosPorBanco?.get(banco.ban_id) ?? 0;

            // Atualizar saldo calculado
            const saldoAnterior = saldosCalculadosPorBanco.get(banco.ban_id) ?? 0;
            const saldoCalculado = saldoAnterior + receitasBanco - pagamentosBanco;
            saldosCalculadosPorBanco.set(banco.ban_id, saldoCalculado);

            // Buscar saldo registrado
            const saldoRegistrado = saldosRegistradosDia?.get(banco.ban_id) ?? 0;

            if (saldoRegistrado !== 0 || saldoCalculado !== 0) {
              temDados = true;
            }

            const diferenca = Number((saldoRegistrado - saldoCalculado).toFixed(2));

            detalhesBancos[banco.ban_nome] = {
              saldoRegistrado: Number(saldoRegistrado.toFixed(2)),
              saldoCalculado: Number(saldoCalculado.toFixed(2)),
              diferenca
            };

            totalSaldoCalculado += saldoCalculado;
            totalSaldoRegistrado += saldoRegistrado;
          });

          if (temDados || receitasDia > 0 || pagamentosAreaDia > 0 || pagamentosBancoDia > 0) {
            linhasCalculadas.push({
              data,
              movimentacao: {
                receitas: Number(receitasDia.toFixed(2)),
                pagamentosArea: Number(pagamentosAreaDia.toFixed(2)),
                pagamentosBanco: Number(pagamentosBancoDia.toFixed(2)),
                saldoCalculado: Number(totalSaldoCalculado.toFixed(2)),
                saldoRegistrado: Number(totalSaldoRegistrado.toFixed(2)),
                diferenca: Number((totalSaldoRegistrado - totalSaldoCalculado).toFixed(2))
              },
              detalhesBancos
            });
          }
        });

        setLinhas(linhasCalculadas.reverse()); // Mais recente primeiro
        setBancos(Array.from(bancosNomes).sort((a, b) => a.localeCompare(b, 'pt-BR')));
      } catch (error) {
        console.error('Erro ao carregar auditoria de saldos diários:', error);
        setErro('Não foi possível carregar os dados de auditoria no momento.');
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!periodoInicio || !periodoFim) {
      return;
    }
    carregarAuditoria(periodoInicio, periodoFim);
  }, [carregarAuditoria, periodoInicio, periodoFim]);

  const intervaloDatas = useMemo(
    () => gerarIntervaloDatas(periodoInicio, periodoFim),
    [periodoInicio, periodoFim],
  );

  const totaisResumo = useMemo(() => {
    if (!linhas.length) {
      return {
        diasComDado: 0,
        divergencias: 0,
        maiorDiferenca: 0,
        totalReceitas: 0,
        totalPagamentosArea: 0,
        totalPagamentosBanco: 0
      };
    }
    const divergencias = linhas.filter((linha) => Math.abs(linha.movimentacao.diferenca) > 0.01);
    const maiorDiferenca = divergencias.reduce(
      (acc, linha) => (Math.abs(linha.movimentacao.diferenca) > Math.abs(acc) ? linha.movimentacao.diferenca : acc),
      0,
    );

    const totalReceitas = linhas.reduce((acc, linha) => acc + linha.movimentacao.receitas, 0);
    const totalPagamentosArea = linhas.reduce((acc, linha) => acc + linha.movimentacao.pagamentosArea, 0);
    const totalPagamentosBanco = linhas.reduce((acc, linha) => acc + linha.movimentacao.pagamentosBanco, 0);

    return {
      diasComDado: linhas.length,
      divergencias: divergencias.length,
      maiorDiferenca,
      totalReceitas,
      totalPagamentosArea,
      totalPagamentosBanco
    };
  }, [linhas]);

  return (
    <>
      <Header
        title="Auditoria de Saldos Diários"
        subtitle="Compare os saldos registrados nos bancos com o saldo final informado na previsão diária"
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
              Intervalo com {intervaloDatas.length} dia(s)
            </div>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível carregar a auditoria">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregando ? (
          <div className="flex justify-center py-12">
            <Loading text="Compilando saldos por banco..." />
          </div>
        ) : (
          <>
            <Card
              title="Resumo da Auditoria"
              subtitle="Indicadores do período analisado"
              variant="primary"
            >
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dias analisados
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{totaisResumo.diasComDado}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dias com divergência
                  </p>
                  <p className="text-2xl font-semibold text-error-600">{totaisResumo.divergencias}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Maior diferença
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(Math.abs(totaisResumo.maiorDiferenca))}
                  </p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                    Total Receitas
                  </p>
                  <p className="text-2xl font-semibold text-green-900">
                    {formatCurrency(totaisResumo.totalReceitas)}
                  </p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                    Pagamentos Área
                  </p>
                  <p className="text-2xl font-semibold text-red-900">
                    {formatCurrency(totaisResumo.totalPagamentosArea)}
                  </p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                    Pagamentos Banco
                  </p>
                  <p className="text-2xl font-semibold text-red-900">
                    {formatCurrency(totaisResumo.totalPagamentosBanco)}
                  </p>
                </div>
              </div>
            </Card>

            <Card
              title="Movimentação Diária"
              subtitle="Receitas, pagamentos e comparação de saldos por dia"
            >
              {linhas.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhuma movimentação encontrada para o período selecionado.
                </p>
              ) : (
                <div className="space-y-6">
                  {linhas.map((linha) => {
                    const temDivergencia = Math.abs(linha.movimentacao.diferenca) > 0.01;
                    return (
                      <div
                        key={linha.data}
                        className={`rounded-lg border-2 p-4 ${
                          temDivergencia ? 'border-red-300 bg-red-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {formatarDataPt(linha.data)}
                          </h3>
                          {temDivergencia && (
                            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                              DIVERGÊNCIA
                            </span>
                          )}
                        </div>

                        {/* Movimentação do dia */}
                        <div className="mb-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded bg-green-100 p-3">
                            <p className="text-xs font-medium text-green-700">Receitas</p>
                            <p className="text-lg font-semibold text-green-900">
                              {formatCurrency(linha.movimentacao.receitas)}
                            </p>
                          </div>
                          <div className="rounded bg-red-100 p-3">
                            <p className="text-xs font-medium text-red-700">Pagamentos Área</p>
                            <p className="text-lg font-semibold text-red-900">
                              {formatCurrency(linha.movimentacao.pagamentosArea)}
                            </p>
                          </div>
                          <div className="rounded bg-red-100 p-3">
                            <p className="text-xs font-medium text-red-700">Pagamentos Banco</p>
                            <p className="text-lg font-semibold text-red-900">
                              {formatCurrency(linha.movimentacao.pagamentosBanco)}
                            </p>
                          </div>
                        </div>

                        {/* Saldos totais */}
                        <div className="mb-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded bg-blue-100 p-3">
                            <p className="text-xs font-medium text-blue-700">Saldo Calculado</p>
                            <p className="text-lg font-semibold text-blue-900">
                              {formatCurrency(linha.movimentacao.saldoCalculado)}
                            </p>
                          </div>
                          <div className="rounded bg-gray-100 p-3">
                            <p className="text-xs font-medium text-gray-700">Saldo Registrado</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {formatCurrency(linha.movimentacao.saldoRegistrado)}
                            </p>
                          </div>
                          <div
                            className={`rounded p-3 ${
                              temDivergencia ? 'bg-red-200' : 'bg-gray-100'
                            }`}
                          >
                            <p
                              className={`text-xs font-medium ${
                                temDivergencia ? 'text-red-700' : 'text-gray-700'
                              }`}
                            >
                              Diferença
                            </p>
                            <p
                              className={`text-lg font-semibold ${
                                temDivergencia ? 'text-red-900' : 'text-gray-900'
                              }`}
                            >
                              {formatCurrency(linha.movimentacao.diferenca)}
                            </p>
                          </div>
                        </div>

                        {/* Detalhamento por banco */}
                        {bancos.length > 0 && (
                          <div className="overflow-auto">
                            <table className="min-w-full text-sm">
                              <thead className="border-b border-gray-300 bg-gray-100">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">
                                    Banco
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">
                                    Saldo Calculado
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">
                                    Saldo Registrado
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">
                                    Diferença
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {bancos.map((banco) => {
                                  const detalhes = linha.detalhesBancos[banco];
                                  if (!detalhes) return null;
                                  const temDivergenciaBanco = Math.abs(detalhes.diferenca) > 0.01;
                                  return (
                                    <tr
                                      key={banco}
                                      className={temDivergenciaBanco ? 'bg-red-100' : ''}
                                    >
                                      <td className="px-3 py-2 font-medium text-gray-900">
                                        {banco}
                                      </td>
                                      <td className="px-3 py-2 text-right text-blue-900">
                                        {formatCurrency(detalhes.saldoCalculado)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-900">
                                        {formatCurrency(detalhes.saldoRegistrado)}
                                      </td>
                                      <td
                                        className={`px-3 py-2 text-right font-semibold ${
                                          temDivergenciaBanco
                                            ? 'text-red-700'
                                            : 'text-gray-600'
                                        }`}
                                      >
                                        {formatCurrency(detalhes.diferenca)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
