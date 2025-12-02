'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { Header } from '@/components/layout';
import { Card, Input, Loading } from '@/components/ui';
import { carregarExtratoAplicacao, ExtratoAplicacao } from '@/lib/aplicacao';
import { gerarIntervaloDatas } from '@/lib/datas';
import { formatCurrency } from '@/lib/mathParser';
import { getSupabaseClient } from '@/lib/supabaseClient';

const formatarDataCurta = (iso: string) => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

const badgeClassPorTipo = (tipo: 'aplicacao' | 'resgate') =>
  tipo === 'aplicacao'
    ? 'inline-flex rounded-full bg-error-50 px-3 py-1 text-xs font-semibold text-error-700'
    : 'inline-flex rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700';

const AplicacaoRelatorioPage: React.FC = () => {
  const hoje = useMemo(() => new Date(), []);
  const [inicio, setInicio] = useState(() => {
    const data = new Date(hoje);
    data.setDate(data.getDate() - 6);
    return data.toISOString().split('T')[0];
  });
  const [fim, setFim] = useState(() => hoje.toISOString().split('T')[0]);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<ExtratoAplicacao | null>(null);

  useEffect(() => {
    const carregar = async () => {
      if (!inicio || !fim) return;
      try {
        setCarregando(true);
        setErro(null);
        const supabase = getSupabaseClient();
        const dadosExtrato = await carregarExtratoAplicacao(supabase, inicio, fim);
        setExtrato(dadosExtrato);
      } catch (error) {
        console.error('Erro ao carregar extrato da aplicação:', error);
        setErro('Não foi possível carregar o acompanhamento da aplicação para o período.');
      } finally {
        setCarregando(false);
      }
    };

    void carregar();
  }, [inicio, fim]);

  const intervalo = useMemo(() => gerarIntervaloDatas(inicio, fim), [inicio, fim]);

  return (
    <>
      <Header
        title="Saldo de Aplicação"
        subtitle="Acompanhe o saldo inicial, as movimentações diárias e o saldo final da aplicação"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              type="date"
              label="Início"
              value={inicio}
              onChange={(event) => {
                const valor = event.target.value;
                setInicio(valor);
                if (valor && valor > fim) {
                  setFim(valor);
                }
              }}
            />
            <Input
              type="date"
              label="Fim"
              value={fim}
              min={inicio}
              onChange={(event) => setFim(event.target.value)}
            />
            <div className="text-sm text-gray-500">Período com {intervalo.length} dia(s)</div>
          </div>
        }
      />

      <div className="page-content space-y-6">
        {erro && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{erro}</div>}

        {carregando ? (
          <div className="flex justify-center py-10">
            <Loading text="Consolidando movimentação de aplicação..." />
          </div>
        ) : extrato ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card title="Saldo inicial do período" subtitle={formatCurrency(extrato.saldoInicial)}>
                <p className="text-sm text-gray-500">
                  Considera o saldo registrado em {formatarDataCurta(extrato.dataBase ?? inicio)} e ajustes até o início do
                  período.
                </p>
              </Card>
              <Card title="Total aplicado" subtitle={formatCurrency(extrato.totalAplicacoes)}>
                <p className="text-sm text-gray-500">Transferências ou pagamentos direcionados para a aplicação.</p>
              </Card>
              <Card title="Total resgatado" subtitle={formatCurrency(extrato.totalResgates)}>
                <p className="text-sm text-gray-500">Entradas provenientes de resgates de aplicação.</p>
              </Card>
              <Card title="Saldo final" subtitle={formatCurrency(extrato.saldoFinal)}>
                <p className="text-sm text-gray-500">Saldo consolidado ao final do período selecionado.</p>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card
                title="Movimentação diária"
                subtitle="Demonstrativo por dia com aplicações, resgates e saldo final"
                variant="primary"
              >
                <div className="overflow-auto">
                  <table className="min-w-full text-sm text-gray-700">
                    <thead className="border-b text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-right">Aplicação</th>
                        <th className="px-3 py-2 text-right">Resgate</th>
                        <th className="px-3 py-2 text-right">Saldo final</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {extrato.saldosDiarios.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-center text-sm text-gray-500" colSpan={4}>
                            Nenhum movimento de aplicação encontrado para o período.
                          </td>
                        </tr>
                      ) : (
                        extrato.saldosDiarios.map((item) => (
                          <tr key={item.data}>
                            <td className="px-3 py-2">{formatarDataCurta(item.data)}</td>
                            <td className="px-3 py-2 text-right text-error-600">
                              {item.aplicadoNoDia === 0 ? '-' : formatCurrency(item.aplicadoNoDia)}
                            </td>
                            <td className="px-3 py-2 text-right text-success-700">
                              {item.resgatadoNoDia === 0 ? '-' : formatCurrency(item.resgatadoNoDia)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800">
                              {formatCurrency(item.saldoFinal)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card
                title="Extrato da aplicação"
                subtitle="Lista de lançamentos que alteraram o saldo no período"
                variant="default"
              >
                <div className="overflow-auto">
                  <table className="min-w-full text-sm text-gray-700">
                    <thead className="border-b text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-center">Tipo</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                        <th className="px-3 py-2 text-right">Saldo após</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {extrato.movimentos.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-center text-sm text-gray-500" colSpan={5}>
                            Nenhuma movimentação de aplicação encontrada neste período.
                          </td>
                        </tr>
                      ) : (
                        extrato.movimentos.map((movimento, index) => (
                          <tr key={`${movimento.data}-${index}`}>
                            <td className="px-3 py-2">{formatarDataCurta(movimento.data)}</td>
                            <td className="px-3 py-2">{movimento.descricao}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={badgeClassPorTipo(movimento.tipo)}>
                                {movimento.tipo === 'aplicacao' ? 'Aplicação' : 'Resgate'}
                              </span>
                            </td>
                            <td
                              className={`px-3 py-2 text-right ${
                                movimento.tipo === 'aplicacao' ? 'text-error-600' : 'text-success-700'
                              }`}
                            >
                              {formatCurrency(movimento.valor)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800">
                              {formatCurrency(movimento.saldoApos ?? extrato.saldoInicial)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-800">
            Nenhum dado de aplicação encontrado para o período selecionado.
          </div>
        )}
      </div>
    </>
  );
};

export default AplicacaoRelatorioPage;
