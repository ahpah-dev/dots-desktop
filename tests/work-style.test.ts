import { describe, expect, it } from 'vitest';
import { normalizeBudget, TOKEN_PRESETS } from '@shared/budget';
import { buildWorkInstructions } from '../src/main/engine/workStyle';

describe('persisted work styles', () => {
  it('retains legacy preset choices and preserves the selection when caps or team allowances change', () => {
    for (const preset of TOKEN_PRESETS) {
      const { workStyle: _legacyMissing, ...legacy } = preset.budget;
      const migrated = normalizeBudget(legacy);
      expect(migrated.workStyle).toBe(preset.id);
      const custom = normalizeBudget({ ...migrated, maxContextTokens: 18000, maxTokens: 5000 });
      expect(custom.workStyle).toBe(preset.id);
      expect(buildWorkInstructions(custom)).toContain(`Work style: ${preset.label}`);
    }
    expect(normalizeBudget().workStyle).toBe('balanced');
    expect(normalizeBudget({ workStyle: 'invalid' as any, maxContextTokens: 6000 }).workStyle).toBe('economy');
  });
});
