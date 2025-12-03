'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Header } from '@/components/layout';
import { Button, Card, Loading } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { formatCurrency } from '@/lib/mathParser';

interface ReceitaDetalhada {
  rec_id: number;
  rec_valor: number;
  rec_data: string;
  rec_ctr_id: number;
  tipo_receita?: {
    tpr_id: number;
    tpr_nome: string;
    tpr_codigo: string;
  } | null;
  conta_receita?: {
    ctr_id: number;
    ctr_nome: string;
    ctr_codigo: string;
  } | null;
  banco?: {
    ban_id: number;
    ban_nome: string;
  } | null;
}

interface ResumoCategoria {
  categoria: string;
  total: number;
  percentual: number;
}

interface DadosGrafico {
  nome: string;
  valor: number;
}

export default function RecebimentosPage() {
  const [carregando, setCarregando] = useState(true);
  const [receitas, setReceitas] = useState<ReceitaDetalhada[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'titulos' | 'depositos'>('todos');

  useEffect(() => {
    // Define período padrão: mês atual
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

        const { data, error } = await supabase
          .from('rec_receitas')
          .select(`
            rec_id,
            rec_valor,
            rec_data,
            rec_ctr_id,
            ctr_contas_receita!rec_ctr_id (
              ctr_id,
              ctr_nome,
              ctr_codigo,
              ctr_ban_id
            )
          `)
          .gte('rec_data', periodoInicio)
          .lte('rec_data', periodoFim)
          .order('rec_data', { ascending: false });
        if (error) {
          console.error('Erro ao buscar:', error);
          throw error;
        }

        // Buscar bancos separadamente
        const bancosIds = new Set<number>();

        (data || []).forEach((rec: any) => {
          const conta = Array.isArray(rec.ctr_contas_receita)
            ? rec.ctr_contas_receita[0]
            : rec.ctr_contas_receita;
          if (conta?.ctr_ban_id) bancosIds.add(conta.ctr_ban_id);
        });

        // Buscar bancos
        const { data: bancosData } = await supabase
          .from('ban_bancos')
          .select('ban_id, ban_nome')
          .in('ban_id', Array.from(bancosIds));

        const bancosMap = new Map((bancosData || []).map((b: any) => [b.ban_id, b]));

        // Transformar dados para estrutura mais limpa
        const receitasFormatadas = (data || []).map((rec: any) => {
          const conta = Array.isArray(rec.ctr_contas_receita)
            ? rec.ctr_contas_receita[0]
            : rec.ctr_contas_receita;

          const banco = conta?.ctr_ban_id ? bancosMap.get(conta.ctr_ban_id) : null;

          return {
            rec_id: rec.rec_id,
            rec_valor: rec.rec_valor,
            rec_data: rec.rec_data,
            rec_ctr_id: rec.rec_ctr_id,
            conta_receita: conta ? {
              ctr_id: conta.ctr_id,
              ctr_nome: conta.ctr_nome,
              ctr_codigo: conta.ctr_codigo
            } : null,
            tipo_receita: null, // Temporariamente desabilitado até migration ser aplicada
            banco: banco ? {
              ban_id: banco.ban_id,
              ban_nome: banco.ban_nome
            } : null
          };
        });
        setReceitas(receitasFormatadas);
      } catch (erro) {
        console.error('Erro ao carregar receitas:', erro);
      } finally {
        setCarregando(false);
      }
    };

    carregarReceitas();
  }, [periodoInicio, periodoFim]);

  const aplicarPeriodo = () => {
    if (!filtroInicio) return;
    setPeriodoInicio(filtroInicio);
    setPeriodoFim(filtroFim || filtroInicio);
  };

  const normalizarTexto = (valor?: string | null) =>
    valor?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() ?? '';

  const receitasFiltradas = useMemo(() => {
    return receitas.filter((rec) => {
      const nomeConta = normalizarTexto(rec.conta_receita?.ctr_nome);
      const codigoConta = rec.conta_receita?.ctr_codigo ?? '';

      if (filtroTipo === 'titulos') {
        return (
          nomeConta.includes('titulo') ||
          nomeConta.includes('título') ||
          nomeConta.includes('boleto') ||
          codigoConta.startsWith('301')
        );
      }
      if (filtroTipo === 'depositos') {
        return (
          nomeConta.includes('deposito') ||
          nomeConta.includes('deposito') ||
          nomeConta.includes('pix') ||
          nomeConta.includes('transferencia') ||
          codigoConta.startsWith('302')
        );
      }
      return true;
    });
  }, [filtroTipo, receitas]);

  const totalGeral = useMemo(() => {
    return receitasFiltradas.reduce((sum, r) => sum + r.rec_valor, 0);
  }, [receitasFiltradas]);

  // Cards de resumo por categoria
  const resumoCategorias = useMemo((): ResumoCategoria[] => {
    const categorias = new Map<string, number>();

    receitasFiltradas.forEach(rec => {
      const conta = rec.conta_receita?.ctr_codigo || '';

      // Classificar por código de conta de receita
      if (conta.startsWith('301')) {
        categorias.set('Receita Prevista', (categorias.get('Receita Prevista') || 0) + rec.rec_valor);
      } else if (conta.startsWith('302')) {
        categorias.set('Atrasados', (categorias.get('Atrasados') || 0) + rec.rec_valor);
      } else if (conta.startsWith('303')) {
        categorias.set('Adiantados', (categorias.get('Adiantados') || 0) + rec.rec_valor);
      } else if (conta.startsWith('304')) {
        categorias.set('Exportação', (categorias.get('Exportação') || 0) + rec.rec_valor);
      } else {
        categorias.set('Outros', (categorias.get('Outros') || 0) + rec.rec_valor);
      }
    });

    return Array.from(categorias.entries()).map(([categoria, total]) => ({
      categoria,
      total,
      percentual: totalGeral > 0 ? (total / totalGeral) * 100 : 0
    }));
  }, [receitasFiltradas, totalGeral]);

  // Dados para gráfico evolução por banco
  const dadosGraficoBancos = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    receitasFiltradas.forEach(rec => {
      const banco = rec.banco?.ban_nome || 'Sem banco';
      mapa.set(banco, (mapa.get(banco) || 0) + rec.rec_valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [receitasFiltradas]);

  // Dados para gráfico por tipo de conta
  const dadosGraficoContas = useMemo((): DadosGrafico[] => {
    const mapa = new Map<string, number>();

    receitasFiltradas.forEach(rec => {
      const conta = rec.conta_receita?.ctr_nome || 'Sem conta';
      mapa.set(conta, (mapa.get(conta) || 0) + rec.rec_valor);
    });

    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [receitasFiltradas]);

  const dadosPorTipo = useMemo((): DadosGrafico[] => {
    return resumoCategorias
      .filter((cat) => cat.categoria !== 'Outros')
      .map((cat) => ({ nome: cat.categoria, valor: cat.total }))
      .sort((a, b) => b.valor - a.valor);
  }, [resumoCategorias]);

  // Dados para gráfico por tipo de receita (temporariamente desabilitado)
  // const dadosGraficoTipos = useMemo((): DadosGrafico[] => {
  //   const mapa = new Map<string, number>();
  //
  //   receitas.forEach(rec => {
  //     const tipo = rec.tipo_receita?.tpr_nome || 'Sem tipo';
  //     mapa.set(tipo, (mapa.get(tipo) || 0) + rec.rec_valor);
  //   });
  //
  //   return Array.from(mapa.entries())
  //     .map(([nome, valor]) => ({ nome, valor }))
  //     .sort((a, b) => b.valor - a.valor);
  // }, [receitas]);

  const formatarData = (data: string) => {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const renderGraficoBarras = (dados: DadosGrafico[], titulo: string) => {
    const maxValor = Math.max(...dados.map(d => d.valor), 1);

    return (
      <Card title={titulo}>
        <div className="space-y-3">
          {dados.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Nenhum dado disponível</p>
          ) : (
            dados.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{item.nome}</span>
                  <span className="font-semibold text-success-700">{formatCurrency(item.valor)}</span>
                </div>
                <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-success-500 to-success-600 transition-all duration-500"
                    style={{ width: `${(item.valor / maxValor) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 text-right">
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
        subtitle="Análise detalhada das receitas por tipo, conta e banco"
      />

      <div className="page-content space-y-6">
        {/* Filtros de período */}
        <Card title="Período de Análise">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Data Início
              </label>
              <input
                type="date"
                value={filtroInicio}
                onChange={(e) => setFiltroInicio(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Data Fim
              </label>
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
            <p className="text-sm font-medium text-gray-700">Filtrar por tipo de recebimento</p>
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
            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Total de Recebimentos</h3>
                  <p className="text-3xl font-bold text-success-700">{formatCurrency(totalGeral)}</p>
                  <p className="text-xs text-gray-500">{receitasFiltradas.length} recebimento(s)</p>
                </div>
              </Card>

              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Filtro de tipo</h3>
                  <p className="text-xl font-semibold text-gray-900 capitalize">
                    {filtroTipo === 'todos' ? 'Todos os tipos' : filtroTipo === 'titulos' ? 'Títulos' : 'Depósitos'}
                  </p>
                  <p className="text-xs text-gray-500">Período: {formatarData(periodoInicio)} a {formatarData(periodoFim)}</p>
                </div>
              </Card>

              <Card>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-600">Bancos com recebimentos</h3>
                  <p className="text-2xl font-bold text-gray-900">{dadosGraficoBancos.length}</p>
                  <p className="text-xs text-gray-500">
                    Maior volume: {dadosGraficoBancos[0] ? dadosGraficoBancos[0].nome : 'Sem dados'}
                  </p>
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
              {renderGraficoBarras(dadosPorTipo, 'Recebimentos por Tipo')}
              {renderGraficoBarras(dadosGraficoContas, 'Recebimentos por Conta')}
            </div>
          </>
        )}
      </div>
    </>
  );
}
