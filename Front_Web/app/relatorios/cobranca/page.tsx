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

type PrevisaoCobrancaRow = {
  pvi_tipo?: unknown;
  pvi_valor?: unknown;
  pvi_ctr_id?: unknown;
  pvi_ban_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_nome?: unknown } | null>;
};

type CobrancaRow = {
  cob_valor?: unknown;
  cob_ctr_id?: unknown;
  cob_ban_id?: unknown;
  cob_tpr_id?: unknown;
  ctr_contas_receita?: MaybeArray<{ ctr_nome?: unknown; ctr_codigo?: unknown } | null>;
  ban_bancos?: MaybeArray<{ ban_nome?: unknown } | null>;
  tpr_tipos_receita?: MaybeArray<{ tpr_nome?: unknown } | null>;
};

type LinhaConta = {
  chave: string;
  conta: string;
  banco: string;
  previsto: number;
  realizado: number;
  desvio: number;
};

type LinhaBanco = {
  chave: string;
  banco: string;
  previsto: number;
  realizado: number;
  desvio: number;
};

type LinhaTipo = {
  chave: string;
  tipo: string;
  realizado: number;
};

type RelatorioCobranca = {
  data: string;
  contas: LinhaConta[];
  bancos: LinhaBanco[];
  tipos: LinhaTipo[];
  totalPrevisto: number;
  totalRealizado: number;
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

const montarTituloConta = (conta: { ctr_nome?: unknown; ctr_codigo?: unknown } | null | undefined): string => {
  const codigo = conta?.ctr_codigo ? toString(conta.ctr_codigo) : '';
  const nome = conta?.ctr_nome ? toString(conta.ctr_nome) : 'Conta não informada';
  if (!codigo) {
    return nome;
  }
  return `${codigo} • ${nome}`;
};

const montarTituloBanco = (banco: { ban_nome?: unknown } | null | undefined): string =>
  banco?.ban_nome ? toString(banco.ban_nome) : 'Banco não informado';
const RelatorioCobrancaPage: React.FC = () => {
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [carregandoUsuario, setCarregandoUsuario] = useState(true);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioCobranca | null>(null);
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
      console.error('Erro ao carregar usuário para o relatório de cobrança:', error);
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

        const [previsoesRes, cobrancasRes] = await Promise.all([
          supabase
            .from('pvi_previsao_itens')
            .select(
              'pvi_tipo, pvi_valor, pvi_ctr_id, pvi_ban_id, ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome), tpr_tipos_receita(tpr_nome)'
            )
            .eq('pvi_data', data),
          supabase
            .from('cob_cobrancas')
            .select(
              'cob_valor, cob_ctr_id, cob_ban_id, cob_tpr_id, ctr_contas_receita(ctr_nome, ctr_codigo), ban_bancos(ban_nome), tpr_tipos_receita(tpr_nome)'
            )
            .eq('cob_data', data),
        ]);

        if (previsoesRes.error) throw previsoesRes.error;
        if (cobrancasRes.error) throw cobrancasRes.error;

        const previsoes = normalizeRelation(previsoesRes.data as MaybeArray<PrevisaoCobrancaRow>);
        const cobrancas = normalizeRelation(cobrancasRes.data as MaybeArray<CobrancaRow>);

        const mapaContas = new Map<
          string,
          { conta: string; banco: string; previsto: number; realizado: number }
        >();
        const mapaBancos = new Map<string, { banco: string; previsto: number; realizado: number }>();
        const mapaTipos = new Map<string, { tipo: string; realizado: number }>();

        previsoes.forEach((item) => {
          const tipo = toString(item.pvi_tipo).toLowerCase();
          if (tipo !== 'receita') {
            return;
          }
          const valor = arredondar(toNumber(item.pvi_valor));
          if (valor === 0) {
            return;
          }
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0] ?? null;
          const bancoRel = normalizeRelation(item.ban_bancos)[0] ?? null;
          const contaTitulo = montarTituloConta(contaRel);
          const bancoTitulo = montarTituloBanco(bancoRel);
          const contaId = toString(item.pvi_ctr_id, 'sem-conta');
          const bancoId = toString(item.pvi_ban_id, 'sem-banco');
          const chave = `${contaId}-${bancoId}`;
          const existente = mapaContas.get(chave) ?? {
            conta: contaTitulo,
            banco: bancoTitulo,
            previsto: 0,
            realizado: 0,
          };
          existente.previsto += valor;
          mapaContas.set(chave, existente);

          const chaveBanco = `${bancoId}-${bancoTitulo.toLowerCase()}`;
          const bancoExistente = mapaBancos.get(chaveBanco) ?? {
            banco: bancoTitulo,
            previsto: 0,
            realizado: 0,
          };
          bancoExistente.previsto += valor;
          mapaBancos.set(chaveBanco, bancoExistente);
        });

        cobrancas.forEach((item) => {
          const valor = arredondar(toNumber(item.cob_valor));
          if (valor === 0) {
            return;
          }
          const contaRel = normalizeRelation(item.ctr_contas_receita)[0] ?? null;
          const bancoRel = normalizeRelation(item.ban_bancos)[0] ?? null;
          const tipoRel = normalizeRelation(item.tpr_tipos_receita)[0] ?? null;
          const contaTitulo = montarTituloConta(contaRel);
          const bancoTitulo = montarTituloBanco(bancoRel);
          const contaId = toString(item.cob_ctr_id, 'sem-conta');
          const bancoId = toString(item.cob_ban_id, 'sem-banco');
          const chave = `${contaId}-${bancoId}`;
          const existente = mapaContas.get(chave) ?? {
            conta: contaTitulo,
            banco: bancoTitulo,
            previsto: 0,
            realizado: 0,
          };
          existente.realizado += valor;
          mapaContas.set(chave, existente);

          const chaveBanco = `${bancoId}-${bancoTitulo.toLowerCase()}`;
          const bancoExistente = mapaBancos.get(chaveBanco) ?? {
            banco: bancoTitulo,
            previsto: 0,
            realizado: 0,
          };
          bancoExistente.realizado += valor;
          mapaBancos.set(chaveBanco, bancoExistente);

          const tipoNome = tipoRel?.tpr_nome ? toString(tipoRel.tpr_nome) : 'Tipo não informado';
          const chaveTipo = tipoNome.toLowerCase();
          const tipoExistente = mapaTipos.get(chaveTipo) ?? { tipo: tipoNome, realizado: 0 };
          tipoExistente.realizado += valor;
          mapaTipos.set(chaveTipo, tipoExistente);
        });

        const contas: LinhaConta[] = Array.from(mapaContas.entries())
          .map(([chave, item]) => ({
            chave,
            conta: item.conta,
            banco: item.banco,
            previsto: arredondar(item.previsto),
            realizado: arredondar(item.realizado),
            desvio: arredondar(item.realizado - item.previsto),
          }))
          .sort((a, b) => b.realizado - a.realizado || b.previsto - a.previsto);

        const bancos: LinhaBanco[] = Array.from(mapaBancos.entries())
          .map(([chave, item]) => ({
            chave,
            banco: item.banco,
            previsto: arredondar(item.previsto),
            realizado: arredondar(item.realizado),
            desvio: arredondar(item.realizado - item.previsto),
          }))
          .sort((a, b) => b.realizado - a.realizado || b.previsto - a.previsto);

        const tipos: LinhaTipo[] = Array.from(mapaTipos.entries())
          .map(([chave, item]) => ({ chave, tipo: item.tipo, realizado: arredondar(item.realizado) }))
          .sort((a, b) => b.realizado - a.realizado || a.tipo.localeCompare(b.tipo, 'pt-BR'));

        const totalPrevisto = contas.reduce((total, item) => total + item.previsto, 0);
        const totalRealizado = contas.reduce((total, item) => total + item.realizado, 0);

        setRelatorio({
          data,
          contas,
          bancos,
          tipos,
          totalPrevisto: arredondar(totalPrevisto),
          totalRealizado: arredondar(totalRealizado),
        });
        setErro(null);
      } catch (error) {
        console.error('Erro ao carregar relatório de cobrança:', error);
        setRelatorio(null);
        setErro(
          traduzirErroSupabase(
            error,
            'Não foi possível carregar o relatório de cobrança para a data selecionada.',
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

  const nomeArquivoPdf = useMemo(() => {
    if (!relatorio) {
      return 'Relatorio_Cobranca.pdf';
    }
    return `Relatorio_Cobranca_${relatorio.data}.pdf`;
  }, [relatorio]);

  const bancoDestaque = useMemo(() => {
    if (!relatorio) {
      return null;
    }
    return relatorio.bancos[0] ?? null;
  }, [relatorio]);
  const gerarDocumentoPdf = useCallback(() => {
    if (!relatorio) {
      return null;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('Relatório de Cobrança', 14, 18);
    doc.setFontSize(11);
    doc.text(`Data de referência: ${formatarDataPt(relatorio.data)}`, 14, 26);

    let yPos = 32;

    const adicionarSecao = (titulo: string) => {
      doc.setFontSize(12);
      doc.setTextColor(76, 29, 149);
      doc.text(titulo, 14, yPos);
      yPos += 4;
    };

    const gerarTabelaContasPdf = () => {
      adicionarSecao('Previsão x Recebimento por conta');
      autoTable(doc, {
        startY: yPos,
        head: [['Conta', 'Banco', 'Previsto', 'Recebido', 'Diferença']],
        body:
          relatorio.contas.length > 0
            ? relatorio.contas.map((linha) => [
                linha.conta,
                linha.banco,
                formatCurrency(linha.previsto),
                formatCurrency(linha.realizado),
                formatCurrency(linha.desvio),
              ])
            : [['Nenhuma conta encontrada', '—', '—', '—', '—']],
        foot:
          relatorio.contas.length > 0
            ? [[
                'Totais',
                '',
                formatCurrency(relatorio.totalPrevisto),
                formatCurrency(relatorio.totalRealizado),
                formatCurrency(relatorio.totalRealizado - relatorio.totalPrevisto),
              ]]
            : undefined,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [237, 233, 254], textColor: [76, 29, 149], fontStyle: 'bold' },
        footStyles: { fillColor: [245, 243, 255], textColor: [76, 29, 149], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 70, halign: 'left' },
          1: { cellWidth: 50, halign: 'left' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      yPos = finalY ? finalY + 6 : yPos + 28;
    };

    const gerarTabelaBancosPdf = () => {
      adicionarSecao('Resumo por banco');
      autoTable(doc, {
        startY: yPos,
        head: [['Banco', 'Previsto', 'Recebido', 'Diferença']],
        body:
          relatorio.bancos.length > 0
            ? relatorio.bancos.map((linha) => [
                linha.banco,
                formatCurrency(linha.previsto),
                formatCurrency(linha.realizado),
                formatCurrency(linha.desvio),
              ])
            : [['Nenhum banco encontrado', '—', '—', '—']],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [229, 231, 235], textColor: [55, 65, 81], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 80, halign: 'left' },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      yPos = finalY ? finalY + 6 : yPos + 24;
    };

    const gerarTabelaTiposPdf = () => {
      adicionarSecao('Recebimentos por tipo de receita');
      autoTable(doc, {
        startY: yPos,
        head: [['Tipo de receita', 'Recebido']],
        body:
          relatorio.tipos.length > 0
            ? relatorio.tipos.map((linha) => [linha.tipo, formatCurrency(linha.realizado)])
            : [['Nenhum tipo informado', '—']],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [236, 253, 245], textColor: [22, 101, 52], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 90, halign: 'left' },
          1: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      });

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
      yPos = finalY ? finalY + 6 : yPos + 20;
    };

    gerarTabelaContasPdf();
    gerarTabelaBancosPdf();
    gerarTabelaTiposPdf();

    return doc;
  }, [relatorio]);

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
        title: 'Relatório de Cobrança',
        text: `Relatório de cobrança - ${formatarDataPt(relatorio.data)}`,
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

        const assunto = `Relatório de Cobrança - ${formatarDataPt(relatorio.data)}`;
        const corpo = encodeURIComponent(
          [
            `Segue o relatório de cobrança referente a ${formatarDataPt(relatorio.data)}.`,
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
        <Header title="Relatório - Cobrança" />
        <div className="page-content flex h-80 items-center justify-center">
          <Loading text="Carregando informações do relatório..." />
        </div>
      </>
    );
  }
  return (
    <>
      <Header
        title="Relatório - Cobrança"
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
            <Loading text="Consolidando lançamentos de cobrança..." />
          </div>
        )}

        {relatorio && !carregandoDados && (
          <div className="report-wrapper">
            <div className="report-header">
              <div>
                <p className="report-header__title">Recebimento Diário de Cobrança</p>
                <p className="report-header__subtitle">Data de referência: {formatarDataPt(relatorio.data)}</p>
              </div>
            </div>

            <div className="report-metrics">
              <div className="report-metric">
                <span className="report-metric__label">Total previsto</span>
                <span className="report-metric__value text-slate-900">{formatCurrency(relatorio.totalPrevisto)}</span>
              </div>
              <div className="report-metric">
                <span className="report-metric__label">Total recebido</span>
                <span className="report-metric__value text-emerald-700">{formatCurrency(relatorio.totalRealizado)}</span>
                <span className="report-metric__subvalue">
                  Diferença: {formatCurrency(relatorio.totalRealizado - relatorio.totalPrevisto)}
                </span>
              </div>
              <div className="report-metric">
                <span className="report-metric__label">Banco destaque</span>
                <span className="report-metric__value text-indigo-700">
                  {bancoDestaque ? bancoDestaque.banco : 'Sem recebimentos'}
                </span>
                {bancoDestaque && (
                  <span className="report-metric__subvalue">
                    Recebido: {formatCurrency(bancoDestaque.realizado)}
                  </span>
                )}
              </div>
            </div>

            <div className="report-grid report-grid--two">
              {renderTabelaContas(relatorio.contas)}
              {renderTabelaBancos(relatorio.bancos)}
            </div>

            <div className="report-grid">
              {renderTabelaTipos(relatorio.tipos)}
            </div>
          </div>
        )}

        {!relatorio && !carregandoDados && !erro && (
          <Card variant="default" title="Nenhum dado encontrado">
            <p className="text-sm text-gray-600">
              Não localizamos lançamentos de cobrança para a data selecionada. Ajuste o filtro de data e tente novamente.
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
            O arquivo em PDF será gerado automaticamente. Caso o compartilhamento direto não esteja disponível, abriremos o
            Outlook Web com o e-mail preenchido e o arquivo salvo nos seus downloads.
          </p>
        </div>
      </Modal>
    </>
  );
};

const renderTabelaContas = (linhas: LinhaConta[]) => {
  const totalPrevisto = linhas.reduce((total, item) => total + item.previsto, 0);
  const totalRealizado = linhas.reduce((total, item) => total + item.realizado, 0);
  const totalDesvio = arredondar(totalRealizado - totalPrevisto);

  return (
    <div className="report-section report-section--roxo">
      <div className="report-section__header">
        <span>Previsão x Recebimento por conta</span>
      </div>
      <table className="report-section__table">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Banco</th>
            <th>Previsto</th>
            <th>Recebido</th>
            <th>Diferença</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={5} className="report-section__empty-cell">
                Nenhum lançamento previsto para a data.
              </td>
            </tr>
          ) : (
            linhas.map((linha) => (
              <tr key={linha.chave}>
                <td>{linha.conta}</td>
                <td>{linha.banco}</td>
                <td>{formatCurrency(linha.previsto)}</td>
                <td>{formatCurrency(linha.realizado)}</td>
                <td className={linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
                  {formatCurrency(linha.desvio)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {linhas.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={2}>Totais</td>
              <td>{formatCurrency(arredondar(totalPrevisto))}</td>
              <td>{formatCurrency(arredondar(totalRealizado))}</td>
              <td className={totalDesvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
                {formatCurrency(totalDesvio)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

const renderTabelaBancos = (linhas: LinhaBanco[]) => {
  return (
    <div className="report-section report-section--cinza">
      <div className="report-section__header">
        <span>Resumo por banco</span>
      </div>
      <table className="report-section__table report-section__table--compact">
        <thead>
          <tr>
            <th>Banco</th>
            <th>Previsto</th>
            <th>Recebido</th>
            <th>Diferença</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={4} className="report-section__empty-cell">
                Nenhum banco com recebimentos nesta data.
              </td>
            </tr>
          ) : (
            linhas.map((linha) => (
              <tr key={linha.chave}>
                <td>{linha.banco}</td>
                <td>{formatCurrency(linha.previsto)}</td>
                <td>{formatCurrency(linha.realizado)}</td>
                <td className={linha.desvio >= 0 ? 'report-value--positivo' : 'report-value--negativo'}>
                  {formatCurrency(linha.desvio)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const renderTabelaTipos = (linhas: LinhaTipo[]) => (
  <div className="report-section report-section--verde">
    <div className="report-section__header">
      <span>Recebimentos por tipo de receita</span>
    </div>
    <table className="report-section__table report-section__table--compact">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Recebido</th>
        </tr>
      </thead>
      <tbody>
        {linhas.length === 0 ? (
          <tr>
            <td colSpan={2} className="report-section__empty-cell">
              Nenhum recebimento registrado por tipo nesta data.
            </td>
          </tr>
        ) : (
          linhas.map((linha) => (
            <tr key={linha.chave}>
              <td>{linha.tipo}</td>
              <td>{formatCurrency(linha.realizado)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default RelatorioCobrancaPage;
