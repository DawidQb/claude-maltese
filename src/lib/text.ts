/** Strips diacritics so "hobz" matches "ħobż" and "zolty" matches "żółty". */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ħ/g, 'h')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
