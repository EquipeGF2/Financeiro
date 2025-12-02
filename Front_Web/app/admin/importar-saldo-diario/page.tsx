'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

import { Header } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { ConfirmModal } from '@/components/ui/Modal';
import Toast from '@/components/ui/Toast';
import { getUserSession } from '@/lib/userSession';

type LinhaPlanilha = Record<string, string | number | undefined>;

type LinhaProcessada = {
  id: string;
  dataBruta: string;
  dataISO: string | null;
  saldoInicial: number;
  saldoFinal: number;
  observacao: string;
  valida: boolean;
  mensagem?: string;
};

type Mapeamento = {
  data: string;
  saldoInicial: string;
  saldoFinal: string;
  observacao?: string;
};

type ResultadoImportacao = {
  success: boolean;
  sucesso: number;
  erro: number;
  total: number;
  erros?: string[];
  error?: string;
};

const converterDataExcel = (valor: string | number | undefined): { original: string; iso: string | null } => {
  if (valor === undefined || valor === null) return { original: '', iso: null };

  if (typeof valor === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const msPerDay = 86_400_000;
    const data = new Date(excelEpoch.getTime() + valor * msPerDay);
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const ano = data.getFullYear();
    return { original: `${dia}/${mes}/${ano}`, iso: data.toISOString().split('T')[0] };
  }

  const texto = String(valor).trim();
  const match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, dia, mes, ano] = match;
    const iso = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    return { original: texto, iso };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { original: texto, iso: texto };
  }

  return { original: texto, iso: null };
};

const sugerirColuna = (colunas: string[], termos: string[]): string => {
  const normalizado = colunas.map((c) => c.toLowerCase());
  for (const termo of termos) {
    const idx = normalizado.findIndex((c) => c.includes(termo));
    if (idx !== -1) return colunas[idx];
  }
  return '';
};

export default function ImportarSaldoDiarioPage() {
  const session = getUserSession();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [colunasDisponiveis, setColunasDisponiveis] = useState<string[]>([]);
  const [linhasBrutas, setLinhasBrutas] = useState<LinhaPlanilha[]>([]);
  const [linhasProcessadas, setLinhasProcessadas] = useState<LinhaProcessada[]>([]);
  const [processando, setProcessando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);
  const [confirmacao, setConfirmacao] = useState({
    aberto: false,
    mensagem: '',
    onConfirm: () => {},
  });

  const [mapeamento, setMapeamento] = useState<Mapeamento>({
    data: '',
    saldoInicial: '',
    saldoFinal: '',
    observacao: '',
  });

  const linhasValidas = useMemo(() => linhasProcessadas.filter((linha) => linha.valida), [linhasProcessadas]);

  const lerPlanilha = async (file: File) => {
    setProcessando(true);
    setResultado(null);
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const linhas = XLSX.utils.sheet_to_json<LinhaPlanilha>(sheet, { defval: '' });
      const cabecalho = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] as string[];
      setLinhasBrutas(linhas);
      setColunasDisponiveis(cabecalho);

      const sugestaoMapeamento: Mapeamento = {
        data: sugerirColuna(cabecalho, ['data', 'dia', 'registro']),
        saldoInicial: sugerirColuna(cabecalho, ['saldo_inicial', 'inicial', 'saldo ini']),
        saldoFinal: sugerirColuna(cabecalho, ['saldo_final', 'final']),
        observacao: sugerirColuna(cabecalho, ['obs', 'observacao', 'observação', 'descricao']),
      };

      setMapeamento(sugestaoMapeamento);
    } catch (error: any) {
      setToast({ message: `Erro ao ler arquivo: ${error.message}`, type: 'error' });
    } finally {
      setProcessando(false);
    }
  };

  const processarLinhas = useCallback((mapeamentoAtual: Mapeamento) => {
    if (!mapeamentoAtual.data || !mapeamentoAtual.saldoInicial || !mapeamentoAtual.saldoFinal) {
      setLinhasProcessadas([]);
      return;
    }

    const linhas = linhasBrutas.map((linha, index) => {
      const { original: dataBruta, iso: dataISO } = converterDataExcel(linha[mapeamentoAtual.data]);
      const saldoInicial = Number(linha[mapeamentoAtual.saldoInicial] ?? 0);
      const saldoFinal = Number(linha[mapeamentoAtual.saldoFinal] ?? 0);
      const observacao = linha[mapeamentoAtual.observacao || ''] as string;

      const validaData = Boolean(dataISO);
      const validaSaldo = Number.isFinite(saldoInicial) && Number.isFinite(saldoFinal);
      const valida = validaData && validaSaldo;

      return {
        id: `linha-${index}`,
        dataBruta,
        dataISO,
        saldoInicial: Number.isFinite(saldoInicial) ? saldoInicial : 0,
        saldoFinal: Number.isFinite(saldoFinal) ? saldoFinal : 0,
        observacao: observacao ? String(observacao) : '',
        valida,
        mensagem: !valida
          ? !validaData
            ? 'Data inválida'
            : 'Saldo inicial/final inválido'
          : undefined,
      } as LinhaProcessada;
    });

    setLinhasProcessadas(linhas);
  }, [linhasBrutas]);

  useEffect(() => {
    if (linhasBrutas.length > 0 && mapeamento.data && mapeamento.saldoInicial && mapeamento.saldoFinal) {
      processarLinhas(mapeamento);
    }
  }, [linhasBrutas.length, mapeamento, processarLinhas]);

  const handleArquivoSelecionado = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArquivo(file);
    lerPlanilha(file);
  };

  const handleImportar = async () => {
    if (session.userName?.toUpperCase() !== 'GENARO') {
      setToast({ message: 'Apenas o usuário Genaro pode importar saldos diários.', type: 'error' });
      return;
    }

    if (linhasValidas.length === 0) {
      setToast({ message: 'Nenhuma linha válida para importar.', type: 'warning' });
      return;
    }

    setConfirmacao({
      aberto: true,
      mensagem: `Deseja importar ${linhasValidas.length} linhas? Registros existentes serão atualizados.`,
      onConfirm: async () => {
        setImportando(true);
        setConfirmacao((prev) => ({ ...prev, aberto: false }));
        try {
          const response = await fetch('/api/admin/importar-saldo-diario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.userId,
              userName: session.userName,
              linhas: linhasValidas.map((linha) => ({
                data: linha.dataISO,
                saldoInicial: linha.saldoInicial,
                saldoFinal: linha.saldoFinal,
                observacao: linha.observacao,
              })),
            }),
          });

          const resultado = (await response.json()) as ResultadoImportacao;

          if (!response.ok) {
            throw new Error(resultado.error || 'Erro ao importar.');
          }

          setResultado(resultado);
          setToast({ message: 'Importação concluída.', type: 'success' });
          setArquivo(null);
          setLinhasBrutas([]);
          setLinhasProcessadas([]);
          setMapeamento({ data: '', saldoInicial: '', saldoFinal: '', observacao: '' });
          const input = document.getElementById('file-input') as HTMLInputElement;
          if (input) input.value = '';
        } catch (error: any) {
          setResultado({ success: false, sucesso: 0, erro: 0, total: 0, error: error.message });
          setToast({ message: `Erro ao importar: ${error.message}`, type: 'error' });
        } finally {
          setImportando(false);
        }
      },
    });
  };

  return (
    <>
      <Header
        title="Importar Saldo Diário"
        subtitle="Faça upload de planilha com saldo inicial e final de cada dia"
      />

      <div className="page-content space-y-6">
        {session.userName?.toUpperCase() !== 'GENARO' && (
          <Card title="⚠️ Permissão Necessária" variant="danger">
            <p className="text-error-700">
              Apenas o usuário <strong>Genaro</strong> pode importar saldos diários.
            </p>
          </Card>
        )}

        <Card title="📥 Passo 1: Carregar Planilha">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Utilize um arquivo Excel ou CSV contendo as colunas abaixo. Você poderá mapear os nomes das colunas
              antes de importar.
            </p>
            <div className="flex items-center gap-4">
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleArquivoSelecionado}
                disabled={processando || session.userName?.toUpperCase() !== 'GENARO'}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer disabled:opacity-50"
              />
            </div>
            {arquivo && (
              <p className="text-sm text-gray-700">
                ✅ <strong>{arquivo.name}</strong> pronto para mapeamento
              </p>
            )}
          </div>
        </Card>

        {colunasDisponiveis.length > 0 && (
          <Card title="🗺️ Passo 2: Mapeie as Colunas">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Coluna da Data</label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={mapeamento.data}
                  onChange={(e) => setMapeamento((prev) => ({ ...prev, data: e.target.value }))}
                >
                  <option value="">-- Selecione --</option>
                  {colunasDisponiveis.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Coluna Saldo Inicial</label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={mapeamento.saldoInicial}
                  onChange={(e) => setMapeamento((prev) => ({ ...prev, saldoInicial: e.target.value }))}
                >
                  <option value="">-- Selecione --</option>
                  {colunasDisponiveis.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Coluna Saldo Final</label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={mapeamento.saldoFinal}
                  onChange={(e) => setMapeamento((prev) => ({ ...prev, saldoFinal: e.target.value }))}
                >
                  <option value="">-- Selecione --</option>
                  {colunasDisponiveis.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Coluna Observação (opcional)</label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={mapeamento.observacao}
                  onChange={(e) => setMapeamento((prev) => ({ ...prev, observacao: e.target.value }))}
                >
                  <option value="">-- Não usar --</option>
                  {colunasDisponiveis.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-sm text-gray-600 mt-3">
              Nomes recomendados na planilha: <code>Data</code>, <code>Saldo_Inicial</code>, <code>Saldo_Final</code>,
              <code>Observacao</code>.
            </p>
          </Card>
        )}

        {linhasProcessadas.length > 0 && (
          <Card title="🔍 Passo 3: Conferência dos Dados">
            <div className="flex flex-wrap gap-4 text-sm mb-3">
              <span className="px-3 py-2 bg-gray-100 rounded">Linhas totais: {linhasProcessadas.length}</span>
              <span className="px-3 py-2 bg-green-100 text-green-800 rounded">Válidas: {linhasValidas.length}</span>
              <span className="px-3 py-2 bg-red-100 text-red-700 rounded">
                Inválidas: {linhasProcessadas.length - linhasValidas.length}
              </span>
            </div>

            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Data (planilha)</th>
                    <th className="px-3 py-2 text-left">Data (ISO)</th>
                    <th className="px-3 py-2 text-right">Saldo Inicial</th>
                    <th className="px-3 py-2 text-right">Saldo Final</th>
                    <th className="px-3 py-2 text-left">Observação</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {linhasProcessadas.map((linha) => (
                    <tr key={linha.id} className={!linha.valida ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2">{linha.dataBruta}</td>
                      <td className="px-3 py-2">{linha.dataISO || '-'}</td>
                      <td className="px-3 py-2 text-right">{linha.saldoInicial.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right">{linha.saldoFinal.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2">{linha.observacao || '-'}</td>
                      <td className="px-3 py-2">
                        {linha.valida ? (
                          <span className="text-green-700">Pronto</span>
                        ) : (
                          <span className="text-red-700">{linha.mensagem}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-3">
              <Button
                variant="primary"
                disabled={importando || linhasValidas.length === 0 || session.userName?.toUpperCase() !== 'GENARO'}
                loading={importando}
                onClick={handleImportar}
              >
                Importar Saldo Diário
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setLinhasBrutas([]);
                  setLinhasProcessadas([]);
                  setArquivo(null);
                  setMapeamento({ data: '', saldoInicial: '', saldoFinal: '', observacao: '' });
                  const input = document.getElementById('file-input') as HTMLInputElement;
                  if (input) input.value = '';
                }}
                disabled={importando}
              >
                Limpar
              </Button>
            </div>
          </Card>
        )}

        {resultado && (
          <Card title={resultado.success ? '✅ Importação concluída' : '❌ Erro na importação'} variant={resultado.success ? 'success' : 'danger'}>
            {resultado.error ? (
              <p className="text-error-700">{resultado.error}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-xl font-bold text-blue-700">{resultado.total}</div>
                  <div className="text-sm text-blue-700">Total de linhas</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-xl font-bold text-green-700">{resultado.sucesso}</div>
                  <div className="text-sm text-green-700">Importadas</div>
                </div>
                <div className="bg-red-50 p-3 rounded">
                  <div className="text-xl font-bold text-red-700">{resultado.erro}</div>
                  <div className="text-sm text-red-700">Com erro</div>
                </div>
              </div>
            )}
            {resultado.erros && resultado.erros.length > 0 && (
              <ul className="mt-3 text-sm text-red-700 list-disc ml-4 space-y-1">
                {resultado.erros.map((erro, idx) => (
                  <li key={idx}>{erro}</li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="📄 Template recomendado">
          <div className="space-y-3 text-sm text-gray-700">
            <p>Monte a planilha com as colunas abaixo (uma linha por dia):</p>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Data</strong> (DD/MM/AAAA ou YYYY-MM-DD)</li>
              <li><strong>Saldo_Inicial</strong> (valor consolidado do dia anterior)</li>
              <li><strong>Saldo_Final</strong> (valor após movimentações do dia)</li>
              <li><strong>Observacao</strong> (opcional, comentários sobre ajustes)</li>
            </ul>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-right">Saldo_Inicial</th>
                    <th className="px-3 py-2 text-right">Saldo_Final</th>
                    <th className="px-3 py-2 text-left">Observacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-3 py-2">01/02/2025</td>
                    <td className="px-3 py-2 text-right">1.500.000,00</td>
                    <td className="px-3 py-2 text-right">1.620.000,00</td>
                    <td className="px-3 py-2">Saldo final consolidado do dia</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">02/02/2025</td>
                    <td className="px-3 py-2 text-right">1.620.000,00</td>
                    <td className="px-3 py-2 text-right">1.580.000,00</td>
                    <td className="px-3 py-2">Ajuste por aplicação/receita</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmModal
        isOpen={confirmacao.aberto}
        title="Confirmar importação"
        message={confirmacao.mensagem}
        onConfirm={confirmacao.onConfirm}
        onClose={() => setConfirmacao((prev) => ({ ...prev, aberto: false }))}
      />
    </>
  );
}
