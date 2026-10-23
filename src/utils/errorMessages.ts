const NETWORK_MESSAGE = 'The local service is unreachable. Make sure it is running, then try again.';

export function toUserMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return fallback;
  if (/failed to fetch|networkerror|load failed|fetch failed|econnrefused|econnreset|etimedout/i.test(raw)) {
    return NETWORK_MESSAGE;
  }
  if (/^http\s*\d{3}$/i.test(raw) || /^[a-z_]+:\s/i.test(raw) || /\bstatus\s*\d{3}\b/i.test(raw)) {
    return fallback;
  }
  return raw;
}
