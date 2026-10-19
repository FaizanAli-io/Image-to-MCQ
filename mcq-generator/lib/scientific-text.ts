const normal = '0123456789+-=()n';
const supers = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ';
const subs = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎';
const convert = (value: string, alphabet: string) => [...value].map(c => alphabet[normal.indexOf(c)] || c).join('');

/** Normalize explicit notation, not scientific meaning or numeric values. */
export function scientificText(input: string): string {
  let text = input.replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '')
    .replace(/\\(?:rightleftharpoons|leftrightharpoons|rightleftarrows|leftrightarrow)\b/g, '⇌')
    .replace(/\\(?:rightarrow|to)\b/g, '→').replace(/\\leftarrow\b/g, '←')
    .replace(/\\times\b/g, '×').replace(/\\cdot\b/g, '·')
    .replace(/\\(?:mu|micro)\b/g, 'µ').replace(/\\Delta\b/g, 'Δ')
    .replace(/\\circ\b/g, '°').replace(/\\(?:,|;|!|quad\b|qquad\b)/g, ' ')
    .replace(/<sup>(.*?)<\/sup>/gi, (_, s) => convert(s, supers))
    .replace(/<sub>(.*?)<\/sub>/gi, (_, s) => convert(s, subs))
    .replace(/\^\{([^{}]+)\}|\^([+-]?\d+[+-]?|[n°])/g, (_, a, b) => convert(a || b, supers))
    .replace(/_\{([^{}]+)\}|_(\d+)/g, (_, a, b) => convert(a || b, subs));
  for (let i = 0; i < 4; i++) text = text.replace(/\\(?:mathrm|text|ce|operatorname)\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/<=>|<->/g, '⇌').replace(/->/g, '→').replace(/<-/g, '←')
    .replace(/μ/g, 'µ').replace(/−/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  text = text.replace(/\b(Fe|Cu|Ca|Mg|Zn|Al)([2-4])([+-])/g, (_, e, n, sign) => e + convert(n + sign, supers));
  // Common unit powers; never convert numbers in identifiers such as AO1/Q13.
  text = text.replace(/\b(cm|dm|mm|µm|nm|m|mol|s|min)(-?[1-9])\b/g, (_, unit, power) => unit + convert(power, supers));
  const elements = /^(?:(?:H|He|Li|Be|B|C|N|O|F|Ne|Na|Mg|Al|Si|P|S|Cl|Ar|K|Ca|Fe|Cu|Zn|Ag|Br|I|Pb)\d*)+$/;
  return text.replace(/(?<![A-Za-z])[A-Z][A-Za-z0-9]*\b/g, word =>
    /\d/.test(word) && elements.test(word) && !/^AO\d$/.test(word)
      ? word.replace(/\d+/g, digits => convert(digits, subs)) : word);
}

export function scientificCharacter(character: string): { text: string; script: number; symbol?: boolean; arrow?: boolean } {
  if ('→←⇌↔'.includes(character)) return { text: character, script: 0, arrow: true };
  const up = supers.indexOf(character), down = subs.indexOf(character);
  if (up >= 0) return { text: normal[up], script: 1 };
  if (down >= 0) return { text: normal[down], script: -1 };
  const greek: Record<string, string> = { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', θ: 'q', λ: 'l', π: 'p', σ: 's', ω: 'w', Δ: 'D', Σ: 'S', Ω: 'W', "≤": '£', "≥": '³', "≠": '¹', "∞": '¥' };
  return greek[character] ? { text: greek[character], script: 0, symbol: true } : { text: character, script: 0 };
}
