import { describe, expect, it } from 'vitest';
import { MAX_CLIPBOARD_CHARS, validateClipboardText } from '../src/main/util/clipboardText';

describe('write-only clipboard boundary', () => {
  it('keeps exact multiline Unicode text and permits clearing copied text', () => {
    expect(validateClipboardText('A copied answer\nDots → 🌱')).toBe('A copied answer\nDots → 🌱');
    expect(validateClipboardText('')).toBe('');
  });
  it('rejects nontext inputs and refuses oversized payloads', () => {
    for (const value of [null, undefined, 123, {}, ['text']]) expect(() => validateClipboardText(value)).toThrow('plain text');
    expect(() => validateClipboardText('x'.repeat(MAX_CLIPBOARD_CHARS + 1))).toThrow('too large');
    expect(validateClipboardText('x'.repeat(MAX_CLIPBOARD_CHARS)).length).toBe(MAX_CLIPBOARD_CHARS);
  });
});
