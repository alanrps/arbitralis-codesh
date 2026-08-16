export function maskPhone(phone: string): string {
  const hasPlus = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '');

  if (digits.length <= 4) {
    return '*'.repeat(digits.length);
  }

  const visible = digits.slice(-4);
  const masked = '*'.repeat(digits.length - 4);
  return `${hasPlus ? '+' : ''}${masked}${visible}`;
}

export function maskText(text: string): string {
  return `<${text.length} chars omitidos>`;
}
