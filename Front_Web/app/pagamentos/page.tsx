'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Header } from '@/components/layout';
import { Button, Card, Input, Loading } from '@/components/ui';
import { carregarExtratoAplicacao, ExtratoAplicacao } from '@/lib/aplicacao';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient } from '@/lib/supabaseClient';

interface PagamentoAreaRow {
  pag_data: string;
  pag_valor: number;
  pag_are_id: number | null;
  are_areas: { are_nome?: string | null } | { are_nome?: string | null }[] | null;
}

interface PagamentoBancoRow {
  pbk_data: string;
  pbk_valor: number;
  pbk_ban_id: number | null;
  ban_bancos: { ban_nome?: string | null } | { ban_nome?: string | null }[] | null;
}

interface SaldoBancoRow {
  sdb_data: string;
  sdb_saldo: number;
  sdb_ban_id: number | null;
  ban_bancos: { ban_nome?: string | null } | { ban_nome?: string | null }[] | null;
}

interface ReceitaRow {
  rec_data: string;
  rec_valor: number;
  ctr_contas_receita:
    | { ctr_nome?: string | null }
    | { ctr_nome?: string | null }[]
    | null;
}

interface SerieLinha {
  name: string;
  values: number[];
  color: string;
}

const coresPadrao = [
  '#dc2626',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#0ea5e9',
  '#fb7185',
  '#ea580c',
  '#0f766e',
  '#9333ea',
];

const toISODate = (date: Date): string => date.toISOString().split('T')[0];

const formatarMoedaCompacta = (valor: number): string => {
  const absoluto = Math.abs(valor);
  if (absoluto >= 1_000_000) {
    const base = valor / 1_000_000;
    const casas = absoluto >= 10_000_000 ? 0 : 1;
    return `R$ ${base.toFixed(casas)}M`;
  }
  if (absoluto >= 1_000) {
    const base = valor / 1_000;
    const casas = absoluto >= 100_000 ? 0 : 1;
    return `R$ ${base.toFixed(casas)}k`;
  }
  return formatCurrency(valor);
};

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

const formatarDataCurta = (iso: string): string => {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
};

const normalizarNome = (valor: unknown, fallback: string): string => {
  if (typeof valor === 'string' && valor.trim().length > 0) {
    return valor.trim();
  }
  return fallback;
};

const normalizarComparacao = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const AREAS_EXCLUIDAS = ['TRANSFERENCIA APLICACAO'];

const extrairRelacao = <T,>(valor: T | T[] | null | undefined): T | null => {
  if (!valor) {
    return null;
  }
  return Array.isArray(valor) ? valor[0] ?? null : valor;
};

const DonutChart: React.FC<{
  data: { name: string; value: number; color: string }[];
  titulo: string;
}> = ({ data, titulo }) => {
  const total = data.reduce((acc, item) => acc + item.value, 0);
  if (total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-full border border-dashed border-gray-200 text-sm text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  let acumulado = 0;
  const partes = data
    .map((item) => {
      const inicio = (acumulado / total) * 100;
      acumulado += item.value;
      const fim = (acumulado / total) * 100;
      return `${item.color} ${inicio}% ${fim}%`;
    })
    .join(', ');

  return (
    <div className="relative mx-auto h-56 w-56 sm:h-64 sm:w-64">
      <div
        className="absolute inset-0 rounded-full shadow-inner"
        style={{ background: `conic-gradient(${partes})` }}
      />
      <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white text-center shadow">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</span>
        <span className="text-lg font-semibold text-gray-900">{formatCurrency(total)}</span>
      </div>
    </div>
  );
};

const SimpleLineChart: React.FC<{
  labels: string[];
  series: SerieLinha[];
  legenda?: boolean;
  yLabelFormatter?: (valor: number) => string;
}> = ({ labels, series, legenda = true, yLabelFormatter = formatCurrency }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(900);
  const [chartPixelSize, setChartPixelSize] = useState({ width: 900, height: 320 });
  const [pontoAtivo, setPontoAtivo] = useState<{
    x: number;
    y: number;
    label: string;
    valor: number;
    serie: string;
    cor: string;
  } | null>(null);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setChartWidth(Math.max(entry.contentRect.width, 320));
    });

    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const atualizarTamanho = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        setChartPixelSize({ width: rect.width, height: rect.height });
      }
    };
    atualizarTamanho();
    const observer = new ResizeObserver(atualizarTamanho);
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [chartWidth]);

  const width = chartWidth;
  const height = 360;
  const paddingX = 64;
  const paddingY = 32;
  const passoX = labels.length > 1 ? (width - paddingX * 2) / (labels.length - 1) : 0;
  const valores = series.flatMap((serie) => serie.values);
  const maxValor = valores.length ? Math.max(...valores) : 0;

  const stepLabels = Math.max(1, Math.ceil(labels.length / 10));

  // Arredondar para valores inteiros limpos (10k, 50k, 100k, 250k, etc)
  const arredondarParaValorLimpo = (valor: number): number => {
    if (valor === 0) return 100000;
    if (valor <= 100000) return Math.ceil(valor / 10000) * 10000;
    if (valor <= 500000) return Math.ceil(valor / 50000) * 50000;
    if (valor <= 1000000) return Math.ceil(valor / 100000) * 100000;
    return Math.ceil(valor / 250000) * 250000;
  };

  const maxValorArredondado = arredondarParaValorLimpo(maxValor);
  const escalaY = maxValorArredondado > 0 ? (height - paddingY * 2) / maxValorArredondado : 0;

  // Determinar intervalo do eixo Y baseado no valor máximo arredondado
  const determinarIntervaloY = (valorMax: number): number => {
    if (valorMax <= 100000) return 10000;
    if (valorMax <= 500000) return 50000;
    if (valorMax <= 1000000) return 100000;
    return 250000;
  };

  const intervaloY = determinarIntervaloY(maxValorArredondado);
  const numPassosY = maxValorArredondado > 0 ? Math.floor(maxValorArredondado / intervaloY) + 1 : 1;

  const posicaoTooltip = pontoAtivo
    ? {
        left: (pontoAtivo.x / width) * chartPixelSize.width,
        top: (pontoAtivo.y / height) * chartPixelSize.height,
      }
    : null;

  return (
    <div className="w-full space-y-3" ref={containerRef}>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-80 w-full max-w-full"
          preserveAspectRatio="xMinYMin meet"
          onMouseLeave={() => setPontoAtivo(null)}
        >
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke="#d1d5db"
          strokeWidth={1}
        />
        <line
          x1={paddingX}
          y1={paddingY}
          x2={paddingX}
          y2={height - paddingY}
          stroke="#d1d5db"
          strokeWidth={1}
        />
        {Array.from({ length: numPassosY }, (_, i) => i).map((step) => {
          const valor = step * intervaloY;
          const fracao = maxValorArredondado > 0 ? valor / maxValorArredondado : 0;
          const y = height - paddingY - fracao * (height - paddingY * 2);
          return (
            <g key={step}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 6}
                y={y + 4}
                textAnchor="end"
                className="text-[13px] fill-gray-600 font-medium"
              >
                {yLabelFormatter(valor)}
              </text>
            </g>
          );
        })}
        {series.map((serie) => {
          const pontos = serie.values.map((valor, index) => {
            const x = paddingX + passoX * index;
            const y = maxValorArredondado > 0 ? height - paddingY - valor * escalaY : height - paddingY;
            return `${x},${y}`;
          });
          return (
            <g key={serie.name}>
              <polyline
                points={pontos.join(' ')}
                fill="none"
                stroke={serie.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {serie.values.map((valor, index) => {
                const x = paddingX + passoX * index;
                const y = maxValorArredondado > 0 ? height - paddingY - valor * escalaY : height - paddingY;
                return (
                  <circle
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${serie.name}-${index}`}
                    cx={x}
                    cy={y}
                    r={3.5}
                    fill={serie.color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    onMouseEnter={() =>
                      setPontoAtivo({
                        x,
                        y,
                        valor,
                        label: labels[index],
                        serie: serie.name,
                        cor: serie.color,
                      })
                    }
                  />
                );
              })}
            </g>
          );
        })}
        {labels.map((label, index) => {
          if (index !== labels.length - 1 && index % stepLabels !== 0) {
            return null;
          }
          const x = paddingX + passoX * index;
          return (
            <text
              // eslint-disable-next-line react/no-array-index-key
              key={`${label}-${index}`}
              x={x}
              y={height - paddingY + 20}
              textAnchor="middle"
              className="text-[13px] fill-gray-600 font-medium"
            >
              {label}
            </text>
          );
        })}
        </svg>

        {pontoAtivo && posicaoTooltip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${posicaoTooltip.left}px`,
              top: `${Math.max(posicaoTooltip.top - 12, 8)}px`,
            }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: pontoAtivo.cor }}
              />
              <span className="font-semibold text-gray-800">{pontoAtivo.serie}</span>
            </div>
            <div className="text-gray-600">{pontoAtivo.label}</div>
            <div className="font-semibold text-gray-900">{yLabelFormatter(pontoAtivo.valor)}</div>
          </div>
        )}
      </div>
      {legenda && (
        <div className="flex flex-wrap gap-3">
          {series.map((serie) => (
            <span key={serie.name} className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: serie.color }}
              />
              {serie.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const PagamentosPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    return toISODate(inicio);
  });
  const [periodoFim, setPeriodoFim] = useState(() => toISODate(hoje));
  const [filtroInicio, setFiltroInicio] = useState(() => periodoInicio);
  const [filtroFim, setFiltroFim] = useState(() => periodoFim);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoAplicacao, setCarregandoAplicacao] = useState(true);
  const [erroAplicacao, setErroAplicacao] = useState<string | null>(null);

  const [pagamentosArea, setPagamentosArea] = useState<PagamentoAreaRow[]>([]);
  const [pagamentosBanco, setPagamentosBanco] = useState<PagamentoBancoRow[]>([]);
  const [saldosBanco, setSaldosBanco] = useState<SaldoBancoRow[]>([]);
  const [receitas, setReceitas] = useState<ReceitaRow[]>([]);
  const [extratoAplicacao, setExtratoAplicacao] = useState<ExtratoAplicacao | null>(null);

  const [areasSelecionadas, setAreasSelecionadas] = useState<string[]>([]);
  const [bancosSelecionados, setBancosSelecionados] = useState<string[]>([]);

  useEffect(() => {
    const carregarDados = async () => {
      if (!periodoInicio || !periodoFim) {
        return;
      }
      try {
        setCarregando(true);
        setErro(null);
        const supabase = getSupabaseClient();

        const [pagAreaRes, pagBancoRes, saldosRes, receitasRes] = await Promise.all([
          supabase
            .from('pag_pagamentos_area')
            .select('pag_data, pag_valor, pag_are_id, are_areas(are_nome)')
            .gte('pag_data', periodoInicio)
            .lte('pag_data', periodoFim),
          supabase
            .from('pbk_pagamentos_banco')
            .select('pbk_data, pbk_valor, pbk_ban_id, ban_bancos(ban_nome)')
            .gte('pbk_data', periodoInicio)
            .lte('pbk_data', periodoFim),
          supabase
            .from('sdb_saldo_banco')
            .select('sdb_data, sdb_saldo, sdb_ban_id, ban_bancos(ban_nome)')
            .gte('sdb_data', periodoInicio)
            .lte('sdb_data', periodoFim),
          supabase
            .from('rec_receitas')
            .select('rec_data, rec_valor, ctr_contas_receita(ctr_nome)')
            .gte('rec_data', periodoInicio)
            .lte('rec_data', periodoFim),
        ]);

        if (pagAreaRes.error) throw pagAreaRes.error;
        if (pagBancoRes.error) throw pagBancoRes.error;
        if (saldosRes.error) throw saldosRes.error;
        if (receitasRes.error) throw receitasRes.error;

        setPagamentosArea((pagAreaRes.data as PagamentoAreaRow[] | null) ?? []);
        setPagamentosBanco((pagBancoRes.data as PagamentoBancoRow[] | null) ?? []);
        setSaldosBanco((saldosRes.data as SaldoBancoRow[] | null) ?? []);
        setReceitas((receitasRes.data as ReceitaRow[] | null) ?? []);
      } catch (error) {
        console.error('Erro ao carregar pagamentos:', error);
        setErro('Não foi possível carregar as informações para o período selecionado.');
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [periodoInicio, periodoFim]);

  useEffect(() => {
    const carregarAplicacao = async () => {
      if (!periodoInicio || !periodoFim) return;
      try {
        setCarregandoAplicacao(true);
        setErroAplicacao(null);
        const supabase = getSupabaseClient();
        const extrato = await carregarExtratoAplicacao(supabase, periodoInicio, periodoFim);
        setExtratoAplicacao(extrato);
      } catch (error) {
        console.error('Erro ao carregar saldo de aplicação:', error);
        setErroAplicacao('Não foi possível consolidar o saldo de aplicação para o período.');
        setExtratoAplicacao(null);
      } finally {
        setCarregandoAplicacao(false);
      }
    };

    void carregarAplicacao();
  }, [periodoInicio, periodoFim]);

  const intervaloDatas = useMemo(
    () => gerarIntervaloDatas(periodoInicio, periodoFim),
    [periodoInicio, periodoFim],
  );

  const intervaloFiltro = useMemo(
    () => gerarIntervaloDatas(filtroInicio, filtroFim),
    [filtroInicio, filtroFim],
  );

  const pagamentosAreaFiltrados = useMemo(() => {
    return pagamentosArea.filter((item) => {
      const relacao = extrairRelacao(item.are_areas);
      const nome = normalizarNome(relacao?.are_nome, 'Área não informada');
      const chaveComparacao = normalizarComparacao(nome);
      return !AREAS_EXCLUIDAS.some((area) => area === chaveComparacao);
    });
  }, [pagamentosArea]);

  const resumoAreas = useMemo(() => {
    const mapa = new Map<string, number>();
    pagamentosAreaFiltrados.forEach((item) => {
      const relacao = extrairRelacao(item.are_areas);
      const nome = normalizarNome(relacao?.are_nome, 'Área não informada');
      const valor = Number(Number(item.pag_valor ?? 0).toFixed(2));
      mapa.set(nome, Number(((mapa.get(nome) ?? 0) + valor).toFixed(2)));
    });
    const itens = Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((acc, item) => acc + item.valor, 0);
    return { itens, total };
  }, [pagamentosAreaFiltrados]);

  const resumoBancos = useMemo(() => {
    const mapa = new Map<string, number>();
    pagamentosBanco.forEach((item) => {
      const relacao = extrairRelacao(item.ban_bancos);
      const nome = normalizarNome(relacao?.ban_nome, 'Banco não informado');
      const valor = Number(Number(item.pbk_valor ?? 0).toFixed(2));
      mapa.set(nome, Number(((mapa.get(nome) ?? 0) + valor).toFixed(2)));
    });
    const itens = Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((acc, item) => acc + item.valor, 0);
    return { itens, total };
  }, [pagamentosBanco]);

  const mapaSaldosPorData = useMemo(() => {
    const mapa = new Map<string, Map<string, number>>();
    saldosBanco.forEach((item) => {
      const relacao = extrairRelacao(item.ban_bancos);
      const nome = normalizarNome(relacao?.ban_nome, 'Banco não informado');
      const valor = Number(item.sdb_saldo ?? 0);
      const mapaDia = mapa.get(item.sdb_data) ?? new Map<string, number>();
      mapaDia.set(nome, (mapaDia.get(nome) ?? 0) + valor);
      mapa.set(item.sdb_data, mapaDia);
    });
    return mapa;
  }, [saldosBanco]);

  const datasSaldosComValor = useMemo(() => {
    return intervaloDatas.filter((data) => {
      const mapaDia = mapaSaldosPorData.get(data);
      if (!mapaDia) return false;
      const totalDia = Array.from(mapaDia.values()).reduce((acc, valor) => acc + valor, 0);
      return Math.abs(totalDia) > 0.0001;
    });
  }, [intervaloDatas, mapaSaldosPorData]);

  const mapaPagamentosPorData = useMemo(() => {
    const mapa = new Map<string, Map<string, number>>();
    pagamentosAreaFiltrados.forEach((item) => {
      const relacao = extrairRelacao(item.are_areas);
      const nome = normalizarNome(relacao?.are_nome, 'Área não informada');
      const valor = Number(item.pag_valor ?? 0);
      const mapaDia = mapa.get(item.pag_data) ?? new Map<string, number>();
      mapaDia.set(nome, (mapaDia.get(nome) ?? 0) + valor);
      mapa.set(item.pag_data, mapaDia);
    });
    return mapa;
  }, [pagamentosAreaFiltrados]);

  const datasPagamentosComValor = useMemo(() => {
    return intervaloDatas.filter((data) => {
      const mapaDia = mapaPagamentosPorData.get(data);
      if (!mapaDia) return false;
      const totalDia = Array.from(mapaDia.values()).reduce((acc, valor) => acc + valor, 0);
      return Math.abs(totalDia) > 0.0001;
    });
  }, [intervaloDatas, mapaPagamentosPorData]);

  const chavesAreas = useMemo(() => resumoAreas.itens.map((item) => item.nome), [resumoAreas]);
  const chavesBancos = useMemo(() => resumoBancos.itens.map((item) => item.nome), [resumoBancos]);

  useEffect(() => {
    setAreasSelecionadas((atual) => {
      if (!chavesAreas.length) {
        return [];
      }
      if (atual.length === chavesAreas.length && atual.every((area) => chavesAreas.includes(area))) {
        return atual;
      }
      return chavesAreas;
    });
  }, [chavesAreas]);

  useEffect(() => {
    setBancosSelecionados((atual) => {
      if (!chavesBancos.length) {
        return [];
      }
      if (atual.length === chavesBancos.length && atual.every((banco) => chavesBancos.includes(banco))) {
        return atual;
      }
      return chavesBancos;
    });
  }, [chavesBancos]);

  const areaCores = useMemo(() => {
    const mapa = new Map<string, string>();
    chavesAreas.forEach((area, index) => {
      mapa.set(area, coresPadrao[index % coresPadrao.length]);
    });
    return mapa;
  }, [chavesAreas]);

  const bancoCores = useMemo(() => {
    const mapa = new Map<string, string>();
    chavesBancos.forEach((banco, index) => {
      mapa.set(banco, coresPadrao[index % coresPadrao.length]);
    });
    return mapa;
  }, [chavesBancos]);

  const pieAreasData = useMemo(() => {
    if (!resumoAreas.total) {
      return [];
    }
    return resumoAreas.itens.map((item, index) => ({
      name: item.nome,
      value: Number(item.valor.toFixed(2)),
      percentual: resumoAreas.total > 0 ? (item.valor / resumoAreas.total) * 100 : 0,
      color: coresPadrao[index % coresPadrao.length],
    }));
  }, [resumoAreas]);

  const pieBancosData = useMemo(() => {
    if (!resumoBancos.total) {
      return [];
    }
    return resumoBancos.itens.map((item, index) => ({
      name: item.nome,
      value: Number(item.valor.toFixed(2)),
      percentual: resumoBancos.total > 0 ? (item.valor / resumoBancos.total) * 100 : 0,
      color: coresPadrao[index % coresPadrao.length],
    }));
  }, [resumoBancos]);

  const linhasAreas: SerieLinha[] = useMemo(() => {
    if (!datasPagamentosComValor.length) return [];
    return areasSelecionadas.map((area) => {
      const color = areaCores.get(area) ?? coresPadrao[0];
      const values = datasPagamentosComValor.map((data) => {
        const mapaDia = mapaPagamentosPorData.get(data);
        return Number((mapaDia?.get(area) ?? 0).toFixed(2));
      });
      return { name: area, values, color };
    });
  }, [areasSelecionadas, areaCores, datasPagamentosComValor, mapaPagamentosPorData]);

  const linhasBancos: SerieLinha[] = useMemo(() => {
    if (!datasSaldosComValor.length) return [];
    return bancosSelecionados.map((banco) => {
      const color = bancoCores.get(banco) ?? coresPadrao[0];
      const values = datasSaldosComValor.map((data) => {
        const mapaDia = mapaSaldosPorData.get(data);
        return Number((mapaDia?.get(banco) ?? 0).toFixed(2));
      });
      return { name: banco, values, color };
    });
  }, [bancosSelecionados, bancoCores, datasSaldosComValor, mapaSaldosPorData]);

  const saldoBancarioFinal = useMemo(() => {
    if (!saldosBanco.length) return 0;

    const ultimoSaldoPorBanco = new Map<string, { data: string; valor: number }>();
    saldosBanco.forEach((item) => {
      const relacao = extrairRelacao(item.ban_bancos);
      const nome = normalizarNome(relacao?.ban_nome, 'Banco não informado');
      const dataAtual = ultimoSaldoPorBanco.get(nome)?.data;
      const valor = Number(Number(item.sdb_saldo ?? 0).toFixed(2));

      if (!dataAtual || item.sdb_data > dataAtual) {
        ultimoSaldoPorBanco.set(nome, { data: item.sdb_data, valor });
      }
    });

    return Array.from(ultimoSaldoPorBanco.values()).reduce((total, item) => total + item.valor, 0);
  }, [saldosBanco]);

  const movimentacaoAplicacao = useMemo(() => {
    const aplicacao = extratoAplicacao?.totalAplicacoes ?? 0;
    const resgate = extratoAplicacao?.totalResgates ?? 0;
    const subtotal = aplicacao - resgate;
    const saldoInicial = extratoAplicacao?.saldoInicial ?? 0;
    const saldoFinal = extratoAplicacao?.saldoFinal ?? saldoInicial - aplicacao + resgate;

    return {
      aplicacao,
      resgate,
      subtotal,
      saldoInicial,
      saldoFinal,
    };
  }, [extratoAplicacao]);

  const totalPagamentosPeriodo = useMemo(() => resumoAreas.total, [resumoAreas]);
  const totalPorBanco = useMemo(() => resumoBancos.total, [resumoBancos]);

  const aplicarPeriodo = () => {
    if (!filtroInicio) return;
    setPeriodoInicio(filtroInicio);
    setPeriodoFim(filtroFim || filtroInicio);
  };

  const handleToggleArea = (nome: string) => {
    setAreasSelecionadas((atual) => {
      if (atual.includes(nome)) {
        return atual.filter((item) => item !== nome);
      }
      return [...atual, nome];
    });
  };

  const handleToggleBanco = (nome: string) => {
    setBancosSelecionados((atual) => {
      if (atual.includes(nome)) {
        return atual.filter((item) => item !== nome);
      }
      return [...atual, nome];
    });
  };

  return (
    <>
      <Header
        title="Pagamentos"
        subtitle="Visualize desembolsos por área, acompanhe os bancos e monitore a evolução diária"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              type="date"
              label="Início"
              value={filtroInicio}
              onChange={(event) => {
                const valor = event.target.value;
                setFiltroInicio(valor);
                if (valor && valor > filtroFim) {
                  setFiltroFim(valor);
                }
              }}
            />
            <Input
              type="date"
              label="Fim"
              value={filtroFim}
              min={filtroInicio}
              onChange={(event) => setFiltroFim(event.target.value)}
            />
            <Button
              variant="primary"
              onClick={aplicarPeriodo}
              disabled={!filtroInicio || carregando}
              className="sm:ml-2"
            >
              Aplicar período
            </Button>
            <div className="text-sm text-gray-500">
              Prévia: {intervaloFiltro.length} dia(s) selecionado(s)
            </div>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && (
          <Card variant="danger" title="Não foi possível carregar os dados">
            <p className="text-sm text-error-700">{erro}</p>
          </Card>
        )}

        {carregando ? (
          <div className="flex justify-center py-12">
            <Loading text="Consolidando pagamentos do período..." />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <Card
                title="Pagamentos Realizados"
                subtitle={formatCurrency(totalPagamentosPeriodo)}
                variant="danger"
              >
                <p className="text-sm text-gray-600">
                  Valor consolidado das saídas registradas por área no período selecionado.
                </p>
              </Card>
              <Card
                title="Pagamentos por Banco"
                subtitle={formatCurrency(totalPorBanco)}
                variant="primary"
              >
                <p className="text-sm text-gray-600">
                  Total movimentado pelos bancos vinculados aos pagamentos registrados.
                </p>
              </Card>
              <Card
                title="Aplicação x Resgate"
                subtitle={formatCurrency(movimentacaoAplicacao.subtotal)}
                variant={movimentacaoAplicacao.subtotal <= 0 ? 'danger' : 'success'}
              >
                <p className="text-sm text-gray-600">
                  Diferença entre aplicações e resgates associados às áreas de investimento.
                </p>
              </Card>
              <Card title="Saldo Bancário Final" subtitle={formatCurrency(saldoBancarioFinal)}>
                <p className="text-sm text-gray-600">
                  Comparativo entre saldos de abertura e fechamento do período avaliado.
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card
                title="Movimentações de Aplicação"
                subtitle="Resumo das aplicações e resgates no período"
                variant="primary"
              >
                {carregandoAplicacao ? (
                  <div className="py-6">
                    <Loading text="Calculando saldo de aplicação..." />
                  </div>
                ) : erroAplicacao ? (
                  <p className="text-sm text-error-700">{erroAplicacao}</p>
                ) : (
                  <div className="space-y-6 text-sm text-gray-700">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 rounded-lg border border-gray-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Movimentação no período selecionado
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-600">Aplicação realizada</span>
                          <span className="font-semibold text-success-600">
                            {formatCurrency(movimentacaoAplicacao.aplicacao)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-600">Resgate aplicação</span>
                          <span className="font-semibold text-error-600">
                            {formatCurrency(movimentacaoAplicacao.resgate)}
                          </span>
                        </div>
                        <div
                          className={`mt-3 rounded-lg px-3 py-2 text-right font-semibold ${
                            movimentacaoAplicacao.subtotal >= 0
                              ? 'bg-success-50 text-success-700'
                              : 'bg-error-50 text-error-600'
                          }`}
                        >
                          Valor movimentado (subtotal): {formatCurrency(movimentacaoAplicacao.subtotal)}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border border-gray-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Saldo de aplicação ao final do período
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-600">Saldo inicial</span>
                          <span className="font-semibold text-gray-800">
                            {formatCurrency(movimentacaoAplicacao.saldoInicial)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-600">Valor movimentado</span>
                          <span
                            className={`font-semibold ${
                              movimentacaoAplicacao.subtotal >= 0
                                ? 'text-success-700'
                                : 'text-error-600'
                            }`}
                          >
                            {formatCurrency(movimentacaoAplicacao.subtotal)}
                          </span>
                        </div>
                        <div className="mt-3 rounded-lg bg-success-50 px-3 py-2 text-right font-semibold text-success-600">
                          Saldo final: {formatCurrency(movimentacaoAplicacao.saldoFinal)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card
                title="Pagamentos por Banco (Realizado)"
                subtitle="Distribuição dos desembolsos por instituição"
                variant="primary"
              >
                {pieBancosData.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma movimentação encontrada para o período.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <DonutChart
                      titulo="Total"
                      data={pieBancosData.map((item) => ({
                        name: item.name,
                        value: item.value,
                        color: item.color,
                      }))}
                    />
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm text-gray-700">
                        <thead className="border-b text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-2 py-1 text-left">Banco</th>
                            <th className="px-2 py-1 text-right">Valor</th>
                            <th className="px-2 py-1 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {pieBancosData.map((item) => (
                            <tr key={item.name}>
                              <td className="px-2 py-1">{item.name}</td>
                              <td className="px-2 py-1 text-right">{formatCurrency(item.value)}</td>
                              <td className="px-2 py-1 text-right">
                                {item.percentual.toFixed(1).replace('.', ',')}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t font-semibold text-gray-700">
                          <tr>
                            <td className="px-2 py-1">Total</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(totalPorBanco)}</td>
                            <td className="px-2 py-1 text-right">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card
                title="Gastos por Área (Realizado)"
                subtitle="Participação das áreas no total desembolsado"
                variant="danger"
              >
                {pieAreasData.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum pagamento encontrado para as áreas no período.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <DonutChart
                      titulo="Total"
                      data={pieAreasData.map((item) => ({
                        name: item.name,
                        value: item.value,
                        color: item.color,
                      }))}
                    />
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm text-gray-700">
                        <thead className="border-b text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-2 py-1 text-left">Área</th>
                            <th className="px-2 py-1 text-right">Valor</th>
                            <th className="px-2 py-1 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {pieAreasData.map((item) => (
                            <tr key={item.name}>
                              <td className="px-2 py-1">{item.name}</td>
                              <td className="px-2 py-1 text-right">{formatCurrency(item.value)}</td>
                              <td className="px-2 py-1 text-right">
                                {item.percentual.toFixed(1).replace('.', ',')}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t font-semibold text-gray-700">
                          <tr>
                            <td className="px-2 py-1">Total</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(totalPagamentosPeriodo)}</td>
                            <td className="px-2 py-1 text-right">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </Card>

              <Card
              title="Evolução Diária de Saldo por Banco (Realizado)"
              subtitle="Ative ou desative bancos para ajustar a visualização"
            >
              {chavesBancos.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum saldo encontrado para os bancos no período.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {chavesBancos.map((banco) => (
                      <Button
                        key={banco}
                        variant={bancosSelecionados.includes(banco) ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => handleToggleBanco(banco)}
                        className="whitespace-nowrap"
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: bancoCores.get(banco) ?? coresPadrao[0] }}
                        />
                        <span>{banco}</span>
                      </Button>
                    ))}
                  </div>
                    {linhasBancos.length === 0 || datasSaldosComValor.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                      Selecione ao menos um banco para visualizar a evolução dos saldos.
                    </div>
                  ) : (
                    <SimpleLineChart
                      labels={datasSaldosComValor.map((data) => formatarDataCurta(data))}
                      series={linhasBancos}
                      yLabelFormatter={formatarMoedaCompacta}
                    />
                  )}
                </div>
              )}
            </Card>
            </div>

            <Card
                title="Evolução Diária por Área de Despesa (Realizado)"
                subtitle="Selecione as áreas para comparar a tendência diária"
                variant="danger"
              >
                {chavesAreas.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma série disponível para o período informado.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {chavesAreas.map((area) => (
                        <Button
                          key={area}
                          variant={areasSelecionadas.includes(area) ? 'primary' : 'ghost'}
                          size="sm"
                          onClick={() => handleToggleArea(area)}
                          className="whitespace-nowrap"
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: areaCores.get(area) ?? coresPadrao[0] }}
                          />
                          <span>{area}</span>
                        </Button>
                      ))}
                    </div>
                    {linhasAreas.length === 0 || datasPagamentosComValor.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                        Selecione ao menos uma área para visualizar a evolução diária.
                      </div>
                    ) : (
                      <div className="w-full">
                        <SimpleLineChart
                          labels={datasPagamentosComValor.map((data) => formatarDataCurta(data))}
                          series={linhasAreas}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Card>
          </>
        )}
      </div>
    </>
  );
};

export default PagamentosPage;
