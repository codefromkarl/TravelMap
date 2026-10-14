/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { escapeHtml, safeHttpUrl, safeMarkdown, markdownToSafeHtml } from '../infra/content-safety.js';

describe('dynamic trip content safety', () => {
  it('escapes text and quoted attributes without losing readable names', () => {
    const div = document.createElement('div');
    const value = '<img src=x onerror="alert(1)"> & \'行程\'';
    div.innerHTML = `<span title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
    expect(div.querySelector('span').textContent).toBe(value);
    expect(div.querySelector('span').title).toBe(value);
    expect(div.querySelector('img')).toBeNull();
  });
  it.each(['javascript:alert(1)', 'data:image/svg+xml,evil', '//attacker.example/a', 'https://user:pass@example.com/a', 'https://example.com/\nonerror=x', 'file:///etc/passwd', null])('rejects unsafe URL %s', value => {
    expect(safeHttpUrl(value)).toBe('');
  });
  it('keeps regular HTTPS cover URLs', () => {
    expect(safeHttpUrl('https://example.com/a?x=1&y=2')).toBe('https://example.com/a?x=1&y=2');
  });
  it('makes raw HTML and dangerous Markdown links inert', () => {
    const result = safeMarkdown('# 行程\n<img src=x onerror=alert(1)>\n[查看](javascript:alert)\n![封面](data:image/svg+xml,evil)\n\n[ref]: javascript:alert(1)');
    expect(result).toContain('# 行程');
    expect(result).toContain('&lt;img');
    expect(result).toContain('查看');
    expect(result).toContain('封面');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('data:image');
    expect(result).not.toContain('<img');
  });
  it('preserves safe Markdown headings, emphasis and links', () => {
    expect(safeMarkdown('# 行程\n**西湖**\n[详情](https://example.com/a?x=1&y=2)')).toBe('# 行程\n**西湖**\n[详情](https://example.com/a?x=1&y=2)');
  });
  it('preserves readable nested safe labels and is idempotent', () => {
    const safe = safeMarkdown('[x[y]](https://example.com/a)');
    expect(safeMarkdown(safe)).toBe(safe);
    const div = document.createElement('div');
    div.innerHTML = marked.parse(safe);
    expect(div.querySelector('a').textContent).toBe('x[y]');
    expect(div.querySelector('a').href).toBe('https://example.com/a');
  });
  it.each([
    '[x[y]](javascript:alert(1))',
    '[x\\]](javascript:alert(1))',
    '![x[y]](data:image/svg+xml,evil)',
    '[outer ![image](javascript:alert(1))](https://example.com/)',
    '[x[y]][ref]\n\n[ref]: javascript:alert(1)',
    '[escaped\\]][ref]\n\n[ref]: data:text/html,evil',
    '[link](jav&#x61;script:alert(1))',
    '[link](\n javascript:alert(1))',
    '[link](\r\njavascript:alert(1))',
    '[link](\rjavascript:alert(1))',
    '[link][ref]\r\n\r\n[ref]: javascript:alert(1)',
    '[link][ref]\r\r[ref]: javascript:alert(1)',
    '> [link](\n> javascript:alert(1))',
    '- [link](\n  javascript:alert(1))',
    '- [link](\n\tjavascript:alert(1))',
  ])('makes the actual renderer safe for complex label %s', input => {
    const output = safeMarkdown(input);
    const div = document.createElement('div');
    div.innerHTML = marked.parse(output);
    for (const link of div.querySelectorAll('a[href]')) {
      expect(safeHttpUrl(link.getAttribute('href'))).not.toBe('');
    }
    for (const image of div.querySelectorAll('img[src]')) {
      expect(safeHttpUrl(image.getAttribute('src'))).not.toBe('');
    }
    expect(div.querySelector('script,[onerror],[onclick]')).toBeNull();
    expect(div.textContent).toContain(input.includes('outer') ? 'outer' : input.includes('link') ? 'link' : input.includes('escaped') ? 'escaped' : 'x');
  });
  it.each(['https://user:secret@example.com/path', 'http://user:secret@example.com/', 'www.example.com'])('keeps bare URL policy safe for %s', input => {
    const div = document.createElement('div');
    div.innerHTML = marked.parse(safeMarkdown(input));
    for (const link of div.querySelectorAll('a[href]')) {
      expect(safeHttpUrl(link.getAttribute('href'))).not.toBe('');
    }
    expect(div.textContent).toContain(input);
  });
  it.each(['"', "'"])('keeps fenced fake definitions inert with %s titles', quote => {
    const input = '```text\n[ref]: https://example.com ' + quote + 'title\n```\n' + quote + '\n```\n[evil](javascript:alert(1))\n```';
    const output = safeMarkdown(input);
    const div = document.createElement('div');
    div.innerHTML = marked.parse(output);
    expect(div.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(div.querySelector('code').textContent).toContain('[ref]:');
    expect(safeMarkdown(output)).toBe(output);
  });
  it('rechecks structure after definitions are removed', () => {
    const output = safeMarkdown('[ref]: https://example.com "title\n```\n"\n```\n[evil](javascript:alert(1))\n```');
    const div = document.createElement('div');
    div.innerHTML = marked.parse(output);
    for (const link of div.querySelectorAll('a[href]')) {
      expect(safeHttpUrl(link.getAttribute('href'))).not.toBe('');
    }
  });
  it('sanitized Markdown remains readable when printed and sanitization is repeated', () => {
    const input = '# 行程\n<img src=x> & 西湖';
    const safe = safeMarkdown(input);
    expect(safeMarkdown(safe)).toBe(safe);
    const div = document.createElement('div');
    div.innerHTML = markdownToSafeHtml(safe);
    expect(div.textContent).toContain('<img src=x> & 西湖');
    expect(div.querySelector('img')).toBeNull();
  });
  it('print renderer permits only its own formatting, including nested malicious emphasis', () => {
    const el = document.createElement('div');
    el.innerHTML = markdownToSafeHtml('# 杭州\n## Day 1\n- **<img src=x onerror=alert(1)>**\n<script>alert(1)</script>');
    expect(el.querySelector('h1').textContent).toBe('杭州');
    expect(el.querySelector('h2').textContent).toBe('Day 1');
    expect(el.querySelector('strong').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelectorAll('img,script,[onerror]').length).toBe(0);
  });
});
