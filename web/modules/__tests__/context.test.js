import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage for context.js init
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
globalThis.localStorage = localStorageMock;

// Mock location
globalThis.location = { hostname: 'localhost' };

// Mock document.getElementById for showToast
const toastEl = { textContent: '', className: '', _hide: null, classList: { add: vi.fn() } };
globalThis.document = {
  getElementById: vi.fn((id) => id === 'toast' ? toastEl : null),
};

const ctx = await import('../context.js');

describe('context.js exports', () => {
  it('exports constants', () => {
    expect(ctx.DB_NAME).toBe('TravelAgentDB');
    expect(ctx.DB_VERSION).toBe(2);
    expect(ctx.STORE_NAME).toBe('trips');
    expect(ctx.SUPPLY_STORE_NAME).toBe('supplyPoints');
    expect(ctx.EXPORT_STORAGE_KEY).toBeDefined();
    expect(ctx.TRAVELERS_KEY).toBeDefined();
  });

  it('exports SUPPLY_COLORS with expected keys', () => {
    expect(ctx.SUPPLY_COLORS).toHaveProperty('restaurant');
    expect(ctx.SUPPLY_COLORS).toHaveProperty('cafe');
    expect(ctx.SUPPLY_COLORS).toHaveProperty('shop');
    expect(ctx.SUPPLY_COLORS).toHaveProperty('water');
    expect(ctx.SUPPLY_COLORS).toHaveProperty('rest_area');
    expect(ctx.SUPPLY_COLORS).toHaveProperty('toilet');
  });

  it('exports CITY_CENTERS with valid coordinates', () => {
    expect(ctx.CITY_CENTERS).toHaveProperty('北京');
    expect(ctx.CITY_CENTERS).toHaveProperty('上海');
    const [lat, lng] = ctx.CITY_CENTERS['北京'];
    expect(typeof lat).toBe('number');
    expect(typeof lng).toBe('number');
  });

  it('exports DOMESTIC_CITIES array', () => {
    expect(Array.isArray(ctx.DOMESTIC_CITIES)).toBe(true);
    expect(ctx.DOMESTIC_CITIES.length).toBeGreaterThan(10);
    expect(ctx.DOMESTIC_CITIES).toContain('北京');
    expect(ctx.DOMESTIC_CITIES).toContain('上海');
  });

  it('exports LLM_HOSTS', () => {
    expect(ctx.LLM_HOSTS).toHaveProperty('api.openai.com');
    expect(ctx.LLM_HOSTS).toHaveProperty('api.anthropic.com');
  });

  it('exports PROVIDER_MODELS', () => {
    expect(ctx.PROVIDER_MODELS).toHaveProperty('openai');
    expect(ctx.PROVIDER_MODELS).toHaveProperty('anthropic');
    expect(Array.isArray(ctx.PROVIDER_MODELS.openai)).toBe(true);
  });

  it('exports RISK_COLORS for levels 1, 2, 3', () => {
    expect(ctx.RISK_COLORS).toHaveProperty('1');
    expect(ctx.RISK_COLORS).toHaveProperty('2');
    expect(ctx.RISK_COLORS).toHaveProperty('3');
    expect(ctx.RISK_COLORS['1']).toHaveProperty('stroke');
    expect(ctx.RISK_COLORS['1']).toHaveProperty('fill');
    expect(ctx.RISK_COLORS['1']).toHaveProperty('label');
  });

  it('exports _DEFAULT_AMAP_KEY', () => {
    expect(typeof ctx._DEFAULT_AMAP_KEY).toBe('string');
    expect(ctx._DEFAULT_AMAP_KEY.length).toBeGreaterThan(0);
  });

  it('exports _ALLOWED_HOSTS', () => {
    expect(Array.isArray(ctx._ALLOWED_HOSTS)).toBe(true);
    expect(ctx._ALLOWED_HOSTS).toContain('localhost');
  });
});

describe('setter functions', () => {
  it('setAgent sets agent', () => {
    ctx.setAgent({ id: 'test' });
    expect(ctx.agent).toEqual({ id: 'test' });
  });

  it('setCurrentTripId sets trip id', () => {
    ctx.setCurrentTripId('trip-123');
    expect(ctx.currentTripId).toBe('trip-123');
  });

  it('setCurrentLang sets lang', () => {
    ctx.setCurrentLang('en');
    expect(ctx.currentLang).toBe('en');
  });

  it('setCurrentUser sets user', () => {
    ctx.setCurrentUser({ name: 'test' });
    expect(ctx.currentUser).toEqual({ name: 'test' });
  });

  it('setQuotaRemaining sets quota', () => {
    ctx.setQuotaRemaining(5);
    expect(ctx.quotaRemaining).toBe(5);
  });

  it('setIsProxyMode sets mode', () => {
    ctx.setIsProxyMode(true);
    expect(ctx.isProxyMode).toBe(true);
  });

  it('setLastTripContent sets content', () => {
    ctx.setLastTripContent('# trip');
    expect(ctx.lastTripContent).toBe('# trip');
  });

  it('setActivePanel sets panel', () => {
    ctx.setActivePanel('model');
    expect(ctx.activePanel).toBe('model');
  });

  it('setCurrentTravelers sets travelers', () => {
    ctx.setCurrentTravelers({ adults: 2, seniors: 1 });
    expect(ctx.currentTravelers).toEqual({ adults: 2, seniors: 1 });
  });

  it('setCurrentPage sets page', () => {
    ctx.setCurrentPage('page-settings');
    expect(ctx.currentPage).toBe('page-settings');
  });
});

describe('showToast', () => {
  beforeEach(() => {
    toastEl.textContent = '';
    toastEl.className = '';
    vi.clearAllMocks();
  });

  it('is a function', () => {
    expect(typeof ctx.showToast).toBe('function');
  });

  it('sets toast text and class', () => {
    ctx.showToast('Hello');
    expect(toastEl.textContent).toBe('Hello');
    expect(toastEl.className).toBe('show');
  });

  it('adds type class when type is not default', () => {
    ctx.showToast('Error', 2500, 'error');
    expect(toastEl.classList.add).toHaveBeenCalledWith('error');
  });

  it('does not add type class when type is default', () => {
    ctx.showToast('OK', 2500, 'default');
    expect(toastEl.classList.add).not.toHaveBeenCalled();
  });

  it('does nothing when toast element is missing', () => {
    document.getElementById.mockReturnValueOnce(null);
    expect(() => ctx.showToast('No crash')).not.toThrow();
  });
});

describe('isDomesticCityForMap', () => {
  it('returns true for exact match', () => {
    expect(ctx.isDomesticCityForMap('北京')).toBe(true);
  });

  it('returns true when city contains a domestic city name', () => {
    expect(ctx.isDomesticCityForMap('北京市')).toBe(true);
  });

  it('returns true when domestic city contains input', () => {
    expect(ctx.isDomesticCityForMap('京')).toBe(true);
  });

  it('returns false for non-domestic city', () => {
    expect(ctx.isDomesticCityForMap('Tokyo')).toBe(false);
  });
});

describe('getAmapKey', () => {
  it('returns user key when set', () => {
    localStorageMock.getItem.mockReturnValueOnce('user-key-123');
    expect(ctx.getAmapKey()).toBe('user-key-123');
  });

  it('returns default key for allowed host', () => {
    localStorageMock.getItem.mockReturnValueOnce(null);
    expect(ctx.getAmapKey()).toBe(ctx._DEFAULT_AMAP_KEY);
  });
});
