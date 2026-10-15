// Deterministic, realistic assistant-reply markdown: headings, paragraphs with inline
// code/bold/links, bullet and numbered lists (some nested, some with code), tables,
// blockquotes and fenced code blocks.
export function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
const words = ('the request handler returns a promise that resolves once the cache is warm and every pending ' +
  'subscriber has been notified so callers can await it safely without racing the initial fetch while the ' +
  'renderer keeps its previous frame until new data arrives and layout settles across both panes').split(' ');
export function markdown({ seed = 1, size = 30000, crlf = false } = {}) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const sentence = () => {
    const n = 6 + Math.floor(r() * 14), out = [];
    for (let i = 0; i < n; i++) {
      let w = pick(words), x = r();
      if (x < 0.05) w = '`' + w + '()`'; else if (x < 0.08) w = '**' + w + '**'; else if (x < 0.1) w = `[${w}](https://example.com/${w})`; else if (x < 0.11) w = '_' + w + '_';
      out.push(w);
    }
    const s = out.join(' '); return s[0].toUpperCase() + s.slice(1) + '.';
  };
  const para = () => Array.from({ length: 1 + Math.floor(r() * 4) }, sentence).join(' ');
  const code = () => {
    const lang = pick(['ts', 'swift', 'python', 'bash', '']), lines = [];
    for (let i = 0, n = 3 + Math.floor(r() * 14); i < n; i++) lines.push('  '.repeat(Math.floor(r() * 3)) + pick(['const value = await load(id);', 'if (value == null) return;', 'for item in items {', '}', 'print(f"{name}: {count}")', 'echo "$HOME" | tr a-z A-Z', '', 'return cache.get(key) ?? fallback']));
    const fence = r() < 0.1 ? '~~~' : '```';
    return `${fence}${lang}\n${lines.join('\n')}\n${fence}`;
  };
  const list = (ordered, depth = 0) => {
    const items = [];
    for (let i = 0, n = 2 + Math.floor(r() * 5); i < n; i++) {
      const ind = '   '.repeat(depth), mark = ordered ? `${i + 1}.` : pick(['-', '*']);
      let item = `${ind}${mark} ${sentence()}`;
      if (depth < 1 && r() < 0.2) item += '\n' + list(r() < 0.5, depth + 1);
      if (depth === 0 && r() < 0.08) item += '\n\n' + code().split('\n').map(l => ind + '   ' + l).join('\n');
      items.push(item);
    }
    return items.join(r() < 0.2 ? '\n\n' : '\n');
  };
  const table = () => {
    const cols = 2 + Math.floor(r() * 3), row = () => '| ' + Array.from({ length: cols }, () => pick(words) + (r() < 0.3 ? ' `x`' : '')).join(' | ') + ' |';
    return [row(), '|' + ' --- |'.repeat(cols), ...Array.from({ length: 2 + Math.floor(r() * 6) }, row)].join('\n');
  };
  const quote = () => para().match(/.{1,80}(\s|$)/g).map(l => '> ' + l.trim()).join('\n');
  const blocks = [];
  let len = 0;
  while (len < size) {
    const x = r();
    const b = x < 0.08 ? `${'#'.repeat(2 + Math.floor(r() * 2))} ${sentence().slice(0, -1)}` : x < 0.45 ? para() : x < 0.6 ? list(false) : x < 0.68 ? list(true) : x < 0.82 ? code() : x < 0.9 ? table() : x < 0.95 ? quote() : '---';
    blocks.push(b); len += b.length + 2;
  }
  const text = blocks.join('\n\n');
  return crlf ? text.replace(/\n/g, '\r\n') : text;
}
