/**
 * Reads a number from the environment. A missing, blank or unusable value gives the default,
 * so an empty line in a copied .env file can't switch a feature off.
 */
export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}