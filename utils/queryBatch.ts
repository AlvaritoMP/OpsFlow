const POSTGREST_PAGE_SIZE = 1000;

export async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  fetcher: (chunkIds: string[]) => Promise<T[]>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await fetcher(chunk);
    results.push(...rows);
  }
  return results;
}

export async function fetchAllPaged<T>(
  fetcher: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  while (true) {
    const page = await fetcher(from, from + POSTGREST_PAGE_SIZE - 1);
    results.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) break;
    from += POSTGREST_PAGE_SIZE;
  }
  return results;
}

export function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
