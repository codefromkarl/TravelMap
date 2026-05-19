import { describe, it, expect, vi } from 'vitest';

// Mock context.js
vi.mock('../context.js', () => ({
  currentTravelers: null,
}));

const { SYSTEM_PROMPT, LANG_PROMPTS, buildTravelersPrompt, buildSystemPrompt } = await import('../prompt.js');

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains key domain keywords', () => {
    expect(SYSTEM_PROMPT).toContain('TravelMap');
    expect(SYSTEM_PROMPT).toContain('行程');
    expect(SYSTEM_PROMPT).toContain('工具');
  });

  it('contains template placeholders', () => {
    expect(SYSTEM_PROMPT).toContain('{{TRAVELERS}}');
    expect(SYSTEM_PROMPT).toContain('{{LANGUAGE_INSTRUCTION}}');
  });
});

describe('LANG_PROMPTS', () => {
  it('has zh, en, ja keys', () => {
    expect(LANG_PROMPTS).toHaveProperty('zh');
    expect(LANG_PROMPTS).toHaveProperty('en');
    expect(LANG_PROMPTS).toHaveProperty('ja');
  });

  it('zh is empty string', () => {
    expect(LANG_PROMPTS.zh).toBe('');
  });

  it('en contains English instruction', () => {
    expect(LANG_PROMPTS.en).toContain('English');
  });

  it('ja contains Japanese instruction', () => {
    expect(LANG_PROMPTS.ja).toContain('日本語');
  });
});

describe('buildTravelersPrompt', () => {
  it('returns empty string for null input', () => {
    expect(buildTravelersPrompt(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(buildTravelersPrompt(undefined)).toBe('');
  });

  it('includes traveler counts', () => {
    const t = { adults: 2, seniors: 1, children: 1, infants: 0, pregnant: false, mobilityImpaired: false };
    const result = buildTravelersPrompt(t);
    expect(result).toContain('成人: 2人');
    expect(result).toContain('老人: 1人');
    expect(result).toContain('儿童: 1人');
    expect(result).toContain('婴幼儿: 0人');
  });

  it('includes pregnancy warning when pregnant is true', () => {
    const t = { adults: 2, seniors: 0, children: 0, infants: 0, pregnant: true, mobilityImpaired: false };
    const result = buildTravelersPrompt(t);
    expect(result).toContain('有孕妇');
  });

  it('includes mobility warning when mobilityImpaired is true', () => {
    const t = { adults: 2, seniors: 0, children: 0, infants: 0, pregnant: false, mobilityImpaired: true };
    const result = buildTravelersPrompt(t);
    expect(result).toContain('行动不便');
  });
});

describe('buildSystemPrompt', () => {
  it('returns a string without undefined placeholders', () => {
    const result = buildSystemPrompt('zh');
    expect(typeof result).toBe('string');
    expect(result).not.toContain('{{TRAVELERS}}');
    expect(result).not.toContain('{{LANGUAGE_INSTRUCTION}}');
  });

  it('includes language instruction for en', () => {
    const result = buildSystemPrompt('en');
    expect(result).toContain('English');
  });

  it('includes language instruction for ja', () => {
    const result = buildSystemPrompt('ja');
    expect(result).toContain('日本語');
  });

  it('zh has empty language instruction', () => {
    const result = buildSystemPrompt('zh');
    // zh instruction is empty, so no language directive should be appended
    // (but the placeholder is replaced with empty string)
    expect(result).not.toContain('{{LANGUAGE_INSTRUCTION}}');
  });
});
