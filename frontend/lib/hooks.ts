import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { api } from "./api";

export const keys = {
  me: "me",
  tests: "tests",
  results: (id: string) => `results:${id}`,
};

export type ResultsQuery = {
  page: number;
  pageSize: number;
  q: string;
  status: "all" | "submitted" | "auto-submitted";
};

export function useMe() {
  return useSWR(keys.me, () => api.getMe(), {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
}

export function useTests(page = 1, pageSize = 10) {
  return useSWR([keys.tests, page, pageSize], () => api.listMyTests(page, pageSize), {
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
}

export function useResults(testId: string | undefined, query: ResultsQuery, live = false) {
  return useSWR(
    testId ? [keys.results(testId), query.page, query.pageSize, query.q, query.status] : null,
    () => api.liveResults(testId!, query),
    {
      refreshInterval: live ? 5000 : 0, // pauses automatically while the tab is hidden
      dedupingInterval: 3000,
      keepPreviousData: true,
    }
  );
}

/** Refetch every cached page of the tests list (after creating or deleting a test). */
export const invalidateTests = () =>
  mutate((key) => Array.isArray(key) && key[0] === keys.tests);

/** Forget every cached page of one test's results. */
export const clearResults = (testId: string) =>
  mutate((key) => Array.isArray(key) && key[0] === keys.results(testId), undefined, {
    revalidate: false,
  });

/** Call on login and logout so one lecturer never sees another's cached data. */
export const clearCache = () => mutate(() => true, undefined, { revalidate: false });

/** Returns the value only after it has stopped changing for delayMs (for search boxes). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}