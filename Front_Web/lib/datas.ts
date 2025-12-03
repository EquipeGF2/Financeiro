export const toISODate = (date: Date): string => date.toISOString().split('T')[0];

export const gerarIntervaloDatas = (inicio: string, fim: string): string[] => {
  if (!inicio) return [];

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
