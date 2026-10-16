import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown, plainText } from '../src/markdown.ts';

const md = (s: string): string => markdown(s).__raw.trim();

test('plain text keeps its paragraphs and line breaks', () => {
  assert.equal(md('一行目\n二行目\n\n次の段落'), '<p>一行目<br>\n二行目</p>\n<p>次の段落</p>');
  assert.equal(md('改行\r\nCRLF'), '<p>改行<br>\nCRLF</p>');
});

test('emphasis, lists, quotes, code and tables are rendered', () => {
  assert.equal(md('**太字** と _斜体_ と ~~消し~~'), '<p><strong>太字</strong> と <em>斜体</em> と <s>消し</s></p>');
  assert.match(md('- a\n- b'), /<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>/);
  assert.match(md('> 引用'), /<blockquote>\n<p>引用<\/p>\n<\/blockquote>/);
  assert.match(md('`x`'), /<code>x<\/code>/);
  assert.match(md('| a |\n|---|\n| 1 |'), /^<div class="md-table"><table>[\s\S]*<td>1<\/td>[\s\S]*<\/table><\/div>$/);
});

test('headings start at h3, below the page title and the author', () => {
  assert.equal(md('# 見出し'), '<h3>見出し</h3>');
  assert.equal(md('### 小見出し'), '<h5>小見出し</h5>');
  assert.equal(md('##### 深い'), '<h6>深い</h6>');
});

test('raw HTML is shown as text, never as markup', () => {
  assert.equal(md('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('links: only safe schemes, opened without a referrer', () => {
  assert.equal(md('[公式](https://example.com/)'), '<p><a href="https://example.com/" rel="noopener noreferrer">公式</a></p>');
  assert.equal(md('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.match(md('![表紙](https://example.com/c.png)'), /<img src="https:\/\/example.com\/c.png" alt="表紙" loading="lazy">/);
});

test('a bare URL becomes a link that stops where the Japanese sentence goes on', () => {
  assert.equal(md('https://example.com/pathです。'), '<p><a href="https://example.com/path" rel="noopener noreferrer">https://example.com/path</a>です。</p>');
  assert.equal(md('（https://example.com/a?b=1）'), '<p>（<a href="https://example.com/a?b=1" rel="noopener noreferrer">https://example.com/a?b=1</a>）</p>');
  assert.equal(md('see https://example.com/a.'), '<p>see <a href="https://example.com/a" rel="noopener noreferrer">https://example.com/a</a>.</p>');
  assert.equal(md('example.com と a@example.com'), '<p>example.com と a@example.com</p>');
});

test('plain text drops the markup and keeps blocks, list items and table rows apart', () => {
  assert.equal(plainText('# 見出し\n\n**太字**と[リンク](https://example.com/)\n改行'), '見出し\n\n太字とリンク\n改行');
  assert.equal(plainText('前\n\n- a\n- b\n\n後'), '前\n\n・a\n・b\n\n後');
  assert.equal(plainText('| a | b |\n|---|---|\n| 1 | 2 |'), 'a b\n1 2');
  assert.equal(plainText('```\ncode\n```'), 'code');
  assert.equal(plainText('<b>x</b>'), '<b>x</b>');
  assert.equal(plainText(''), '');
});
