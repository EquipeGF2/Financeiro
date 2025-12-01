/**
 * Página de Administração - Liberação de Períodos
 * Permite liberar períodos fechados para digitação no saldo diário
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout';
import { Button, Card, Loading } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getUserSession } from '@/lib/userSession';
import { traduzirErroSupabase } from '@/lib/supabaseErrors';
import { formatDateToBR, parseISODate } from '@/lib/diasUteis';

interface PeriodoLiberado {
  per_id: number;
  per_data_inicio: string;
  per_data_fim: string;
  per_motivo: string | null;
  per_ativo: boolean;
  per_criado_em: string;
}

export default function PeriodosLiberadosPage() {
  const [periodos, setPeriodos] = useState<PeriodoLiberado[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarPeriodos();
  }, []);

  const carregarPeriodos = async () => {
    try {
      setLoading(true);
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('per_periodos_liberados')
        .select('*')
        .order('per_data_inicio', { ascending: false });

      if (error) throw error;
      setPeriodos(data || []);
    } catch (error) {
      console.error('Erro ao carregar períodos:', error);
      alert(traduzirErroSupabase(error, 'Erro ao carregar períodos'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dataInicio || !dataFim) {
      alert('Por favor, preencha as datas de início e fim');
      return;
    }

    if (dataInicio > dataFim) {
      alert('A data de início não pode ser maior que a data de fim');
      return;
    }

    try {
      setSalvando(true);
      const supabase = getSupabaseClient();
      const { userId } = getUserSession();

      const { error } = await supabase
        .from('per_periodos_liberados')
        .insert({
          per_data_inicio: dataInicio,
          per_data_fim: dataFim,
          per_motivo: motivo || null,
          per_ativo: true,
          per_usr_id: userId,
        });

      if (error) throw error;

      alert('Período liberado com sucesso!');
      setModalOpen(false);
      setDataInicio('');
      setDataFim('');
      setMotivo('');
      await carregarPeriodos();
    } catch (error) {
      console.error('Erro ao liberar período:', error);
      alert(traduzirErroSupabase(error, 'Erro ao liberar período'));
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (periodo: PeriodoLiberado) => {
    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('per_periodos_liberados')
        .update({ per_ativo: !periodo.per_ativo })
        .eq('per_id', periodo.per_id);

      if (error) throw error;

      await carregarPeriodos();
    } catch (error) {
      console.error('Erro ao atualizar período:', error);
      alert(traduzirErroSupabase(error, 'Erro ao atualizar período'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este período?')) return;

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('per_periodos_liberados')
        .delete()
        .eq('per_id', id);

      if (error) throw error;

      await carregarPeriodos();
    } catch (error) {
      console.error('Erro ao excluir período:', error);
      alert(traduzirErroSupabase(error, 'Erro ao excluir período'));
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              Liberação de Períodos
            </h1>
            <p className="text-gray-600 mt-2">
              Libere períodos fechados para permitir digitação no saldo diário
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            Liberar Período
          </Button>
        </div>

        <Card>
          {periodos.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum período liberado. Clique em "Liberar Período" para começar.
            </div>
          ) : (
            <div className="space-y-4">
              {periodos.map((periodo) => (
                <div
                  key={periodo.per_id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    periodo.per_ativo
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-gray-800">
                        {formatDateToBR(parseISODate(periodo.per_data_inicio))} até{' '}
                        {formatDateToBR(parseISODate(periodo.per_data_fim))}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          periodo.per_ativo
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-400 text-white'
                        }`}
                      >
                        {periodo.per_ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {periodo.per_motivo && (
                      <p className="text-gray-600 mt-2">
                        <span className="font-medium">Motivo:</span> {periodo.per_motivo}
                      </p>
                    )}
                    <p className="text-gray-500 text-sm mt-1">
                      Criado em: {new Date(periodo.per_criado_em).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => toggleAtivo(periodo)}
                      className={
                        periodo.per_ativo
                          ? 'bg-yellow-600 hover:bg-yellow-700'
                          : 'bg-green-600 hover:bg-green-700'
                      }
                    >
                      {periodo.per_ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      onClick={() => handleDelete(periodo.per_id)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Modal de Novo Período */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Liberar Novo Período
              </h2>

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data Início *
                    </label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data Fim *
                    </label>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo
                    </label>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex: Lançamentos retroativos devido a feriado"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      setDataInicio('');
                      setDataFim('');
                      setMotivo('');
                    }}
                    className="flex-1 bg-gray-500 hover:bg-gray-600"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={salvando}
                    className="flex-1"
                  >
                    {salvando ? 'Salvando...' : 'Liberar'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
