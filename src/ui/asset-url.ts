/** Resolve a public asset against Vite's base so GitHub Pages subpaths work. */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${path.replace(/^\/+/, '')}`;
}

export function ammoIconUrl(id: string): string {
  return assetUrl(`assets/ammo/icons/${id}.png`);
}

export function ammoRoundUrl(id: string): string {
  return assetUrl(`assets/ammo/rounds/${id}.png`);
}
