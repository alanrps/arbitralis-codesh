import { describe, expect, it } from 'vitest';
import { maskPhone, maskText } from '../api/shared/mask.js';

describe('maskPhone', () => {
  it('mantém apenas os últimos 4 dígitos visíveis', () => {
    expect(maskPhone('+5511999998888')).toBe('+*********8888');
  });

  it('mascara completamente números muito curtos', () => {
    expect(maskPhone('123')).toBe('***');
  });
});

describe('maskText', () => {
  it('nunca retorna o texto original, só o tamanho', () => {
    const text = 'Quero negociar minha dívida';
    const masked = maskText(text);
    expect(masked).not.toContain(text);
    expect(masked).toBe(`<${text.length} chars omitidos>`);
  });
});
