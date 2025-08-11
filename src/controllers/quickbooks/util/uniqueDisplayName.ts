export function uniqueDisplayName(c: { name: string; id: string }) {
  const short = c.id.slice(0, 8);
  const baseName = `${c.name}`.trim() || `Client ${short}`;
  return `${baseName} #${short}`;
}