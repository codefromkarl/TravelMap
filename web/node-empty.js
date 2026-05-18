// 浏览器端 Node.js 模块 polyfill — 所有导出返回空函数/空值
const noop = () => {};
const emptyObj = () => ({});

// 用 Proxy 让任意 named import 都能工作
const handler = {
  get: () => noop,
};
const proxy = new Proxy({}, handler);

export default proxy;
// 让 export { xxx } 通过
export const __esModule = true;
