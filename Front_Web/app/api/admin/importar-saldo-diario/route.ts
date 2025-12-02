import { NextRequest, NextResponse } from 'next/server';

import { getOrCreateUser, getSupabaseServer } from '@/lib/supabaseClient';
import { isAdminUserName } from '@/lib/userSession';

type LinhaSaldoDiario = {
  data: string | null;
  saldoInicial: number;
  saldoFinal: number;
  observacao?: string;
};

const converterData = (valor: string | null): string | null => {
  if (!valor) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;

  const match = valor.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, dia, mes, ano] = match;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userName, linhas } = body as {
      userId?: string;
      userName?: string;
      linhas: LinhaSaldoDiario[];
    };

    if (!userId) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
    }

    if (!isAdminUserName(userName)) {
      return NextResponse.json({ error: 'Apenas os usuários Genaro e Angelo têm permissão' }, { status: 403 });
    }

    if (!linhas || linhas.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha informada' }, { status: 400 });
    }

    const supabase = getSupabaseServer({ userId });
    const { data: usuario, error: erroUsuario } = await getOrCreateUser(supabase, userId, userName);

    if (erroUsuario || !usuario) {
      return NextResponse.json({ error: 'Não foi possível identificar o usuário' }, { status: 400 });
    }

    let sucesso = 0;
    let erro = 0;
    const erros: string[] = [];

    for (const linha of linhas) {
      try {
        const dataISO = converterData(linha.data ?? '');
        if (!dataISO) {
          erro++;
          erros.push(`Data inválida: "${linha.data}"`);
          continue;
        }

        const saldoInicial = Number(linha.saldoInicial ?? 0);
        const saldoFinal = Number(linha.saldoFinal ?? 0);

        if (!Number.isFinite(saldoInicial) || !Number.isFinite(saldoFinal)) {
          erro++;
          erros.push(`Valores inválidos para a data ${dataISO}`);
          continue;
        }

        const { data: registroExistente, error: erroBusca } = await supabase
          .from('sdd_saldo_diario')
          .select('sdd_criado_em')
          .eq('sdd_data', dataISO)
          .maybeSingle();

        if (erroBusca) throw erroBusca;

        const { error: erroUpsert } = await supabase
          .from('sdd_saldo_diario')
          .upsert(
            {
              sdd_data: dataISO,
              sdd_saldo_inicial: saldoInicial,
              sdd_saldo_final: saldoFinal,
              sdd_observacao: linha.observacao ?? null,
              sdd_descricao: 'Importação administrativa',
              sdd_usr_id: usuario.usr_id,
              ...(registroExistente?.sdd_criado_em ? { sdd_criado_em: registroExistente.sdd_criado_em } : {}),
            },
            { onConflict: 'sdd_data' },
          );

        if (erroUpsert) throw erroUpsert;
        sucesso++;
      } catch (err: any) {
        console.error('[IMPORTAR SALDO DIARIO] Erro:', err);
        erro++;
        erros.push(err.message || 'Erro desconhecido ao importar linha');
      }
    }

    return NextResponse.json({ success: erro === 0, sucesso, erro, total: linhas.length, erros });
  } catch (error) {
    console.error('[IMPORTAR SALDO DIARIO] Erro geral:', error);
    return NextResponse.json(
      { error: 'Não foi possível importar o saldo diário' },
      { status: 500 },
    );
  }
}
