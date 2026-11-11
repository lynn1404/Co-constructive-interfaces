/** console.log that only runs in development (`npm run dev`); removed from production builds. */
export function debugLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}
