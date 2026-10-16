// Copies the offline web bundle (frontend/dist) into apk/www and strips the
// remote Google Fonts @import so the app renders fully without internet.
// Fonts are bundled locally via @fontsource in the offline build.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apkRoot = path.resolve(here, '..');
const distDir = path.resolve(apkRoot, '../frontend/dist');
const wwwDir = path.join(apkRoot, 'www');

await fs.access(path.join(distDir, 'index.html'));
await fs.rm(wwwDir, { recursive: true, force: true });
await fs.cp(distDir, wwwDir, { recursive: true });

const assetsDir = path.join(wwwDir, 'assets');
let stripped = 0;
for (const file of await fs.readdir(assetsDir).catch(() => [])) {
  if (!file.endsWith('.css')) continue;
  const filePath = path.join(assetsDir, file);
  const css = await fs.readFile(filePath, 'utf8');
  const cleaned = css.replace(/@import\s+(?:"https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"|url\(\s*['"]?https:\/\/fonts\.(?:googleapis|gstatic)\.com[^'")]*['"]?\s*\))\s*;\s*/g, '');
  if (cleaned !== css) {
    await fs.writeFile(filePath, cleaned, 'utf8');
    stripped += 1;
  }
}

const files = [];
const walk = async (dir) => {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push(full);
  }
};
await walk(wwwDir);
const bytes = (await Promise.all(files.map((file) => fs.stat(file)))).reduce((sum, stat) => sum + stat.size, 0);
console.log(`www prepared: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB, google-fonts stripped from ${stripped} css file(s).`);
