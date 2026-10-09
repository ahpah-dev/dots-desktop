export const MAX_CLIPBOARD_CHARS = 1_000_000;

export function validateClipboardText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Clipboard content must be plain text.');
  if (value.length > MAX_CLIPBOARD_CHARS) throw new Error('This text is too large to copy.');
  return value;
}
