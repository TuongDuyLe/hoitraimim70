import fs from 'node:fs/promises';
import path from 'node:path';

// Một file demo độc lập; chạy sau npm run build. Không chứa cấu hình database.
const root = process.cwd();
const dist = path.join(root, 'dist');
let html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const javascript = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/);
if (!javascript || !stylesheet) throw new Error('Hãy chạy npm run build trước.');
let css = await fs.readFile(path.join(dist, stylesheet[1]), 'utf8');
const urls = [...new Set([...css.matchAll(/url\((\/assets\/[^)]+)\)/g)].map(match => match[1]))];
for (const url of urls) {
  const content = await fs.readFile(path.join(dist, url));
  const mime = url.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
  css = css.replaceAll(url, `data:${mime};base64,${content.toString('base64')}`);
}
const js = await fs.readFile(path.join(dist, javascript[1]), 'utf8');
const icon = await fs.readFile(path.join(dist, 'favicon.svg'));
html = html.replace('/favicon.svg', `data:image/svg+xml;base64,${icon.toString('base64')}`);
html = html.replace(stylesheet[0], () => `<style>${css}</style>`);
html = html.replace(javascript[0], () => `<script>sessionStorage.setItem('traivui-demo','1');</script><script type="module">${js.replaceAll('</script', '<\\/script')}</script>`);
const fontLicense = await fs.readFile(path.join(root, 'node_modules/@fontsource/be-vietnam-pro/LICENSE'), 'utf8');
html = html.replace('<head>', () => `<head>\n<!-- Font license: Be Vietnam Pro\n${fontLicense}\n-->`);
html = html.replace('<title>', '<title>DEMO · ');
const target = path.resolve(root, process.argv[2] || 'demo.html');
await fs.writeFile(target, html);
console.log(`Demo: ${target}`);
