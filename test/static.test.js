// Guards the strict Content-Security-Policy and catches broken imports in the plain-JS frontend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const pub = new URL('../public/', import.meta.url);
const pages = readdirSync(pub).filter((f) => f.endsWith('.html'));

test('pages have no inline scripts, inline styles or inline handlers (CSP)', () => {
  for (const p of pages) {
    const html = readFileSync(new URL(p, pub), 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), `${p}: inline <script>`);
    assert.ok(!/<style/i.test(html), `${p}: <style> block`);
    assert.ok(!/\sstyle\s*=/i.test(html), `${p}: style attribute`);
    assert.ok(!/\son[a-z]+\s*=/i.test(html), `${p}: inline event handler`);
  }
});

test('every page script and stylesheet exists', () => {
  for (const p of pages) {
    const html = readFileSync(new URL(p, pub), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"]+)"/g)) assert.ok(existsSync(new URL('.' + m[1], pub)), `${p} -> ${m[1]}`);
  }
});

test('named imports from common.js / i18n.js are really exported', () => {
  const exportsOf = (file) => new Set([...readFileSync(new URL(file, pub), 'utf8').matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((m) => m[1]));
  const sources = { './common.js': exportsOf('js/common.js'), './i18n.js': exportsOf('js/i18n.js') };
  for (const f of readdirSync(new URL('js/', pub))) {
    const src = readFileSync(new URL(`js/${f}`, pub), 'utf8');
    for (const m of src.matchAll(/import \{([^}]+)\} from '(\.\/[\w.]+)'/g)) {
      for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) assert.ok(sources[m[2]]?.has(name), `${f}: ${name} is not exported by ${m[2]}`);
    }
  }
});

test('i18n: Filipino has every English key', () => {
  const src = readFileSync(new URL('js/i18n.js', pub), 'utf8');
  const keys = (block) => new Set([...block.matchAll(/(?:^|[\s,{])'?([A-Za-z_ ]+?)'?:\s*['"]/g)].map((m) => m[1].trim()));
  const [en, fil] = src.split(/\n  fil: \{/);
  const e = keys(en.split('en: {')[1]), f = keys(fil);
  for (const k of e) assert.ok(f.has(k), `missing Filipino key: ${k}`);
});
