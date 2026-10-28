/** "Lecture 3 - Networking.pdf" gives "Lecture 3 - Networking"; "networking_notes.csv" gives "Networking Notes". */
export function topicFromFileName(fileName: string): string {
  let base = fileName.replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  if (base && base === base.toLowerCase()) {
    base = base.replace(/(^|\s)(\p{L})/gu, (_m, space: string, ch: string) => space + ch.toUpperCase());
  }
  return base.slice(0, 100) || "General";
}