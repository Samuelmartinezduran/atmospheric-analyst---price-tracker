// Tras `astro build`: calcula el sha256 (base64) de cada <script> en línea de los .html de dist/
// y lo guarda en dist/csp-hashes.json. El backend lo añade a `script-src` (ver backend/app/main.py),
// así la CSP sigue siendo estricta y el arranque de las islas que Astro mete en línea funciona.
import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

// <script ...>contenido</script> sin atributo src. El navegador calcula el hash sobre el texto
// exacto entre las etiquetas, así que no se toca nada (ni espacios ni saltos de línea).
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const HAS_SRC = /(?:^|\s)src\s*=/i;
// Los bloques de datos (JSON, plantillas…) no se ejecutan y no necesitan hash.
const NON_JS_TYPE = /(?:^|\s)type\s*=\s*["']?(?!module\b|text\/javascript\b|application\/javascript\b)[^"'\s>]+/i;

const hashes = new Set();
const perFile = [];

for await (const file of htmlFiles(dist)) {
  const html = await readFile(file, 'utf8');
  let count = 0;
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (HAS_SRC.test(attrs) || NON_JS_TYPE.test(attrs) || body.length === 0) continue;
    hashes.add(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
    count += 1;
  }
  perFile.push(`${relative(dist, file).replaceAll('\\', '/')}: ${count}`);
}

const list = [...hashes].sort();
await writeFile(join(dist, 'csp-hashes.json'), `${JSON.stringify(list, null, 2)}\n`);
console.log(`csp-hashes.json: ${list.length} hashes distintos (${perFile.join(', ')})`);
