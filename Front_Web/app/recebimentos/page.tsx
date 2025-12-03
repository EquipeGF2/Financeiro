'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout';
import { Button, Card, Loading } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { formatCurrency } from '@/lib/mathParser';

interface CobrancaRow {
  cob_id: number;
  cob_valor: number;
  cob_data: string;
  cob_ctr_id: number | null;
  cob_tpr_id: number | null;
  cob_ban_id: number | null;
  ctr_contas_receita:
    | { ctr_id: number; ctr_nome?: string | null; ctr_codigo?: string | null }
    | { ctr_id: number; ctr_nome?: string | null; ctr_codigo?: string | null }[]
    | null;
  tpr_tipos_receita:
    | { tpr_id: number; tpr_nome?: string | null; tpr_codigo?: string | null }
    | { tpr_id: number; tpr_nome?: string | null; tpr_codigo?: string | null }[]
    | null;
  ban_bancos:
    | { ban_nome?: string | null }
    | { ban_nome?: string | null }[]
    | null;
}

interface RecebimentoFormatado {
  id: number;
  valor: number;
  data: string;
  contaId: number | null;
  contaNome: string;
  contaCodigo: string;
  tipoId: number | null;
  tipoNome: string;
  tipoCodigo: string;
  bancoId: number | null;
  bancoNome: string;
  classificacaoConta: 'titulos' | 'depositos' | 'outros';
}

interface DadosGrafico {
  nome: string;
  valor: number;
}

interface ResumoAuditoria {
  totalCobranca: number;
  totalSaldoDiario: number;
  diferenca: number;
}

const extrairRelacao = <T,>(valor: T | T[] | null | undefined): T | null => {
  if (!valor) return null;
  return Array.isArray(valor) ? valor[0] ?? null : valor;
};

const normalizarTexto = (valor?: string | null) =>
  valor?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim() ?? '';

const classificarConta = (
  codigoConta: string,
  nomeConta: string,
): 'titulos' | 'depositos' | 'outros' => {
  const codigoLimpo = codigoConta.trim();
  const nomeNormalizado = normalizarTexto(nomeConta);

  if (codigoLimpo.startsWith('200') || nomeNormalizado.includes('TITULO')) {
    return 'titulos';
  }
  if (
    codigoLimpo.startsWith('201') ||
    nomeNormalizado.includes('DEPOSITO') ||
    nomeNormalizado.includes('DEPÓSITO') ||
    nomeNormalizado.includes('PIX')
  ) {
    return 'depositos';
  }
  return 'outros';
};

export default function RecebimentosPage() {
  const [carregando, setCarregando] = useState(true);
  const [recebimentos, setRecebimentos] = useState<RecebimentoFormatado[]>([]);
  const [resumoAuditoria, setResumoAuditoria] = useState<ResumoAuditoria>({
    totalCobranca: 0,
    totalSaldoDiario: 0,
    diferenca: 0,
  });

  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'titulos' | 'depositos'>('todos');

  useEffect(() => {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    const formatarData = (d: Date) => d.toISOString().split('T')[0];
    const inicio = formatarData(inicioMes);
    const fim = formatarData(fimMes);

    setPeriodoInicio(inicio);
    setPeriodoFim(fim);
    setFiltroInicio(inicio);
    setFiltroFim(fim);
  }, []);

  useEffect(() => {
    if (!periodoInicio || !periodoFim) return;

    const carregarReceitas = async () => {
      setCarregando(true);
      try {
        const supabase = getSupabaseClient();

        const [cobrancasRes, receitasSaldoRes] = await Promise.all([
          supabase
            .from('cob_cobrancas')
            .select(
              `
              cob_id,
              cob_valor,
              cob_data,
              cob_ctr_id,
              cob_tpr_id,
              cob_ban_id,
              ctr_contas_receita(ctr_id, ctr_nome, ctr_codigo),
              tpr_tipos_receita(tpr_id, tpr_nome, tpr_codigo),
              ban_bancos(ban_nome)
            `,
            )
            .gte('cob_data', periodoInicio)
            .lte('cob_data', periodoFim)
            .order('cob_data', { ascending: false }),
          supabase
            .from('rec_receitas')
            .select('rec_valor, rec_data, ctr_contas_receita(ctr_nome)')
            .gte('rec_data', periodoInicio)
            .lte('rec_data', periodoFim),
        ]);

        if (cobrancasRes.error) throw cobrancasRes.error;
        if (receitasSaldoRes.error) throw receitasSaldoRes.error;

        const cobrancas = (cobrancasRes.data as CobrancaRow[] | null) ?? [];
        const recebimentosFormatados: RecebimentoFormatado[] = cobrancas.map((item) => {
          const conta = extrairRelacao(item.ctr_contas_receita);
          const tipo = extrairRelacao(item.tpr_tipos_receita);
          const banco = extrairRelacao(item.ban_bancos);

          const contaCodigo = conta?.ctr_codigo ? String(conta.ctr_codigo) : '';
          const contaNome = conta?.ctr_nome ?? 'Conta não informada';

          return {
            id: item.cob_id,
            valor: Number(item.cob_valor ?? 0),
            data: item.cob_data,
            contaId: item.cob_ctr_id,
            contaNome,
            contaCodigo,
            tipoId: item.cob_tpr_id,
            tipoNome: tipo?.tpr_nome ?? 'Tipo não informado',
            tipoCodigo: tipo?.tpr_codigo ?? '',
            bancoId: item.cob_ban_id,
            bancoNome: banco?.ban_nome ?? 'Banco não informado',
            classificacaoConta: classificarConta(contaCodigo, contaNome),
          } satisfies RecebimentoFormatado;
        });

        const totalSaldoDiario = ((receitasSaldoRes.data as any[]) ?? []).reduce((acc, rec) => {
          const conta = extrairRelacao(rec.ctr_contas_receita);
          const contaNome = conta?.ctr_nome ?? '';
          const contaUpper = contaNome.toUpperCase().trim();

          if (contaUpper.includes('APLICACAO') || contaUpper.includes('APLICAÇÃO')) {
            return acc;
          }
          return acc + Number(rec.rec_valor ?? 0);
        }, 0);

        const totalCobranca = recebimentosFormatados.reduce((sum, r) => sum + r.valor, 0);

        setRecebimentos(recebimentosFormatados);
        setResumoAuditoria({
          totalCobranca,
          totalSaldoDiario,
          diferenca: Number((totalCobranca - totalSaldoDiario).toFixed(2)),
        });
      } catch (erro) {
        console.error('Erro ao carregar recebimentos:', erro);
        setRecebimentos([]);
        setResumoAuditoria({ totalCobranca: 0, totalSaldoDiario: 0, diferenca: 0 });
      } finally {
        setCarregando(false);
      }
    };

    void carregarReceitas();
  }, [periodoInicio, periodoFim]);

  const aplicarPeriodo = () => {
    if (!filtroInicio) return;
    setPeriodoInicio(filtroInicio);
    setPeriodoFim(filtroFim || filtroInicio);
  };

  const recebimentosFiltrados = useMemo(() => {
    return recebimentos.filter((rec) => {
      if (filtroTipo === 'titulos') {
        return rec.classificacaoConta === 'titulos';
      }
      if (filtroTipo === 'depositos') {
        return rec.classificacaoConta === 'depositos';
      }
      return true;
    });
  }, [filtroTipo, recebimentos]);

  const totalGeral = useMemo(() => {
    return recebimentosFiltrados.reduce((sum, r) => sum + r.valor, 0);
  }, [recebimentosFiltrados]);

  const dadosPorTipo = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    recebimentosFiltrados.forEach((rec) => {
      const chave = rec.tipoNome || 'Tipo não informado';
      mapa.set(chave, (mapa.get(chave) ?? 0) + rec.valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [recebimentosFiltrados]);

  const dadosGraficoContas = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    recebimentosFiltrados.forEach((rec) => {
      const conta = rec.contaNome || 'Conta não informada';
      mapa.set(conta, (mapa.get(conta) ?? 0) + rec.valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [recebimentosFiltrados]);

  const dadosGraficoBancos = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    recebimentosFiltrados.forEach((rec) => {
      const banco = rec.bancoNome || 'Banco não informado';
      mapa.set(banco, (mapa.get(banco) ?? 0) + rec.valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [recebimentosFiltrados]);

  const formatarData = (data: string) => {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const renderGraficoBarras = (dados: DadosGrafico[], titulo: string) => {
    const maxValor = Math.max(...dados.map((d) => d.valor), 1);

    return (
      <Card title={titulo}>
        <div className="space-y-3">
          {dados.length === 0 ? (
            <p className="py-4 text-center text-gray-500">Nenhum dado disponível</p>
          ) : (
            dados.map((item, idx) => (
              <div key={`${titulo}-${idx}`} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{item.nome}</span>
                  <span className="font-semibold text-success-700">{formatCurrency(item.valor)}</span>
                </div>
                <div className="h-6 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-gradient-to-r from-success-500 to-success-600 transition-all duration-500"
                    style={{ width: `${(item.valor / maxValor) * 100}%` }}
                  />
                </div>
                <div className="text-right text-xs text-gray-500">
                  {(totalGeral > 0 ? (item.valor / totalGeral) * 100 : 0).toFixed(1)}% do total
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <Header
        title="Recebimentos"
        subtitle="Análise detalhada das receitas lançadas na cobrança e na auditoria de saldo diário"
      />

      <div className="page-content space-y-6">
        <Card title="Período de Análise">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Data Início</label>
              <input
                type="date"
                value={filtroInicio}
                onChange={(e) => setFiltroInicio(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Data Fim</label>
              <input
                type="date"
                value={filtroFim}
                min={filtroInicio}
                onChange={(e) => setFiltroFim(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button variant="primary" onClick={aplicarPeriodo} disabled={!filtroInicio}>
              Aplicar período
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-gray-700">Filtrar por tipo (cob_ctr_id)</p>
            <div className="flex flex-wrap gap-2">
              {[
                { chave: 'todos', rotulo: 'Todos' },
                { chave: 'titulos', rotulo: 'Títulos' },
                { chave: 'depositos', rotulo: 'Depósitos' },
              ].map((opcao) => (
                <Button
                  key={opcao.chave}
                  size="sm"
                  variant={filtroTipo === opcao.chave ? 'primary' : 'ghost'}
                  onClick={() => setFiltroTipo(opcao.chave as typeof filtroTipo)}
                  className="whitespace-nowrap"
                >
                  {opcao.rotulo}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {carregando ? (
          <Card>
            <div className="py-6">
              <Loading text="Carregando receitas..." />
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Total de Recebimentos</h3>
                  <p className="text-3xl font-bold text-success-700">{formatCurrency(totalGeral)}</p>
                  <p className="text-xs text-gray-500">{recebimentosFiltrados.length} lançamento(s)</p>
                </div>
              </Card>

              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Receitas na cobrança</h3>
                  <p className="text-xl font-semibold text-gray-900">{formatCurrency(resumoAuditoria.totalCobranca)}</p>
                  <p className="text-xs text-gray-500">Período: {formatarData(periodoInicio)} a {formatarData(periodoFim)}</p>
                </div>
              </Card>

              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Receitas do saldo diário</h3>
                  <p className="text-xl font-semibold text-gray-900">{formatCurrency(resumoAuditoria.totalSaldoDiario)}</p>
                  <p className="text-xs text-gray-500">Conforme auditoria de receitas</p>
                </div>
              </Card>

              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Outros (diferença)</h3>
                  <p className="text-2xl font-bold text-blue-900">{formatCurrency(resumoAuditoria.diferenca)}</p>
                  <p className="text-xs text-gray-500">Cobrança - Saldo diário</p>
                </div>
              </Card>
            </div>

            <Card title="Recebimentos por Banco">
              {dadosGraficoBancos.length === 0 ? (
                <p className="py-4 text-center text-gray-500">Nenhum recebimento encontrado para os bancos.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {dadosGraficoBancos.map((banco) => (
                    <Card key={banco.nome}>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-700">{banco.nome}</p>
                        <p className="text-xl font-bold text-success-700">{formatCurrency(banco.valor)}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {renderGraficoBarras(dadosPorTipo, 'Recebimentos por Tipo de Conta (cob_tpr_id)')}
              {renderGraficoBarras(dadosGraficoContas, 'Recebimentos por Conta (cob_ctr_id)')}
            </div>
          </>
        )}
      </div>
    </>
  );
}
