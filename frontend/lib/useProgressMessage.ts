import { useEffect, useState } from "react";

/** Steps through `messages` on a timer while `active`, and stays on the last one. */
export function useProgressMessage(active: boolean, messages: string[], intervalMs = 5000) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const id = setInterval(() => {
      setIndex((i) => Math.min(i + 1, messages.length - 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, messages.length, intervalMs]);

  return messages[Math.min(index, messages.length - 1)];
}