export function slugify(input: string, maxLength = 120): string {
  const base = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  return base || 'item';
}

export async function ensureUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  let candidate = slugify(base);
  if (!(await exists(candidate))) return candidate;

  for (let i = 2; i <= 1000; i += 1) {
    candidate = `${slugify(base).slice(0, 100)}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }

  candidate = `${slugify(base).slice(0, 80)}-${Date.now()}`;
  return candidate;
}
