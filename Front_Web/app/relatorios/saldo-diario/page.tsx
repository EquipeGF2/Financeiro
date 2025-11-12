'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const formatarDataPt = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

type MaybeArray<T> = T | T[] | null | undefined;

type PrevisaoRow = {
  pvi_tipo?: unknown;
  pvi_categoria?: unknown;
  pvi_valor?: unknown;
  pvi_are_id?: unknown;
  pvi_ctr_id?: unknown;
  pvi_ban_id?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_nome?: unknown } | null>;
};

type PagamentoAreaRow = {
  pag_valor?: unknown;
  pag_are_id?: unknown;
  are_areas?: MaybeArray<{ are_nome?: unknown } | null>;
};

type ReceitaRow = {
  rec_valor?: unknown;
  rec_ctr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
};

type SaldoBancoRow = {
  sdb_saldo?: unknown;
  sdb_ban_id?: unknown;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
};

type CategoriaReceita = 'depositos' | 'titulos' | 'outras';

type LinhaComparativa = {
  chave: string;
  titulo: string;
  previsto: number;
  realizado: number;
  desvio: number;
  percentual: number | null;
};

type LinhaBanco = {
  chave: string;
  titulo: string;
  realizado: number;
};

type TabelaAccent = 'azul' | 'verde' | 'amarelo' | 'laranja' | 'cinza';

type RenderTabelaOptions = {
  accent?: TabelaAccent;
  totalLabel?: string;
  showTotals?: boolean;
};

type RelatorioSaldoDiario = {
  data: string;
  gastos: LinhaComparativa[];
  receitas: LinhaComparativa[];
  bancos: LinhaBanco[];
  resumo: {
    saldoInicialPrevisto: number;
    saldoInicialRealizado: number;
    totalReceitasPrevistas: number;
    totalReceitasRealizadas: number;
    totalDespesasPrevistas: number;
    totalDespesasRealizadas: number;
    resultadoPrevisto: number;
    resultadoRealizado: number;
    saldoFinalPrevisto: number;
    saldoFinalRealizado: number;
    bancosRealizados: number;
  };
};

const normalizeRelation = <T,>(value: MaybeArray<T>): Exclude<T, null | undefined>[] => {
  if (!value) {
    return [];
  }
  const arrayValue = Array.isArray(value) ? value : [value];
  return arrayValue.filter((item): item is Exclude<T, null | undefined> => item != null);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
};

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

const obterCategoriaReceita = (codigo: string | null | undefined): CategoriaReceita => {
  if (!codigo) {
    return 'outras';
  }
  const normalizado = codigo.trim();
  if (normalizado.startsWith('200')) return 'titulos';
  if (normalizado.startsWith('201')) return 'depositos';
  if (normalizado.startsWith('202')) return 'outras';
  return 'outras';
};

const categoriaRotulos: Record<CategoriaReceita, string> = {
  depositos: 'Receitas - Depósitos e PIX',
  titulos: 'Receitas - Títulos (Boletos)',
  outras: 'Receitas - Outras Entradas',
};

const tabelaAccentClassNames: Record<TabelaAccent, string> = {
  azul: 'report-section report-section--azul',
  verde: 'report-section report-section--verde',
  amarelo: 'report-section report-section--amarelo',
  laranja: 'report-section report-section--laranja',
  cinza: 'report-section report-section--cinza',
};

const calcularPercentual = (previsto: number, realizado: number): number | null => {
  if (Math.abs(previsto) < 0.0001) {
    return null;
  }
  return ((realizado - previsto) / previsto) * 100;
};

const formatarPercentual = (valor: number | null): string => {
  if (valor === null || Number.isNaN(valor)) {
    return '—';
  }
  const arredondado = Math.round(valor * 10) / 10;
  return `${arredondado.toFixed(1).replace('.', ',')}%`;
};

const converterMapaParaLinhas = (
  mapa: Map<string, { titulo: string; previsto: number; realizado: number }>,
): LinhaComparativa[] =>
  Array.from(mapa.entries())
    .map(([chave, valor]) => {
      const previsto = arredondar(valor.previsto);
      const realizado = arredondar(valor.realizado);
      const desvio = arredondar(realizado - previsto);
      const percentual = calcularPercentual(previsto, realizado);
      return {
        chave,
        titulo: valor.titulo,
        previsto,
        realizado,
        desvio,
        percentual,
      };
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));

const converterMapaParaBancos = (
  mapa: Map<string, { titulo: string; realizado: number }>,
): LinhaBanco[] =>
  Array.from(mapa.entries())
    .map(([chave, valor]) => ({
      chave,
      titulo: valor.titulo,
      realizado: arredondar(valor.realizado),
    }))
    .sort((a, b) => b.realizado - a.realizado || a.titulo.localeCompare(b.titulo, 'pt-BR'));

const somarPrevisto = (linhas: LinhaComparativa[]): number =>
  arredondar(linhas.reduce((total, linha) => total + linha.previsto, 0));

const somarRealizado = (linhas: LinhaComparativa[]): number =>
  arredondar(linhas.reduce((total, linha) => total + linha.realizado, 0));

const somarRealizadoBancos = (linhas: LinhaBanco[]): number =>
  arredondar(linhas.reduce((total, linha) => total + linha.realizado, 0));

const montarLinhasResultadoCaixa = (resumo: RelatorioSaldoDiario['resumo']): LinhaComparativa[] => [
  {
    chave: 'total-receitas',
    titulo: 'Total de Receitas',
    previsto: resumo.totalReceitasPrevistas,
    realizado: resumo.totalReceitasRealizadas,
    desvio: arredondar(resumo.totalReceitasRealizadas - resumo.totalReceitasPrevistas),
    percentual: calcularPercentual(resumo.totalReceitasPrevistas, resumo.totalReceitasRealizadas),
  },
  {
    chave: 'total-despesas',
    titulo: 'Total de Despesas',
    previsto: resumo.totalDespesasPrevistas,
    realizado: resumo.totalDespesasRealizadas,
    desvio: arredondar(resumo.totalDespesasRealizadas - resumo.totalDespesasPrevistas),
    percentual: calcularPercentual(resumo.totalDespesasPrevistas, resumo.totalDespesasRealizadas),
  },
  {
    chave: 'resultado-dia',
    titulo: 'Saldo Operacional do Dia',
    previsto: resumo.resultadoPrevisto,
    realizado: resumo.resultadoRealizado,
    desvio: arredondar(resumo.resultadoRealizado - resumo.resultadoPrevisto),
    percentual: calcularPercentual(resumo.resultadoPrevisto, resumo.resultadoRealizado),
  },
];

const montarLinhasResumoGeral = (resumo: RelatorioSaldoDiario['resumo']): LinhaComparativa[] => [
  {
    chave: 'saldo-anterior',
    titulo: 'Saldo do Dia Anterior',
    previsto: resumo.saldoInicialPrevisto,
    realizado: resumo.saldoInicialRealizado,
    desvio: arredondar(resumo.saldoInicialRealizado - resumo.saldoInicialPrevisto),
    percentual: calcularPercentual(resumo.saldoInicialPrevisto, resumo.saldoInicialRealizado),
  },
  {
    chave: 'resultado',
    titulo: 'Resultado do Dia (Receitas - Despesas)',
    previsto: resumo.resultadoPrevisto,
    realizado: resumo.resultadoRealizado,
    desvio: arredondar(resumo.resultadoRealizado - resumo.resultadoPrevisto),
    percentual: calcularPercentual(resumo.resultadoPrevisto, resumo.resultadoRealizado),
  },
  {
    chave: 'saldo-final',
    titulo: 'Saldo Final do Dia',
    previsto: resumo.saldoFinalPrevisto,
    realizado: resumo.saldoFinalRealizado,
    desvio: arredondar(resumo.saldoFinalRealizado - resumo.saldoFinalPrevisto),
    percentual: calcularPercentual(resumo.saldoFinalPrevisto, resumo.saldoFinalRealizado),
  },
];

const renderTabelaComparativa = (
  titulo: string,
  linhas: LinhaComparativa[],
  options: RenderTabelaOptions = {},
) => {
  const totalPrevisto = somarPrevisto(linhas);
  const totalRealizado = somarRealizado(linhas);
  const totalDesvio = arredondar(totalRealizado - totalPrevisto);
  const totalPercentual = calcularPercentual(totalPrevisto, totalRealizado);

  const accent = options.accent ?? 'azul';
  const totalLabel = options.totalLabel ?? 'Totais';
  const showTotals = options.showTotals ?? true;
  const sectionClass = tabelaAccentClassNames[accent] ?? tabelaAccentClassNames.azul;

  return (
    <div className={sectionClass}>
      <div className="report-section__header">
        <span>{titulo}</span>
      </div>
      <table className="report-section__table">
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Previsto</th>
            <th>Realizado</th>
            <th>Desvio</th>
            <th>% Desvio</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={5} className="report-section__empty-cell">
                Nenhuma informação encontrada para esta seção.
              </td>
            </tr>
          ) : (
            linhas.map((linha) => (
              <tr key={linha.chave}>
                <td>{linha.titulo}</td>
                <td>{formatCurrency(linha.previsto)}</td>
                <td>{formatCurrency(linha.realizado)}</td>
                <td className={linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
                  {formatCurrency(linha.desvio)}
                </td>
                <td>{formatarPercentual(linha.percentual)}</td>
              </tr>
            ))
          )}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr>
              <td>{totalLabel}</td>
              <td>{formatCurrency(totalPrevisto)}</td>
              <td>{formatCurrency(totalRealizado)}</td>
              <td className={totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
                {formatCurrency(totalDesvio)}
              </td>
              <td>{formatarPercentual(totalPercentual)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

const renderTabelaBancos = (titulo: string, linhas: LinhaBanco[]) => {
  const totalRealizado = somarRealizadoBancos(linhas);

  return (
    <div className="report-section report-section--cinza">
      <div className="report-section__header">
        <span>{titulo}</span>
      </div>
      <table className="report-section__table report-section__table--compact">
        <thead>
          <tr>
            <th>Banco</th>
            <th>Realizado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={2} className="report-section__empty-cell">
                Nenhum saldo bancário informado.
              </td>
            </tr>
          ) : (
            linhas.map((linha) => (
              <tr key={linha.chave}>
                <td>{linha.titulo}</td>
                <td>{formatCurrency(linha.realizado)}</td>
              </tr>
            ))
          )}
        </tbody>
        {linhas.length > 0 && (
          <tfoot>
            <tr>
              <td>Total em bancos</td>
              <td>{formatCurrency(totalRealizado)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};
const RelatorioSaldoDiarioPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioSaldoDiario | null>(null);
  const [dataReferencia, setDataReferencia] = useState(() => toISODate(new Date()));
  const [emailModalAberto, setEmailModalAberto] = useState(false);
  const [emailDestino, setEmailDestino] = useState('');
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const carregarUsuario = useCallback(async () => {
    try {
      setCarregandoUsuario(true);
      const supabase = getSupabaseClient();
      const { userId, userName, userEmail } = getUserSession();
      const { data, error } = await getOrCreateUser(
        supabase,
        userId,
        userName ?? undefined,
        userEmail ?? undefined,
      );
      if (error) throw error;
      if (!data) {
        setErro('Não foi possível identificar o usuário autenticado.');
        return;
      }
      setUsuario(data);
      setErro(null);
    } catch (error) {
      console.error('Erro ao carregar usuário para o relatório de saldo diário:', error);
      setErro(
        traduzirErroSupabase(
          error,
          'Não foi possível carregar as informações iniciais. Tente novamente mais tarde.',
        ),
      );
    } finally {
      setCarregandoUsuario(false);
    }
  }, []);

  useEffect(() => {
    carregarUsuario();
  }, [carregarUsuario]);

  const carregarRelatorio = useCallback(
    async (_usuarioAtual: UsuarioRow, data: string) => {
      try {
        setCarregandoDados(true);
        const supabase = getSupabaseClient();

        const [previsoesRes, gastosRes, receitasRes, saldosRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_tipo, pvi_categoria, pvi_valor, pvi_are_id, pvi_ctr_id, pvi_ban_id, are_areas(are_nome), ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome), tpr_tipos_receita(tpr_nome)',
            )
            .eq('pvi_data', data),
          supabase
            .from('pag_pagamentos_area')
            .select('pag_valor, pag_are_id, are_areas(are_nome)')
            .eq('pag_data', data),
          supabase
            .from('rec_receitas')
            .select('rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome, ctr_codigo)')
            .eq('rec_data', data),
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_saldo, sdb_ban_id, ban_bancos(ban_nome)')
            .eq('sdb_data', data),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (gastosRes.error) throw gastosRes.error;
        if (receitasRes.error) throw receitasRes.error;
        if (saldosRes.error) throw saldosRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const pagamentosArea = (gastosRes.data as MaybeArray<PagamentoAreaRow>) ?? [];
        const receitas = (receitasRes.data as MaybeArray<ReceitaRow>) ?? [];
        const saldosBancarios = (saldosRes.data as MaybeArray<SaldoBancoRow>) ?? [];

        const mapaGastos = new Map<string, { titulo: string; previsto: number; realizado: number }>();
        const mapaReceitas = new Map<string, { titulo: string; previsto: number; realizado: number }>();
        const mapaBancosRealizados = new Map<string, { titulo: string; realizado: number }>();

        let saldoInicialPrevisto = 0;
        let saldoFinalPrevisto = 0;

        previsoes.forEach((item) => {
          const tipo = toString((item as PrevisaoRow).pvi_tipo).toLowerCase();
          const valor = arredondar(toNumber((item as PrevisaoRow).pvi_valor));
          const areaRel = normalizeRelation((item as PrevisaoRow).are_areas)[0];
          const contaRel = normalizeRelation((item as PrevisaoRow).ctr_contas_receita)[0];
          const bancoRel = normalizeRelation((item as PrevisaoRow).ban_bancos)[0];

          if (tipo === 'gasto') {
            const areaId = toString((item as PrevisaoRow).pvi_are_id, 'sem-area');
            const titulo = areaRel?.are_nome
              ? toString(areaRel.are_nome)
              : toString((item as PrevisaoRow).pvi_categoria, 'Área não informada');
            const chave = `${areaId}-${titulo.toLowerCase()}`;
            const existente = mapaGastos.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
            existente.previsto += valor;
            mapaGastos.set(chave, existente);
          }

          if (tipo === 'receita') {
            const codigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : null;
            const categoria = obterCategoriaReceita(codigo);
            const titulo = categoriaRotulos[categoria];
            const chave = categoria;
            const existente = mapaReceitas.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
            existente.previsto += valor;
            mapaReceitas.set(chave, existente);

            if ((item as PrevisaoRow).pvi_ban_id !== null && (item as PrevisaoRow).pvi_ban_id !== undefined) {
              const bancoRelTitulo = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
              const bancoChave = `${toString((item as PrevisaoRow).pvi_ban_id, 'sem-banco')}-${bancoRelTitulo.toLowerCase()}`;
              const existenteBanco = mapaBancosRealizados.get(bancoChave) ?? { titulo: bancoRelTitulo, realizado: 0 };
              mapaBancosRealizados.set(bancoChave, existenteBanco);
            }
          }

          if (tipo === 'saldo_inicial') {
            saldoInicialPrevisto += valor;
          }

          if (tipo === 'saldo_acumulado') {
            saldoFinalPrevisto = valor;
          }
        });

        normalizeRelation(pagamentosArea).forEach((item) => {
          const areaId = toString(item.pag_are_id, 'sem-area');
          const areaRel = normalizeRelation(item.are_areas)[0];
          const titulo = areaRel?.are_nome ? toString(areaRel.are_nome) : 'Área não informada';
          const chave = `${areaId}-${titulo.toLowerCase()}`;
          const existente = mapaGastos.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.pag_valor));
          mapaGastos.set(chave, existente);
        });

        normalizeRelation(receitas).forEach((item) => {
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const codigo = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : null;
          const categoria = obterCategoriaReceita(codigo);
          const titulo = categoriaRotulos[categoria];
          const chave = categoria;
          const existente = mapaReceitas.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.rec_valor));
          mapaReceitas.set(chave, existente);
        });

        normalizeRelation(saldosBancarios).forEach((item) => {
          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const bancoTitulo = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          const bancoId = toString(item.sdb_ban_id, 'sem-banco');
          const chave = `${bancoId}-${bancoTitulo.toLowerCase()}`;
          const existente = mapaBancosRealizados.get(chave) ?? { titulo: bancoTitulo, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.sdb_saldo));
          mapaBancosRealizados.set(chave, existente);
        });

        const gastos = converterMapaParaLinhas(mapaGastos);
        const receitasComparativo = converterMapaParaLinhas(mapaReceitas);
        const bancos = converterMapaParaBancos(mapaBancosRealizados);

        const totalDespesasPrevistas = somarPrevisto(gastos);
        const totalDespesasRealizadas = somarRealizado(gastos);
        const totalReceitasPrevistas = somarPrevisto(receitasComparativo);
        const totalReceitasRealizadas = somarRealizado(receitasComparativo);
        const totalBancosRealizados = somarRealizadoBancos(bancos);

        const resultadoPrevisto = arredondar(totalReceitasPrevistas - totalDespesasPrevistas);
        const resultadoRealizado = arredondar(totalReceitasRealizadas - totalDespesasRealizadas);

        if (saldoFinalPrevisto === 0) {
          saldoFinalPrevisto = arredondar(saldoInicialPrevisto + resultadoPrevisto);
        }

        const saldoFinalRealizado = arredondar(totalBancosRealizados);
        const saldoInicialRealizado = arredondar(saldoFinalRealizado - resultadoRealizado);

        setRelatorio({
          data,
          gastos,
          receitas: receitasComparativo,
          bancos,
          resumo: {
            saldoInicialPrevisto: arredondar(saldoInicialPrevisto),
            saldoInicialRealizado,
            totalReceitasPrevistas,
            totalReceitasRealizadas,
            totalDespesasPrevistas,
            totalDespesasRealizadas,
            resultadoPrevisto,
            resultadoRealizado,
            saldoFinalPrevisto,
            saldoFinalRealizado,
            bancosRealizados: totalBancosRealizados,
          },
        });
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar relatório de saldo diário:', error);
        setRelatorio(null);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível carregar o relatório de saldo diário para a data selecionada.',
          ),
        );
      } finally {
        setCarregandoDados(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!usuario) {
      return;
    }
    carregarRelatorio(usuario, dataReferencia);
  }, [usuario, dataReferencia, carregarRelatorio]);

  const linhasResultadoCaixa = useMemo(() => {
    if (!relatorio) {
      return [];
    }
    return montarLinhasResultadoCaixa(relatorio.resumo);
  }, [relatorio]);

  const linhasResumoGeral = useMemo(() => {
    if (!relatorio) {
      return [];
    }
    return montarLinhasResumoGeral(relatorio.resumo);
  }, [relatorio]);

  const nomeArquivoPdf = useMemo(() => {
    if (!relatorio) {
      return 'Relatorio_Saldo_Diario.pdf';
    }
    return `Relatorio_Saldo_Diario_${relatorio.data}.pdf`;
  }, [relatorio]);
  const gerarDocumentoPdf = useCallback(() => {
    if (!relatorio) {
      return null;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('Saldo Diário', 14, 18);
    doc.setFontSize(11);
    doc.text(`Data de referência: ${formatarDataPt(relatorio.data)}`, 14, 26);

    let yPos = 32;

    const adicionarSecao = (titulo: string) => {
      doc.setFontSize(12);
      doc.setTextColor(31, 73, 125);
      doc.text(titulo, 14, yPos);
      yPos += 4;
    };

    const gerarTabelaComparativaPdf = (
      titulo: string,
      linhas: LinhaComparativa[],
      totalLabel: string,
      mostrarPercentual = true,
    ) => {
      adicionarSecao(titulo);
      const totalPrevisto = somarPrevisto(linhas);
      const totalRealizado = somarRealizado(linhas);
      const totalDesvio = arredondar(totalRealizado - totalPrevisto);
      const totalPercentual = calcularPercentual(totalPrevisto, totalRealizado);

      autoTable(doc, {
        startY: yPos,
        head: [
          mostrarPercentual
            ? ['Categoria', 'Previsto', 'Realizado', 'Desvio', '% Desvio']
            : ['Categoria', 'Previsto', 'Realizado', 'Desvio'],
        ],
        body: linhas.map((linha) => (
          mostrarPercentual
            ? [
                linha.titulo,
                formatCurrency(linha.previsto),
                formatCurrency(linha.realizado),
                formatCurrency(linha.desvio),
                formatarPercentual(linha.percentual),
              ]
            : [
                linha.titulo,
                formatCurrency(linha.previsto),
                formatCurrency(linha.realizado),
                formatCurrency(linha.desvio),
              ]
        )),
        foot: [
          mostrarPercentual
            ? [
                totalLabel,
                formatCurrency(totalPrevisto),
                formatCurrency(totalRealizado),
                formatCurrency(totalDesvio),
                formatarPercentual(totalPercentual),
              ]
            : [
                totalLabel,
                formatCurrency(totalPrevisto),
                formatCurrency(totalRealizado),
                formatCurrency(totalDesvio),
              ],
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 229, 241], textColor: [31, 73, 125], fontStyle: 'bold' },
        footStyles: { fillColor: [238, 243, 251], textColor: [31, 73, 125], fontStyle: 'bold' },
        columnStyles: mostrarPercentual
          ? {
              0: { cellWidth: 60, halign: 'left' },
              1: { halign: 'right' },
              2: { halign: 'right' },
              3: { halign: 'right' },
              4: { halign: 'right' },
            }
          : {
              0: { cellWidth: 70, halign: 'left' },
              1: { halign: 'right' },
              2: { halign: 'right' },
              3: { halign: 'right' },
            },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      yPos = finalY ? finalY + 6 : yPos + 24;
    };

    const gerarTabelaBancosPdf = (linhas: LinhaBanco[]) => {
      adicionarSecao('Saldos Bancários (Realizado)');
      const totalRealizado = somarRealizadoBancos(linhas);

      autoTable(doc, {
        startY: yPos,
        head: [['Banco', 'Saldo realizado']],
        body:
          linhas.length > 0
            ? linhas.map((linha) => [linha.titulo, formatCurrency(linha.realizado)])
            : [['Nenhum banco informado', '—']],
        foot: [[linhas.length > 0 ? 'Total em bancos' : '', linhas.length > 0 ? formatCurrency(totalRealizado) : '']],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [229, 231, 235], textColor: [55, 65, 81], fontStyle: 'bold' },
        footStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 80, halign: 'left' },
          1: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      yPos = finalY ? finalY + 6 : yPos + 20;
    };

    gerarTabelaComparativaPdf('Gastos por área', relatorio.gastos, 'Total de gastos');
    gerarTabelaComparativaPdf('Receitas por categoria', relatorio.receitas, 'Total de receitas');
    gerarTabelaComparativaPdf(
      'Resultado de saldo de caixa do dia',
      linhasResultadoCaixa,
      'Totais do dia',
    );
    gerarTabelaComparativaPdf('Resumo geral', linhasResumoGeral, 'Resumo consolidado');
    gerarTabelaBancosPdf(relatorio.bancos);

    return doc;
  }, [linhasResumoGeral, linhasResultadoCaixa, relatorio]);

  const handleExportPdf = useCallback(() => {
    const doc = gerarDocumentoPdf();
    if (!doc) {
      return;
    }
    doc.save(nomeArquivoPdf);
  }, [gerarDocumentoPdf, nomeArquivoPdf]);

  const handleAbrirModalEmail = useCallback(() => {
    if (usuario?.usr_email) {
      setEmailDestino(usuario.usr_email);
    }
    setEmailErro(null);
    setEmailModalAberto(true);
  }, [usuario]);

  const handleFecharModalEmail = useCallback(() => {
    setEmailModalAberto(false);
    setEmailErro(null);
  }, []);

  const handleEnviarEmail = useCallback(async () => {
    if (!relatorio) {
      return;
    }

    const email = emailDestino.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setEmailErro('Informe um e-mail válido.');
      return;
    }
    setEmailErro(null);

    try {
      setEnviandoEmail(true);
      const doc = gerarDocumentoPdf();
      if (!doc) {
        throw new Error('Não foi possível gerar o relatório em PDF.');
      }

      const blob = doc.output('blob');
      const arquivo = new File([blob], nomeArquivoPdf, { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData & { files?: File[] }) => boolean;
        share?: (data: ShareData & { files?: File[] }) => Promise<void>;
      };

      const shareData = {
        files: [arquivo],
        title: 'Saldo Diário',
        text: `Relatório de saldo diário - ${formatarDataPt(relatorio.data)}`,
      } as ShareData & { files: File[] };

      let compartilhado = false;
      if (nav.share && nav.canShare?.(shareData)) {
        try {
          await nav.share(shareData);
          compartilhado = true;
        } catch (shareError) {
          console.warn('Compartilhamento nativo não concluído, aplicando fallback.', shareError);
        }
      }

      if (!compartilhado) {
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = nomeArquivoPdf;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);

        const assunto = `Relatório Saldo Diário - ${formatarDataPt(relatorio.data)}`;
        const corpo = encodeURIComponent(
          [
            `Segue o relatório de saldo diário referente a ${formatarDataPt(relatorio.data)}.`,
            '',
            'O arquivo PDF foi baixado automaticamente neste dispositivo. Anexe-o ao e-mail antes do envio.',
          ].join('\n'),
        );

        const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
          email,
        )}&subject=${encodeURIComponent(assunto)}&body=${corpo}`;
        window.open(outlookUrl, '_blank', 'noopener,noreferrer');
      }

      setEmailModalAberto(false);
    } catch (error) {
      console.error('Erro ao preparar envio por e-mail:', error);
      setEmailErro('Não foi possível preparar o envio. Tente novamente.');
    } finally {
      setEnviandoEmail(false);
    }
  }, [emailDestino, gerarDocumentoPdf, nomeArquivoPdf, relatorio]);

  if (carregandoUsuario) {
    return (
      <>
        <Header title="Relatório - Saldo Diário" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }
  return (
    <>
      <Header
        title="Relatório - Saldo Diário"
        subtitle={`Data selecionada: ${formatarDataPt(dataReferencia)}`}
        actions={
          <div className="report-actions">
            <input
              type="date"
              value={dataReferencia}
              onChange={(event) => setDataReferencia(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button variant="secondary" onClick={handleAbrirModalEmail} disabled={!relatorio || carregandoDados}>
              Enviar por e-mail
            </Button>
            <Button variant="primary" onClick={handleExportPdf} disabled={!relatorio || carregandoDados}>
              Exportar PDF
            </Button>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível carregar o relatório">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregandoDados && (
          <div className="flex justify-center">
            <Loading text="Gerando relatório de saldo diário..." />
          </div>
        )}

        {relatorio && !carregandoDados && (
          <div className="report-wrapper">
            <div className="report-header">
              <div>
                <p className="report-header__title">Saldo Diário</p>
                <p className="report-header__subtitle">Data de referência: {formatarDataPt(relatorio.data)}</p>
              </div>
            </div>

            <div className="report-metrics">
              <div className="report-metric">
                <span className="report-metric__label">Receitas realizadas</span>
                <span
                  className={`report-metric__value ${
                    relatorio.resumo.totalReceitasRealizadas >= relatorio.resumo.totalReceitasPrevistas
                      ? 'text-emerald-700'
                      : 'text-amber-600'
                  }`}
                >
                  {formatCurrency(relatorio.resumo.totalReceitasRealizadas)}
                </span>
                <span className="report-metric__subvalue">
                  Previsto: {formatCurrency(relatorio.resumo.totalReceitasPrevistas)}
                </span>
              </div>
              <div className="report-metric">
                <span className="report-metric__label">Despesas realizadas</span>
                <span
                  className={`report-metric__value ${
                    relatorio.resumo.totalDespesasRealizadas <= relatorio.resumo.totalDespesasPrevistas
                      ? 'text-emerald-700'
                      : 'text-rose-600'
                  }`}
                >
                  {formatCurrency(relatorio.resumo.totalDespesasRealizadas)}
                </span>
                <span className="report-metric__subvalue">
                  Previsto: {formatCurrency(relatorio.resumo.totalDespesasPrevistas)}
                </span>
              </div>
              <div className="report-metric">
                <span className="report-metric__label">Saldo em bancos</span>
                <span className="report-metric__value text-slate-800">
                  {formatCurrency(relatorio.resumo.bancosRealizados)}
                </span>
                <span className="report-metric__subvalue">
                  Saldo final previsto: {formatCurrency(relatorio.resumo.saldoFinalPrevisto)}
                </span>
              </div>
            </div>

            <div className="report-grid report-grid--two">
              {renderTabelaComparativa('Gastos por Área', relatorio.gastos, {
                accent: 'amarelo',
                totalLabel: 'Total de Gastos',
              })}
              {renderTabelaComparativa('Receitas por Categoria', relatorio.receitas, {
                accent: 'verde',
                totalLabel: 'Total de Receitas',
              })}
            </div>

            <div className="report-grid report-grid--three">
              {renderTabelaComparativa('Resultado de Saldo de Caixa do Dia', linhasResultadoCaixa, {
                accent: 'laranja',
                showTotals: false,
              })}
              {renderTabelaComparativa('Resumo Geral', linhasResumoGeral, {
                accent: 'azul',
              })}
              {renderTabelaBancos('Saldos Bancários', relatorio.bancos)}
            </div>
          </div>
        )}

        {!relatorio && !carregandoDados && !erro && (
          <Card variant="default" title="Nenhum dado encontrado">
            <p className="text-sm text-gray-600">
              Não localizamos informações para a data selecionada. Ajuste o filtro de data e tente novamente.
            </p>
          </Card>
        )}
      </div>

      <Modal
        isOpen={emailModalAberto}
        onClose={handleFecharModalEmail}
        title="Enviar relatório por e-mail"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleFecharModalEmail} disabled={enviandoEmail}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleEnviarEmail}
              loading={enviandoEmail}
              disabled={enviandoEmail}
            >
              Enviar e abrir Outlook
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Destinatário"
            type="email"
            value={emailDestino}
            onChange={(event) => setEmailDestino(event.target.value)}
            placeholder="usuario@empresa.com.br"
            required
            fullWidth
            error={emailErro ?? undefined}
          />
          <p className="text-xs text-gray-500">
            O arquivo em PDF será gerado automaticamente. Caso o compartilhamento direto não esteja disponível neste
            dispositivo, abriremos o Outlook Web com o e-mail preenchido e o arquivo já salvo nos seus downloads.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default RelatorioSaldoDiarioPage;
