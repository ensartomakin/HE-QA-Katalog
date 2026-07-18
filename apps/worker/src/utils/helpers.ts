export const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
