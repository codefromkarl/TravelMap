import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock context.js
vi.mock('../context.js', () => ({
  currentLang: 'zh',
}));

// Mock document
const querySelectorAllMock = vi.fn().mockReturnValue([]);
const querySelectorMock = vi.fn().mockReturnValue(null);
globalThis.document = {
  querySelectorAll: querySelectorAllMock,
  querySelector: querySelectorMock,
  documentElement: { lang: '' },
};

const { I18N, applyI18n, initPlaceholder } = await import('../i18n.js');

describe('I18N', () => {
  it('has zh, en, ja languages', () => {
    expect(I18N).toHaveProperty('zh');
    expect(I18N).toHaveProperty('en');
    expect(I18N).toHaveProperty('ja');
  });

  const requiredKeys = [
    'welcomeTitle',
    'promptPlaceholder',
    'subtitle',
    'share',
    'loading',
    'exportMd',
    'exportPdf',
    'sendTitle',
    'closeAria',
    'promptCard1',
    'promptCard2',
    'promptCard3',
    'promptCard4',
    'navTrip',
    'navModel',
    'navMap',
    'mapPageTitle',
    'mapEmptyTitle',
    'modelConfigTitle',
    'authTitle',
    'logout',
  ];

  for (const lang of ['zh', 'en', 'ja']) {
    describe(lang, () => {
      for (const key of requiredKeys) {
        it(`has key "${key}"`, () => {
          expect(I18N[lang]).toHaveProperty(key);
          expect(typeof I18N[lang][key]).toBe('string');
          expect(I18N[lang][key].length).toBeGreaterThan(0);
        });
      }
    });
  }

  it('all three languages have the same set of keys', () => {
    const zhKeys = Object.keys(I18N.zh).sort();
    const enKeys = Object.keys(I18N.en).sort();
    const jaKeys = Object.keys(I18N.ja).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(enKeys).toEqual(jaKeys);
  });
});

describe('applyI18n', () => {
  beforeEach(() => {
    querySelectorAllMock.mockClear();
    querySelectorMock.mockClear();
  });

  it('is a function', () => {
    expect(typeof applyI18n).toBe('function');
  });

  it('queries for [data-i18n] elements', () => {
    applyI18n('zh');
    expect(querySelectorAllMock).toHaveBeenCalledWith('[data-i18n]');
  });

  it('queries for [data-i18n-title] elements', () => {
    applyI18n('zh');
    expect(querySelectorAllMock).toHaveBeenCalledWith('[data-i18n-title]');
  });

  it('sets document lang to zh-CN for zh', () => {
    applyI18n('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('sets document lang to en for en', () => {
    applyI18n('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('sets document lang to ja for ja', () => {
    applyI18n('ja');
    expect(document.documentElement.lang).toBe('ja');
  });

  it('applies translations to elements with data-i18n', () => {
    const el = { textContent: '', getAttribute: vi.fn().mockReturnValue('subtitle') };
    querySelectorAllMock.mockImplementation((sel) => {
      if (sel === '[data-i18n]') return [el];
      return [];
    });
    applyI18n('zh');
    expect(el.textContent).toBe(I18N.zh.subtitle);
  });

  it('applies title translations to elements with data-i18n-title', () => {
    const el = { title: '', getAttribute: vi.fn().mockReturnValue('sendTitle') };
    querySelectorAllMock.mockImplementation((sel) => {
      if (sel === '[data-i18n-title]') return [el];
      return [];
    });
    applyI18n('en');
    expect(el.title).toBe(I18N.en.sendTitle);
  });
});

describe('initPlaceholder', () => {
  it('is a function', () => {
    expect(typeof initPlaceholder).toBe('function');
  });
});
