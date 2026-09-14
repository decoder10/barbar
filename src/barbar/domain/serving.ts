/** Recognize legacy imported glasses without rewriting stored recipes. */
export function isGlassServing(item: { name: string; category?: string; serving?: string; unit?: string }) {
  return (
    item.serving === 'glass' ||
    item.unit === 'glass' ||
    (['wine', 'cognac'].includes(item.category || '') && /[·—-]\s*(бокал|порция|glass)\s*$/i.test(item.name))
  );
}
export function bottleName(name: string) {
  return name.replace(/\s*[·—-]\s*(бокал|порция|glass|бутылка|bottle)\s*$/i, '').trim();
}
