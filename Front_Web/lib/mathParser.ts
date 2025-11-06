/**
 * mathParser.ts
 * Parser e avaliador de expressões matemáticas simples
 * Suporta: +, -, *, /, parênteses
 */

/**
 * Avalia uma expressão matemática e retorna o resultado
 * @param expression - Expressão matemática como string (ex: "10+5*2")
 * @returns Resultado numérico ou null se inválida
 */
export function evaluateMath(expression: string): number | null {
  try {
    // Remove espaços em branco
    const clean = expression.trim().replace(/\s+/g, '');

    // Se for vazio, retorna null
    if (!clean) {
      return null;
    }

    // Se já for apenas um número, retorna ele
    const directNumber = parseFloat(clean);
    if (!isNaN(directNumber) && /^-?\d+\.?\d*$/.test(clean)) {
      return directNumber;
    }

    // Valida caracteres permitidos (números, operadores, parênteses, ponto decimal)
    if (!/^[0-9+\-*/(). ]+$/.test(clean)) {
      return null;
    }

    // Substitui operadores por versões seguras
    // Previne injeção de código
    const safe = clean
      .replace(/[^0-9+\-*/(). ]/g, '') // Remove qualquer caractere não permitido
      .replace(/\s/g, ''); // Remove espaços

    // Avalia a expressão usando Function (seguro pois validamos os caracteres)
    // Alternativa mais segura que eval()
    const result = new Function(`"use strict"; return (${safe})`)();

    // Verifica se o resultado é um número válido
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      // Arredonda para 2 casas decimais
      return Math.round(result * 100) / 100;
    }

    return null;
  } catch (error) {
    // Em caso de erro na avaliação, retorna null
    return null;
  }
}

/**
 * Formata um número para exibição monetária (BRL)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Formata um número para exibição simples com 2 casas decimais
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Tenta avaliar a expressão e retorna o resultado formatado
 * Útil para preview em tempo real
 */
export function previewMath(expression: string): string | null {
  const result = evaluateMath(expression);
  if (result === null) {
    return null;
  }
  return formatNumber(result);
}

/**
 * Valida se uma string é uma expressão matemática válida
 */
export function isValidMathExpression(expression: string): boolean {
  return evaluateMath(expression) !== null;
}
