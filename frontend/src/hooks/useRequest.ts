import { useCallback, useState } from "react";

/**
 * Loading and error state for one kind of backend request. `run(request)` resolves to the
 * response, or to null when the request failed (the message is then in `error`).
 */
export function useRequest(fallbackError: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(request: () => Promise<T>): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        return await request();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : fallbackError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fallbackError],
  );

  return { loading, error, run };
}
