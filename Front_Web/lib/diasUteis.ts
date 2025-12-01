/**
 * Utilitário para cálculo de dias úteis
 * Considera apenas sábados e domingos como não úteis
 */

/**
 * Verifica se uma data é dia útil (não é sábado ou domingo)
 */
export function isDiaUtil(data: Date): boolean {
  const diaSemana = data.getDay();
  // 0 = Domingo, 6 = Sábado
  return diaSemana !== 0 && diaSemana !== 6;
}

/**
 * Obtém o último dia útil a partir de uma data
 * Se a data fornecida for dia útil, retorna ela mesma
 * Se não, retorna o dia útil anterior
 */
export function getUltimoDiaUtil(dataReferencia: Date = new Date()): Date {
  const data = new Date(dataReferencia);
  data.setHours(0, 0, 0, 0);

  while (!isDiaUtil(data)) {
    data.setDate(data.getDate() - 1);
  }

  return data;
}

/**
 * Obtém os últimos N dias úteis a partir de uma data de referência
 * Retorna um array de datas em ordem decrescente (mais recente primeiro)
 */
export function getUltimosDiasUteis(quantidade: number, dataReferencia: Date = new Date()): Date[] {
  const diasUteis: Date[] = [];
  let data = new Date(dataReferencia);
  data.setHours(0, 0, 0, 0);

  while (diasUteis.length < quantidade) {
    if (isDiaUtil(data)) {
      diasUteis.push(new Date(data));
    }
    data.setDate(data.getDate() - 1);
  }

  return diasUteis;
}

/**
 * Verifica se uma data está dentro dos últimos N dias úteis
 */
export function isDataDentroUltimosDiasUteis(
  data: Date,
  quantidade: number,
  dataReferencia: Date = new Date()
): boolean {
  const dataNormalizada = new Date(data);
  dataNormalizada.setHours(0, 0, 0, 0);

  const ultimosDias = getUltimosDiasUteis(quantidade, dataReferencia);

  return ultimosDias.some(diaUtil => {
    const diaUtilNormalizado = new Date(diaUtil);
    diaUtilNormalizado.setHours(0, 0, 0, 0);
    return diaUtilNormalizado.getTime() === dataNormalizada.getTime();
  });
}

/**
 * Formata uma data para o formato ISO (YYYY-MM-DD) usado no banco
 */
export function formatDateToISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Formata uma data para o formato brasileiro (DD/MM/YYYY)
 */
export function formatDateToBR(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Converte string ISO para Date
 */
export function parseISODate(dateString: string): Date {
  const [ano, mes, dia] = dateString.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Obtém a data de hoje no formato ISO
 */
export function getHojeISO(): string {
  return formatDateToISO(new Date());
}

/**
 * Obtém o último dia útil no formato ISO
 */
export function getUltimoDiaUtilISO(): string {
  return formatDateToISO(getUltimoDiaUtil());
}
