import useSWR, { mutate } from "swr";
import { api } from "./api";

export const keys = {
  me: "me",
  tests: "tests",
  results: (id: string) => `results:${id}`,
};

export function useMe() {
  return useSWR(keys.me, () => api.getMe(), {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
}

export function useTests() {
  return useSWR(keys.tests, () => api.listMyTests(), { dedupingInterval: 30_000 });
}

export function useResults(testId: string | undefined, live = false) {
  return useSWR(testId ? keys.results(testId) : null, () => api.liveResults(testId!), {
    refreshInterval: live ? 5000 : 0, // pauses automatically while the tab is hidden
    dedupingInterval: 3000,
  });
}

export const invalidateTests = () => mutate(keys.tests);

/** Call on login and logout so one lecturer never sees another's cached data. */
export const clearCache = () => mutate(() => true, undefined, { revalidate: false });