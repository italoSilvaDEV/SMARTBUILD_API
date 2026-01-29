/**
 * Comenta apenas chamadas console.log/error/warn/info/debug.
 * Não altera linhas já comentadas nem texto dentro de strings.
 * Uma substituição por linha: a primeira ocorrência de "console.XXX(" vira "// console.XXX(".
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const CONSOLE_RE = /\bconsole\.(log|error|warn|info|debug)\s*\(/;

function walk(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, list);
    else if (/\.(ts|js)$/.test(e.name)) list.push(full);
  }
  return list;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let changed = false;
  const out = lines.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//')) return line;
    if (!CONSOLE_RE.test(line)) return line;
    const newLine = line.replace(new RegExp(CONSOLE_RE.source, 'g'), '// console.$1(');
    if (newLine !== line) changed = true;
    return newLine;
  });
  if (changed) fs.writeFileSync(filePath, out.join('\n'), 'utf8');
  return changed;
}

const files = walk(SRC);
let count = 0;
for (const f of files) {
  if (processFile(f)) {
    count++;
    console.log('Comentado:', path.relative(SRC, f));
  }
}
console.log('Arquivos alterados:', count);
