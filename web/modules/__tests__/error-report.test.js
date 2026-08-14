/**
 * error-report.js 单元测试
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let module;
let fetchMock;

// logger.js 存在循环依赖（logger → trace → perf-trace → logger），测试中直接 mock
vi.mock('../logger.js', () => ({
  createLogger: () => ({ debug: () => {}, warn: () => {}, error: () => {} }),
}));

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn(() => Promise.resolve(new Response('{"accepted":1,"rejected":0}', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  module = await import('../infra/error-report.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('error-report.js', () => {
  it('initErrorReporting 注册 window error 与 unhandledrejection 监听', () => {
    const errorSpy = vi.spyOn(window, 'addEventListener');
    module.initErrorReporting();
    expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(errorSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });

  it('window error 触发后上报 /api/logs（携带脱敏消息）', async () => {
    module.initErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'boom sk-ant-test12345678901234567890',
      filename: 'https://example.com/app.js',
      lineno: 3,
      colno: 5,
    }));
    // 等待内部 flush（8s 间隔由 lastFlush 控制，首次立即）
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/logs');
    const body = JSON.parse(init.body);
    expect(body.entries[0].level).toBe('error');
    expect(body.entries[0].msg).not.toContain('sk-ant-test12345678901234567890');
    expect(body.entries[0].msg).toContain('[REDACTED]');
    expect(body.entries[0].msg).toContain('app.js:3:5');
  });

  it('401 响应后停止上报', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 })));
    module.initErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', { message: 'first' }));
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled(); });
    window.dispatchEvent(new ErrorEvent('error', { message: 'second' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('unhandledrejection 上报错误信息', async () => {
    module.initErrorReporting();
    const rejectedPromise = Promise.reject(new Error('rejected reason'));
    rejectedPromise.catch(() => {}); // 避免 unhandled rejection 警告
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: rejectedPromise,
      reason: new Error('rejected reason'),
    }));
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled(); });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.entries[0].msg).toContain('rejected reason');
  });
});
