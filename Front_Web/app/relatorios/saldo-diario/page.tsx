'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading, Modal, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/mathParser';
import {
  getOrCreateUser,
  getSupabaseClient,
  type UsuarioRow,
} from '@/lib/supabaseClient';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { getUserSession } from '@/lib/userSession';

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const calcularUltimoDiaUtil = (): string => {
  const hoje = new Date();
  const data = new Date(hoje);
  data.setDate(data.getDate() - 1);

  for (let i = 0; i < 7; i += 1) {
    const diaSemana = data.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      return toISODate(data);
    }

    data.setDate(data.getDate() - 1);
  }

  return toISODate(hoje);
};

const dataISOValida = (valor: string): boolean => /^(\d{4})-(\d{2})-(\d{2})$/.test(valor);

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
  ban_bancos?: MaybeArray<{ ban_nome?: unknown; ban_numero_conta?: unknown } | null>;
};

type LinhaComparativa = {
  chave: string;
  titulo: string;
  previsto: number;
  realizado: number;
  desvio: number;
  percentual: number | null;
};

type LinhaRealizada = {
  chave: string;
  titulo: string;
  realizado: number;
};

type LinhaTabela = LinhaComparativa | LinhaRealizada;

type TabelaAccent = 'azul' | 'verde' | 'amarelo' | 'laranja' | 'cinza';

type RenderTabelaOptions = {
  accent?: TabelaAccent;
  totalLabel?: string;
  showTotals?: boolean;
  layout?: 'comparativo' | 'realizado';
  inverterCores?: boolean;
};

type RelatorioSaldoDiario = {
  data: string;
  gastos: LinhaComparativa[];
  receitas: LinhaComparativa[];
  bancos: LinhaComparativa[];
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
    bancosPrevistos: number;
    bancosRealizados: number;
    aplicacoesRealizadas: number;
    resgatesTotais: number;
    transferenciasTotais: number;
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

const obterOrdemArea = (nomeArea: string): number => {
  const nomeNormalizado = nomeArea.trim().toUpperCase();
  const ordemAreas: Record<string, number> = {
    'GASTO COM MATERIAL E CONSUMO': 1,
    'MATERIAL E CONSUMO': 1,
    'GASTO RH': 2,
    'RH': 2,
    'GASTO FINANCEIRO E FISCAL': 3,
    'FINANCEIRO E FISCAL': 3,
    'GASTO LOGISTICA': 4,
    'LOGISTICA': 4,
    'GASTO COMERCIAL': 5,
    'COMERCIAL': 5,
    'GASTO MARKETING': 6,
    'MARKETING': 6,
    'GASTO LOJA DE FABRICA': 7,
    'LOJA DE FABRICA': 7,
    'GASTO TI': 8,
    'TI': 8,
    'GASTO DIRETORIA': 9,
    'DIRETORIA': 9,
    'GASTO COMPRAS': 10,
    'COMPRAS': 10,
    'GASTO INVESTIMENTO': 11,
    'INVESTIMENTO': 11,
    'GASTO DALLAS': 12,
    'DALLAS': 12,
    'TRANSFERÊNCIA PARA APLICAÇÃO': 13,
    'TRANSFERENCIA PARA APLICACAO': 13,
    'APLICACAO': 13,
  };

  // Procura pela chave exata
  if (ordemAreas[nomeNormalizado] !== undefined) {
    return ordemAreas[nomeNormalizado];
  }

  // Procura se contém alguma das palavras-chave
  for (const [chave, ordem] of Object.entries(ordemAreas)) {
    if (nomeNormalizado.includes(chave)) {
      return ordem;
    }
  }

  // Se não encontrou, retorna um valor alto para aparecer no final
  return 999;
};

const montarTituloContaReceita = (
  contaRel: { ctr_nome?: unknown; ctr_codigo?: unknown } | undefined,
  fallback: string,
): string => {
  const nomeConta = contaRel?.ctr_nome ? toString(contaRel.ctr_nome) : fallback;
  const codigoConta = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : '';
  return codigoConta ? `${nomeConta} (${codigoConta})` : nomeConta;
};

const tabelaAccentClassNames: Record<TabelaAccent, string> = {
  azul: 'report-section report-section--azul',
  verde: 'report-section report-section--verde',
  amarelo: 'report-section report-section--amarelo',
  laranja: 'report-section report-section--laranja',
  cinza: 'report-section report-section--cinza',
};

const tabelaAccentPdfColors: Record<TabelaAccent, [number, number, number]> = {
  azul: [31, 73, 125],
  verde: [27, 94, 32],
  amarelo: [183, 121, 31],
  laranja: [156, 66, 33],
  cinza: [75, 85, 99],
};

const calcularPercentual = (previsto: number, realizado: number): number | null => {
  if (Math.abs(previsto) < 0.0001) {
    return null;
  }
  const diferenca = realizado - previsto;
  return (diferenca / previsto) * 100;
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
  ordenarPorArea: boolean = false,
): LinhaComparativa[] =>
  Array.from(mapa.entries())
    .map(([chave, item]) => {
      const previsto = arredondar(item.previsto);
      const realizado = arredondar(item.realizado);
      const desvio = arredondar(realizado - previsto);
      const percentual = calcularPercentual(previsto, realizado);
      return { chave, titulo: item.titulo, previsto, realizado, desvio, percentual };
    })
    .sort((a, b) => {
      if (ordenarPorArea) {
        const ordemA = obterOrdemArea(a.titulo);
        const ordemB = obterOrdemArea(b.titulo);
        if (ordemA !== ordemB) {
          return ordemA - ordemB;
        }
      }
      return a.titulo.localeCompare(b.titulo, 'pt-BR');
    });

const somarPrevisto = (linhas: LinhaTabela[]): number =>
  arredondar(
    linhas.reduce((acc, linha) => acc + ('previsto' in linha && typeof linha.previsto === 'number' ? linha.previsto : 0), 0),
  );

const somarRealizado = (linhas: LinhaTabela[]): number =>
  arredondar(linhas.reduce((acc, linha) => acc + linha.realizado, 0));

const RelatorioSaldoDiarioPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dataReferencia, setDataReferencia] = useState(() => calcularUltimoDiaUtil());
  const [relatorio, setRelatorio] = useState<RelatorioSaldoDiario | null>(null);
  const [emailModalAberto, setEmailModalAberto] = useState(false);
  const [emailDestino, setEmailDestino] = useState('');
  const [emailMensagem, setEmailMensagem] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState<string | null>(null);
  const [alertaAuditoria, setAlertaAuditoria] = useState<string | null>(null);
  const [registrandoSaldo, setRegistrandoSaldo] = useState(false);
  const [modalRegistroAberto, setModalRegistroAberto] = useState(false);
  const [resultadoRegistro, setResultadoRegistro] = useState<string | null>(null);

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

  const registrarSaldoDiario = useCallback(
    async (
      supabase: SupabaseClient<any, any, any>,
      usuarioAtual: UsuarioRow,
      data: string,
      resumo: RelatorioSaldoDiario['resumo'],
    ) => {
      if (!dataISOValida(data)) {
        return;
      }
      try {
        const { data: registroExistente, error: erroBuscaAtual } = await supabase
          .from('sdd_saldo_diario')
          .select('sdd_id, sdd_criado_em, sdd_saldo_inicial')
          .eq('sdd_data', data)
          .maybeSingle();

        if (erroBuscaAtual) throw erroBuscaAtual;

        const { data: registroAnterior, error: erroBuscaAnterior } = await supabase
          .from('sdd_saldo_diario')
          .select('sdd_saldo_final')
          .lt('sdd_data', data)
          .order('sdd_data', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (erroBuscaAnterior) throw erroBuscaAnterior;

        const saldoInicialDia =
          registroAnterior?.sdd_saldo_final !== undefined && registroAnterior?.sdd_saldo_final !== null
            ? Number(registroAnterior.sdd_saldo_final)
            : registroExistente?.sdd_saldo_inicial ?? resumo.saldoInicialRealizado;

        const { error: erroUpsert } = await supabase
          .from('sdd_saldo_diario')
          .upsert(
            {
              sdd_data: data,
              sdd_saldo_inicial: saldoInicialDia,
              sdd_saldo_final: resumo.saldoFinalRealizado,
              sdd_descricao: 'Inclusão por cálculo',
              sdd_observacao: null,
              sdd_usr_id: usuarioAtual.usr_id,
              ...(registroExistente?.sdd_criado_em
                ? { sdd_criado_em: registroExistente.sdd_criado_em }
                : {}),
            },
            { onConflict: 'sdd_data' },
          );

        if (erroUpsert) throw erroUpsert;

        setAlertaAuditoria(null);
      } catch (error) {
        console.error('Erro ao registrar saldo diário para auditoria:', error);
        setAlertaAuditoria(
          'Não foi possível registrar a auditoria do saldo diário. Os valores exibidos permanecem disponíveis.',
        );
      }
    },
    [],
  );

  const carregarRelatorio = useCallback(
    async (usuarioAtual: UsuarioRow, data: string) => {
      try {
        setCarregandoDados(true);
        const supabase = getSupabaseClient();

        // Todos os usuários podem visualizar todos os dados
        const [
          previsoesRes,
          gastosRes,
          receitasRes,
          saldosRes,
          saldoDiarioAnteriorRes,
          saldoDiarioAtualRes,
          primeiroSaldoDiarioRes,
        ] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_tipo, pvi_categoria, pvi_valor, pvi_are_id, pvi_ctr_id, pvi_ban_id, are_areas(are_nome), ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome)',
            )
            .eq('pvi_data', data),
          supabase
            .from('pag_pagamentos_area')
            .select('pag_valor, pag_are_id, are_areas(are_nome)')
            .eq('pag_data', data),
          supabase
            .from('rec_receitas')
            .select('rec_id, rec_valor, rec_ctr_id, ctr_contas_receita(ctr_nome, ctr_codigo)')
            .eq('rec_data', data),
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_saldo, sdb_ban_id, ban_bancos(ban_nome, ban_numero_conta)')
            .eq('sdb_data', data),
          supabase
            .from('sdd_saldo_diario')
            .select('sdd_data, sdd_saldo_final')
            .lt('sdd_data', data)
            .order('sdd_data', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('sdd_saldo_diario')
            .select('sdd_saldo_inicial, sdd_data')
            .eq('sdd_data', data)
            .maybeSingle(),
          supabase
            .from('sdd_saldo_diario')
            .select('sdd_data, sdd_saldo_inicial')
            .order('sdd_data', { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (gastosRes.error) throw gastosRes.error;
        if (receitasRes.error) throw receitasRes.error;
        if (saldosRes.error) throw saldosRes.error;
        if (saldoDiarioAnteriorRes.error) throw saldoDiarioAnteriorRes.error;
        if (saldoDiarioAtualRes.error) throw saldoDiarioAtualRes.error;
        if (primeiroSaldoDiarioRes.error) throw primeiroSaldoDiarioRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoRow>);
        const pagamentosArea = (gastosRes.data as MaybeArray<PagamentoAreaRow>) ?? [];
        const receitas = (receitasRes.data as MaybeArray<ReceitaRow>) ?? [];
        const saldosBancarios = (saldosRes.data as MaybeArray<SaldoBancoRow>) ?? [];
        const saldoFinalAnterior = saldoDiarioAnteriorRes.data?.sdd_saldo_final;
        const saldoInicialAtualRegistrado = saldoDiarioAtualRes.data?.sdd_saldo_inicial;
        const primeiroSaldoInicialRegistrado =
          primeiroSaldoDiarioRes.data?.sdd_data === data
            ? primeiroSaldoDiarioRes.data?.sdd_saldo_inicial
            : undefined;

        const mapaGastos = new Map<string, { titulo: string; previsto: number; realizado: number }>();
        const mapaReceitas = new Map<string, { titulo: string; previsto: number; realizado: number }>();
        const mapaBancos = new Map<string, { titulo: string; previsto: number; realizado: number }>();

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
            const titulo = areaRel?.are_nome ? toString(areaRel.are_nome) : toString((item as PrevisaoRow).pvi_categoria, 'Área não informada');
            const chave = `${areaId}-${titulo.toLowerCase()}`;
            const existente = mapaGastos.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
            existente.previsto += valor;
            mapaGastos.set(chave, existente);
          }

          if (tipo === 'receita') {
            const contaId = toString((item as PrevisaoRow).pvi_ctr_id, 'sem-conta');
            const tituloConta = montarTituloContaReceita(contaRel, 'Conta não informada');
            const chave = `${contaId}-${tituloConta.toLowerCase()}`;
            const existente = mapaReceitas.get(chave) ?? { titulo: tituloConta, previsto: 0, realizado: 0 };
            existente.previsto += valor;
            mapaReceitas.set(chave, existente);

            if ((item as PrevisaoRow).pvi_ban_id !== null && (item as PrevisaoRow).pvi_ban_id !== undefined) {
              const bancoId = toString((item as PrevisaoRow).pvi_ban_id, 'sem-banco');
              const bancoTitulo = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
              const chaveBanco = `${bancoId}-${bancoTitulo.toLowerCase()}`;
              const existenteBanco = mapaBancos.get(chaveBanco) ?? { titulo: bancoTitulo, previsto: 0, realizado: 0 };
              existenteBanco.previsto += valor;
              mapaBancos.set(chaveBanco, existenteBanco);
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
          const valor = arredondar(toNumber(item.pag_valor));

          // Verificar se é área de aplicação
          const tituloNormalizado = titulo.trim().toUpperCase();
          const ehAplicacao = tituloNormalizado.includes('APLICACAO') || tituloNormalizado.includes('APLICAÇÃO');

          if (!ehAplicacao) {
            // Se NÃO for aplicação, adicionar normalmente em gastos por área
            const existente = mapaGastos.get(chave) ?? { titulo, previsto: 0, realizado: 0 };
            existente.realizado += valor;
            mapaGastos.set(chave, existente);
          }
          // Se for aplicação, será processado depois separadamente
        });

        // Remover duplicatas usando um Set para rastrear rec_id únicos
        const receitasUnicas = new Map<number, ReceitaRow>();
        normalizeRelation(receitas).forEach((item: any) => {
          const recId = item.rec_id;
          if (recId && !receitasUnicas.has(recId)) {
            receitasUnicas.set(recId, item);
          } else if (!recId) {
            // Se não tiver rec_id (improvável), adicionar mesmo assim
            receitasUnicas.set(Math.random(), item);
          }
        });

        Array.from(receitasUnicas.values()).forEach((item) => {
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const contaId = toString(item.rec_ctr_id, 'sem-conta');
          const codigoConta = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : '';
          const tituloConta = montarTituloContaReceita(contaRel, 'Conta não informada');
          const valor = arredondar(toNumber(item.rec_valor));

          // Verificar se é a conta RESGATE APLICACAO (203)
          // Se for, não adicionar às receitas (será processado depois como resgate)
          if (codigoConta !== '203') {
            // Adicionar normalmente nas receitas por categoria
            const chave = `${contaId}-${tituloConta.toLowerCase()}`;
            const existente = mapaReceitas.get(chave) ?? { titulo: tituloConta, previsto: 0, realizado: 0 };
            existente.realizado += valor;
            mapaReceitas.set(chave, existente);
          }
        });

        normalizeRelation(saldosBancarios).forEach((item) => {
          const bancoRel = normalizeRelation(item.ban_bancos)[0];
          const bancoNome = bancoRel?.ban_nome ? toString(bancoRel.ban_nome) : 'Banco não informado';
          const bancoConta = bancoRel?.ban_numero_conta ? toString(bancoRel.ban_numero_conta) : '';
          const bancoTitulo = bancoConta ? `${bancoNome} / ${bancoConta}` : bancoNome;
          const bancoId = toString(item.sdb_ban_id, 'sem-banco');
          const chave = `${bancoId}-${bancoNome.toLowerCase()}`;
          const existente = mapaBancos.get(chave) ?? { titulo: bancoTitulo, previsto: 0, realizado: 0 };
          existente.realizado += arredondar(toNumber(item.sdb_saldo));
          mapaBancos.set(chave, existente);
        });

        // Separar aplicações em resgates e transferências para mostrar individualmente
        let resgatesTotais = 0;
        let transferenciasTotais = 0;

        // Processar pagamentos por área novamente para separar resgates e transferências
        normalizeRelation(pagamentosArea).forEach((item) => {
          const areaRel = normalizeRelation(item.are_areas)[0];
          const titulo = areaRel?.are_nome ? toString(areaRel.are_nome) : 'Área não informada';
          const valor = arredondar(toNumber(item.pag_valor));

          const tituloNormalizado = titulo.trim().toUpperCase();
          const ehAplicacao = tituloNormalizado.includes('APLICACAO') || tituloNormalizado.includes('APLICAÇÃO');

          if (ehAplicacao) {
            const ehResgate = tituloNormalizado.includes('RESGATE');
            const ehTransferencia = tituloNormalizado.includes('TRANSFERENCIA') || tituloNormalizado.includes('TRANSFERÊNCIA');

            if (ehResgate) {
              resgatesTotais += valor;
            } else if (ehTransferencia) {
              transferenciasTotais += valor;
            } else {
              transferenciasTotais += valor;
            }
          }
        });

        // Adicionar resgates da conta 203 (RESGATE APLICACAO)
        Array.from(receitasUnicas.values()).forEach((item) => {
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0];
          const codigoConta = contaRel?.ctr_codigo ? toString(contaRel.ctr_codigo) : '';
          const valor = arredondar(toNumber(item.rec_valor));

          if (codigoConta === '203') {
            resgatesTotais += valor;
          }
        });

        resgatesTotais = arredondar(resgatesTotais);
        transferenciasTotais = arredondar(transferenciasTotais);

        // Calcular saldo líquido de aplicações (resgates - transferências)
        const aplicacoesRealizadas = arredondar(resgatesTotais - transferenciasTotais);

        const gastos = converterMapaParaLinhas(mapaGastos, true);
        const receitasComparativo = converterMapaParaLinhas(mapaReceitas, false);
        const bancos = converterMapaParaLinhas(mapaBancos, false);

        const totalDespesasPrevistas = somarPrevisto(gastos);
        const totalDespesasRealizadas = somarRealizado(gastos);
        const totalReceitasPrevistas = somarPrevisto(receitasComparativo);
        const totalReceitasRealizadas = somarRealizado(receitasComparativo);
        const totalBancosPrevistos = somarPrevisto(bancos);
        const totalBancosRealizados = somarRealizado(bancos);

        const resultadoPrevisto = arredondar(totalReceitasPrevistas - totalDespesasPrevistas);
        const resultadoRealizado = arredondar(totalReceitasRealizadas - totalDespesasRealizadas);

        if (saldoFinalPrevisto === 0) {
          saldoFinalPrevisto = arredondar(saldoInicialPrevisto + resultadoPrevisto);
        }

        // Priorizar o saldo final do dia anterior registrado em sdd_saldo_diario,
        // mantendo o saldo inicial do primeiro dia caso não exista histórico prévio
        const saldoInicialRealizado = arredondar(
          saldoFinalAnterior ??
            saldoInicialAtualRegistrado ??
            primeiroSaldoInicialRegistrado ??
            saldoInicialPrevisto,
        );

        // Calcular saldo final do dia: saldo anterior + receitas realizadas - despesas realizadas + aplicações (resgates/transferências)
        const saldoFinalRealizado = arredondar(
          saldoInicialRealizado + totalReceitasRealizadas - totalDespesasRealizadas + aplicacoesRealizadas,
        );

        const resumoCalculado: RelatorioSaldoDiario['resumo'] = {
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
          bancosPrevistos: totalBancosPrevistos,
          bancosRealizados: totalBancosRealizados,
          aplicacoesRealizadas: arredondar(aplicacoesRealizadas),
          resgatesTotais,
          transferenciasTotais,
        };

        setRelatorio({
          data,
          gastos,
          receitas: receitasComparativo,
          bancos,
          resumo: resumoCalculado,
        });
        setErro(null);

        // Não registrar auditoria automática - deixar para a sincronização manual
        // void registrarSaldoDiario(supabase, usuarioAtual, data, resumoCalculado);
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
    [registrarSaldoDiario],
  );

  useEffect(() => {
    if (!usuario) {
      return;
    }
    if (!dataISOValida(dataReferencia)) {
      setCarregandoDados(false);
      setRelatorio(null);
      setErro(dataReferencia ? 'Informe uma data completa (AAAA-MM-DD).' : null);
      return;
    }
    carregarRelatorio(usuario, dataReferencia);
  }, [usuario, dataReferencia, carregarRelatorio]);

  const renderTabelaComparativa = useCallback(
    (titulo: string, linhas: LinhaTabela[], options: RenderTabelaOptions = {}) => {
      const layout = options.layout ?? 'comparativo';
      const accent = options.accent ?? 'azul';
      const totalLabel = options.totalLabel ?? 'Totais';
      const showTotals = options.showTotals ?? layout === 'comparativo';
      const inverterCores = options.inverterCores ?? false;
      const sectionClass = tabelaAccentClassNames[accent] ?? tabelaAccentClassNames.azul;

      const linhasComparativas =
        layout === 'comparativo'
          ? linhas.filter(
              (linha): linha is LinhaComparativa =>
                'previsto' in linha &&
                typeof linha.previsto === 'number' &&
                'desvio' in linha &&
                typeof linha.desvio === 'number',
            )
          : [];
      const linhasParaComparativo =
        layout === 'comparativo'
          ? linhasComparativas.length > 0
            ? linhasComparativas
            : (linhas as LinhaComparativa[])
          : [];

      const linhasParaExibir = layout === 'comparativo' ? linhasParaComparativo : linhas;

      const totalPrevisto =
        layout === 'comparativo' ? somarPrevisto(linhasParaComparativo) : 0;
      const totalRealizado =
        layout === 'comparativo' ? somarRealizado(linhasParaComparativo) : somarRealizado(linhas);
      const totalDesvio = layout === 'comparativo' ? arredondar(totalRealizado - totalPrevisto) : 0;
      const totalPercentual =
        layout === 'comparativo' ? calcularPercentual(totalPrevisto, totalRealizado) : null;
      const colSpan = layout === 'comparativo' ? 5 : 2;

      return (
        <div className={sectionClass}>
          <div className="report-section__header">
            <span>{titulo}</span>
          </div>
          <table className="report-section__table">
            <thead>
              {layout === 'comparativo' ? (
                <tr>
                  <th className="text-center">Categoria</th>
                  <th className="text-center">Previsto</th>
                  <th className="text-center">Realizado</th>
                  <th className="text-center">Desvio</th>
                  <th className="text-center">% Desvio</th>
                </tr>
              ) : (
                <tr>
                  <th className="text-center">Movimento</th>
                  <th className="text-center">Realizado</th>
                </tr>
              )}
            </thead>
            <tbody>
              {linhasParaExibir.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="report-section__empty-cell">
                    Nenhuma informação encontrada para esta seção.
                  </td>
                </tr>
              ) : layout === 'comparativo' ? (
                linhasParaComparativo.map((linha) => (
                  <tr key={linha.chave}>
                    <td>{linha.titulo}</td>
                    <td>{formatCurrency(linha.previsto)}</td>
                    <td>{formatCurrency(linha.realizado)}</td>
                    <td className={
                      inverterCores
                        ? (linha.desvio >= 0 ? 'report-value--negativo' : 'report-value--positivo')
                        : (linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo')
                    }>
                      {formatCurrency(linha.desvio)}
                    </td>
                    <td className={
                      inverterCores
                        ? (linha.desvio >= 0 ? 'report-value--negativo' : 'report-value--positivo')
                        : (linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo')
                    }>
                      {formatarPercentual(linha.percentual)}
                    </td>
                  </tr>
                ))
              ) : (
                linhas.map((linha) => (
                  <tr key={linha.chave}>
                    <td>{linha.titulo}</td>
                    <td>{formatCurrency(linha.realizado)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {showTotals && (
              <tfoot className="border-t-2 border-gray-400">
                {layout === 'comparativo' ? (
                  <tr>
                    <td>{totalLabel}</td>
                    <td>{formatCurrency(totalPrevisto)}</td>
                    <td>{formatCurrency(totalRealizado)}</td>
                    <td className={
                      inverterCores
                        ? (totalDesvio >= 0 ? 'report-value--negativo' : 'report-value--positivo')
                        : (totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo')
                    }>
                      {formatCurrency(totalDesvio)}
                    </td>
                    <td className={
                      inverterCores
                        ? (totalDesvio >= 0 ? 'report-value--negativo' : 'report-value--positivo')
                        : (totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo')
                    }>
                      {formatarPercentual(totalPercentual)}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td>{totalLabel}</td>
                    <td>{formatCurrency(totalRealizado)}</td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      );
    },
    [],
  );

  const linhasResultadoCaixa = useMemo(() => {
    if (!relatorio) {
      return [];
    }
    const { resumo } = relatorio;
    return [
      {
        chave: 'receitas-dia',
        titulo: 'Entradas do Dia (Receitas)',
        previsto: resumo.totalReceitasPrevistas,
        realizado: resumo.totalReceitasRealizadas,
        desvio: arredondar(resumo.totalReceitasRealizadas - resumo.totalReceitasPrevistas),
        percentual: calcularPercentual(resumo.totalReceitasPrevistas, resumo.totalReceitasRealizadas),
      },
      {
        chave: 'despesas-dia',
        titulo: 'Saídas do Dia (Despesas)',
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
  }, [relatorio]);

  const linhasResumoGeral = useMemo<LinhaRealizada[]>(() => {
    if (!relatorio) {
      return [];
    }
    const { resumo } = relatorio;
    const linhas: LinhaRealizada[] = [
      {
        chave: 'saldo-anterior',
        titulo: 'Saldo do Dia Anterior',
        realizado: resumo.saldoInicialRealizado,
      },
      {
        chave: 'resultado',
        titulo: 'Resultado do Dia (Receitas - Despesas)',
        realizado: resumo.resultadoRealizado,
      },
    ];

    // Adicionar linhas de aplicação/resgate separadamente
    if (resumo.resgatesTotais > 0) {
      linhas.push({
        chave: 'resgate-aplicacao',
        titulo: 'Resgate Aplicação',
        realizado: resumo.resgatesTotais,
      });
    }

    if (resumo.transferenciasTotais > 0) {
      linhas.push({
        chave: 'transferencia-aplicacao',
        titulo: 'Transferência para Aplicação',
        realizado: -resumo.transferenciasTotais, // Negativo porque é saída
      });
    }

    linhas.push({
      chave: 'saldo-final',
      titulo: 'Saldo Final do Dia',
      realizado: resumo.saldoFinalRealizado,
    });

    return linhas;
  }, [relatorio]);

  const gerarDocumentoPdf = useCallback(() => {
    if (!relatorio) {
      return null;
    }

    const doc = new jsPDF('portrait', 'mm', 'a4');
    const margemHorizontal = 8;
    const larguraUtil = doc.internal.pageSize.getWidth() - margemHorizontal * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Saldo Diário', margemHorizontal, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Data: ${formatarDataPt(relatorio.data)}`, margemHorizontal, 14);

    const resumoLinha = `Saldo Inicial: ${formatCurrency(relatorio.resumo.saldoInicialRealizado)} | Rec: ${formatCurrency(relatorio.resumo.totalReceitasRealizadas)} | Desp: ${formatCurrency(relatorio.resumo.totalDespesasRealizadas)} | Saldo do dia: ${formatCurrency(relatorio.resumo.resultadoRealizado)} | Bancos: ${formatCurrency(relatorio.resumo.bancosRealizados)}`;
    doc.setFontSize(6);
    const resumoQuebrado = doc.splitTextToSize(resumoLinha, larguraUtil);
    doc.text(resumoQuebrado, margemHorizontal, 17);

    let posicaoAtual = 17 + resumoQuebrado.length * 2.5;

    type TabelaPdfOptions = {
      layout?: 'comparativo' | 'realizado';
      accent?: TabelaAccent;
      totalLabel?: string;
      showTotals?: boolean;
    };

    const adicionarTabela = (
      titulo: string,
      linhas: LinhaTabela[],
      { layout = 'comparativo', accent = 'azul', totalLabel, showTotals }: TabelaPdfOptions = {},
    ) => {
      posicaoAtual += 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(titulo, margemHorizontal, posicaoAtual);

      const cabecalho =
        layout === 'comparativo'
          ? [['Categoria', 'Previsto', 'Realizado', 'Diferença', '%']]
          : [['Movimento', 'Realizado']];

      const linhasComparativas =
        layout === 'comparativo'
          ? linhas.filter(
              (linha): linha is LinhaComparativa =>
                'previsto' in linha &&
                typeof linha.previsto === 'number' &&
                'desvio' in linha &&
                typeof linha.desvio === 'number',
            )
          : [];
      const linhasParaComparativo =
        layout === 'comparativo'
          ? linhasComparativas.length > 0
            ? linhasComparativas
            : (linhas as LinhaComparativa[])
          : [];

      const linhasParaExibir = layout === 'comparativo' ? linhasParaComparativo : linhas;

      const corpo =
        linhasParaExibir.length === 0
          ? layout === 'comparativo'
            ? [['Nenhum registro', '-', '-', '-', '-']]
            : [['Nenhum registro', '-']]
          : layout === 'comparativo'
            ? linhasParaComparativo.map((linha) => [
                linha.titulo,
                formatCurrency(linha.previsto),
                formatCurrency(linha.realizado),
                formatCurrency(linha.desvio),
                formatarPercentual(linha.percentual),
              ])
            : linhas.map((linha) => [linha.titulo, formatCurrency(linha.realizado)]);

      const totalPrevisto =
        layout === 'comparativo' ? somarPrevisto(linhasParaComparativo) : 0;
      const totalRealizado =
        layout === 'comparativo' ? somarRealizado(linhasParaComparativo) : somarRealizado(linhas);
      const totalDesvio = layout === 'comparativo' ? arredondar(totalRealizado - totalPrevisto) : 0;
      const totalPercentual =
        layout === 'comparativo' ? calcularPercentual(totalPrevisto, totalRealizado) : null;
      const deveMostrarTotais = (showTotals ?? layout === 'comparativo') && linhasParaExibir.length > 0;

      const rodape =
        deveMostrarTotais
          ? layout === 'comparativo'
            ? [[
                totalLabel ?? 'Totais',
                formatCurrency(totalPrevisto),
                formatCurrency(totalRealizado),
                formatCurrency(totalDesvio),
                formatarPercentual(totalPercentual),
              ]]
            : [[totalLabel ?? 'Total', formatCurrency(totalRealizado)]]
          : undefined;

      autoTable(doc, {
        startY: posicaoAtual + 1,
        head: cabecalho,
        body: corpo,
        foot: rodape,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 0.8, halign: 'right', lineWidth: 0.1, lineColor: [0, 0, 0] },
        headStyles: {
          fillColor: tabelaAccentPdfColors[accent] ?? tabelaAccentPdfColors.azul,
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 7,
        },
        bodyStyles: { halign: 'right' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'left', cellWidth: layout === 'comparativo' ? 65 : 80 }
        },
        margin: { left: margemHorizontal, right: margemHorizontal },
        footStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [33, 37, 41], fontSize: 7 },
        tableLineWidth: 0.3,
        tableLineColor: [0, 0, 0],
      });

      posicaoAtual = (doc as any).lastAutoTable.finalY;
    };

    adicionarTabela('Gastos por Área', relatorio.gastos, {
      accent: 'amarelo',
      totalLabel: 'Total de Gastos',
    });

    adicionarTabela('Receitas por Categoria', relatorio.receitas, {
      accent: 'verde',
      totalLabel: 'Total de Receitas',
    });

    adicionarTabela('Saldo do dia (receitas - despesas)', linhasResultadoCaixa, {
      accent: 'laranja',
      showTotals: false,
    });

    adicionarTabela('Resumo Geral', linhasResumoGeral, {
      accent: 'azul',
      layout: 'realizado',
      showTotals: false,
    });

    adicionarTabela('Saldos Bancários', relatorio.bancos, {
      accent: 'cinza',
      layout: 'realizado',
      totalLabel: 'Total em Bancos',
      showTotals: true,
    });

    return doc;
  }, [relatorio, linhasResultadoCaixa, linhasResumoGeral]);

  const handleExportPdf = useCallback(() => {
    if (!relatorio) {
      alert('Nenhum relatório disponível para exportar.');
      return;
    }

    const doc = gerarDocumentoPdf();
    if (!doc) {
      alert('Não foi possível gerar o PDF. Tente novamente.');
      return;
    }

    const nomeArquivo = `Saldo_Diario_${relatorio.data.replace(/-/g, '')}.pdf`;
    doc.save(nomeArquivo);
  }, [gerarDocumentoPdf, relatorio]);

  const handleAbrirModalEmail = () => {
    setFeedbackEmail(null);
    if (!emailDestino && usuario?.usr_email) {
      setEmailDestino(usuario.usr_email);
    }
    setEmailModalAberto(true);
  };

  const handleEnviarEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!relatorio) {
      setFeedbackEmail('Nenhum relatório disponível para envio.');
      return;
    }
    if (!emailDestino.trim()) {
      setFeedbackEmail('Informe um destinatário para continuar.');
      return;
    }

    try {
      setEnviandoEmail(true);
      setFeedbackEmail(null);

      const doc = gerarDocumentoPdf();
      if (!doc) {
        throw new Error('Não foi possível gerar o documento.');
      }

      const nomeArquivo = `Saldo_Diario_${relatorio.data.replace(/-/g, '')}.pdf`;
      const blob = doc.output('blob');
      const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' });

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };

      if (nav.canShare && nav.share && nav.canShare({ files: [arquivo] })) {
        await nav.share({
          files: [arquivo],
          title: 'Saldo Diário',
          text: emailMensagem || 'Segue relatório de saldo diário.',
        });
        setEmailModalAberto(false);
        return;
      }

      doc.save(nomeArquivo);

      const assunto = encodeURIComponent('Relatório - Saldo Diário');
      const corpo = encodeURIComponent(
        `${emailMensagem || 'Segue relatório de saldo diário.'}\n\nO arquivo foi baixado automaticamente e pode ser anexado ao e-mail.`,
      );
      window.location.href = `mailto:${encodeURIComponent(emailDestino)}?subject=${assunto}&body=${corpo}`;

      setEmailModalAberto(false);
    } catch (error) {
      console.error('Erro ao preparar envio por e-mail:', error);
      setFeedbackEmail('Não foi possível preparar o envio. Tente novamente em instantes.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleAbrirModalRegistro = () => {
    if (!relatorio) {
      alert('Nenhum relatório disponível para registrar.');
      return;
    }
    setResultadoRegistro(null);
    setModalRegistroAberto(true);
  };

  const handleRegistrarSaldo = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!usuario || !relatorio) {
      setResultadoRegistro('Não foi possível identificar os dados necessários para o registro.');
      return;
    }

    try {
      setRegistrandoSaldo(true);
      setResultadoRegistro(null);

      const supabase = getSupabaseClient();

      // Chama a função de registro que já existe
      await registrarSaldoDiario(supabase, usuario, dataReferencia, relatorio.resumo);

      setResultadoRegistro(
        `Saldo registrado com sucesso para ${formatarDataPt(dataReferencia)}!\n\nSaldo Inicial: ${formatCurrency(relatorio.resumo.saldoInicialRealizado)}\nSaldo Final: ${formatCurrency(relatorio.resumo.saldoFinalRealizado)}`
      );

      // Recarregar o relatório após o registro
      setTimeout(() => {
        carregarRelatorio(usuario, dataReferencia);
        setModalRegistroAberto(false);
      }, 2000);
    } catch (error) {
      console.error('Erro ao registrar saldo:', error);
      setResultadoRegistro(
        `Erro ao registrar saldo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
    } finally {
      setRegistrandoSaldo(false);
    }
  };

  if (carregandoUsuario) {
    return (
      <>
        <Header title="Saldo Diário" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Saldo Diário"
        subtitle={`Data selecionada: ${formatarDataPt(dataReferencia)}`}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={dataReferencia}
              onChange={(event) => setDataReferencia(event.target.value)}
              max={toISODate(new Date())}
            />
            <Button
              variant="secondary"
              onClick={handleAbrirModalRegistro}
              disabled={carregandoDados || !relatorio}
            >
              Registrar Saldo
            </Button>
            <Button
              variant="secondary"
              onClick={handleAbrirModalEmail}
              disabled={!relatorio || carregandoDados}
            >
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

        {alertaAuditoria && !erro && (
          <Card variant="warning" title="Auditoria não registrada">
            <p className="text-sm text-warning-800">{alertaAuditoria}</p>
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

            <div className="report-grid report-grid--two">
              {renderTabelaComparativa('Gastos por Área', relatorio.gastos, {
                accent: 'amarelo',
                totalLabel: 'Total de Gastos',
                inverterCores: true,
              })}
              {renderTabelaComparativa('Receitas por Categoria', relatorio.receitas, {
                accent: 'verde',
                totalLabel: 'Total de Receitas',
              })}
            </div>

            <div className="mt-6">
              {renderTabelaComparativa('Saldo do dia (receitas - despesas)', linhasResultadoCaixa, {
                accent: 'laranja',
                showTotals: false,
              })}
            </div>

            <div className="report-grid report-grid--two mt-6">
              {renderTabelaComparativa('Resumo Geral', linhasResumoGeral, {
                accent: 'azul',
                layout: 'realizado',
                showTotals: false,
              })}
              {renderTabelaComparativa('Saldos Bancários', relatorio.bancos, {
                accent: 'cinza',
                layout: 'realizado',
                totalLabel: 'Total em Bancos',
                showTotals: true,
              })}
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
        onClose={() => {
          if (!enviandoEmail) {
            setEmailModalAberto(false);
          }
        }}
        title="Enviar relatório por e-mail"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEmailModalAberto(false)}
              disabled={enviandoEmail}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="email-share-form"
              variant="primary"
              loading={enviandoEmail}
              disabled={enviandoEmail}
            >
              Preparar envio
            </Button>
          </div>
        }
      >
        <form id="email-share-form" onSubmit={handleEnviarEmail} className="space-y-4">
          <Input
            label="Destinatário"
            type="email"
            value={emailDestino}
            onChange={(event) => setEmailDestino(event.target.value)}
            placeholder="usuario@empresa.com.br"
            required
          />
          <Textarea
            label="Mensagem"
            value={emailMensagem}
            onChange={(event) => setEmailMensagem(event.target.value)}
            placeholder="Mensagem opcional para acompanhar o relatório."
            rows={4}
          />
          <p className="text-xs text-gray-500">
            O relatório será gerado em PDF. Se o navegador não suportar compartilhamento direto, o arquivo será baixado
            automaticamente para anexar ao e-mail.
          </p>
          {feedbackEmail && <p className="text-sm text-error-600">{feedbackEmail}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={modalRegistroAberto}
        onClose={() => {
          if (!registrandoSaldo) {
            setModalRegistroAberto(false);
          }
        }}
        title="Registrar Saldo Diário"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalRegistroAberto(false)}
              disabled={registrandoSaldo}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="registrar-saldo-form"
              variant="primary"
              loading={registrandoSaldo}
              disabled={registrandoSaldo}
            >
              Registrar
            </Button>
          </div>
        }
      >
        <form id="registrar-saldo-form" onSubmit={handleRegistrarSaldo} className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Você está prestes a registrar o saldo diário para <strong>{formatarDataPt(dataReferencia)}</strong>.
            </p>

            {relatorio && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-1">
                <p className="text-sm text-blue-900">
                  <strong>Saldo Inicial:</strong> {formatCurrency(relatorio.resumo.saldoInicialRealizado)}
                </p>
                <p className="text-sm text-blue-900">
                  <strong>Receitas do Dia:</strong> {formatCurrency(relatorio.resumo.totalReceitasRealizadas)}
                </p>
                <p className="text-sm text-blue-900">
                  <strong>Despesas do Dia:</strong> {formatCurrency(relatorio.resumo.totalDespesasRealizadas)}
                </p>
                {relatorio.resumo.resgatesTotais > 0 && (
                  <p className="text-sm text-blue-900">
                    <strong>Resgate Aplicação:</strong> {formatCurrency(relatorio.resumo.resgatesTotais)}
                  </p>
                )}
                {relatorio.resumo.transferenciasTotais > 0 && (
                  <p className="text-sm text-blue-900">
                    <strong>Transferência para Aplicação:</strong> {formatCurrency(-relatorio.resumo.transferenciasTotais)}
                  </p>
                )}
                <p className="text-sm text-blue-900 font-bold border-t border-blue-300 pt-1 mt-1">
                  <strong>Saldo Final:</strong> {formatCurrency(relatorio.resumo.saldoFinalRealizado)}
                </p>
              </div>
            )}

            <p className="text-sm text-gray-700">
              Este registro será usado como base para cálculos futuros e relatórios históricos.
            </p>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                <strong>Importante:</strong> Certifique-se de que todos os lançamentos do dia estão corretos antes de registrar.
                Se já existir um registro para esta data, ele será atualizado com os valores atuais.
              </p>
            </div>
          </div>

          {resultadoRegistro && (
            <div
              className={`rounded-md p-3 ${
                resultadoRegistro.includes('sucesso')
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <p
                className={`text-sm whitespace-pre-line ${
                  resultadoRegistro.includes('sucesso') ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {resultadoRegistro}
              </p>
            </div>
          )}
        </form>
      </Modal>
    </>
  );
};

export default RelatorioSaldoDiarioPage;
