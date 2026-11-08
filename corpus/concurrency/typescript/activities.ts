export async function Count(items: string[]): Promise<number> {
  return items.length;
}

export async function Store(_items: string[]): Promise<void> {}
