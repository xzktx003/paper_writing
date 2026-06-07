const TERMINAL_CONTROL_PAYLOAD = /[\x00-\x1f\x7f]/;

export function normalizeStdinPayload(input: string): string {
  if (!input || /[\r\n]$/.test(input)) {
    return input;
  }

  if (TERMINAL_CONTROL_PAYLOAD.test(input)) {
    return input;
  }

  return `${input}\n`;
}
