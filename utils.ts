
/**
 * Normaliza o nome da transportadora removendo sufixos e caracteres indesejados.
 * Ex: "LMS Logistica (Frete Fixo)" -> "LMS Logistica"
 * Ex: "Jamef Jamef Standard" -> "Jamef"
 */
export const normalizeCarrierName = (name: string | null | undefined): string => {
  if (!name) return 'Desconhecida';

  let normalized = name.toLowerCase();

  // Remove termos indesejados
  const termsToRemove = [
    /\(frete fixo\)/g,
    /- standard/g,
    /\bstandard\b/g,
    /\./g // Remove pontos
  ];

  termsToRemove.forEach(term => {
    normalized = normalized.replace(term, '');
  });

  // Remove espaços extras e trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Title Case (Capitalizar primeira letra de cada palavra)
  const words = normalized.split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Remove duplicatas consecutivas (ex: Jamef Jamef -> Jamef)
  const uniqueWords = words.filter((word, index) => {
    return index === 0 || word !== words[index - 1];
  });

  return uniqueWords.join(' ');
};
