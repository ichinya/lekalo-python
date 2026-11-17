// Developer-only source update. Runtime execution never runs Git or resolves dependencies.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const checkout = resolve(process.env.LEKALO_FASTAPI_DIR ?? join(root, '..', 'lekalo-python-fastapi'));
const source = 'crates/lekalo-python-fastapi', destination = 'vendor/lekalo-python-fastapi';
const lockPath = join(root, 'framework-source.lock.json');
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const previous = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : undefined;
if (previous) for (const [path, digest] of Object.entries(previous.files)) {
  assert.equal(sha(readFileSync(join(root, destination, path))), digest, `Modified provider snapshot: ${path}`);
}
const git = args => execFileSync('git', args, {cwd:checkout,maxBuffer:16*1024*1024});
const commit = git(['rev-parse','HEAD']).toString().trim();
const rows = git(['ls-tree','-r','-z',commit,'--',source]).toString().split('\0').filter(Boolean);
assert(rows.length > 0, 'Empty framework package');
const staged = rows.map(row => {
  const [header, full] = row.split('\t');
  assert(/^100644 blob [a-f0-9]{40}$/.test(header));
  assert(full.startsWith(source+'/'));
  const path = full.slice(source.length+1);
  assert(path.split('/').every(part => part && part !== '.' && part !== '..'));
  return {path,bytes:git(['show',commit+':'+full])};
});
const files = Object.fromEntries(staged.map(({path,bytes}) => [path,sha(bytes)]));
for (const {path,bytes} of staged) {
  const target = join(root,destination,path); mkdirSync(dirname(target),{recursive:true}); writeFileSync(target,bytes);
}
for (const path of Object.keys(previous?.files ?? {})) if (!(path in files)) rmSync(join(root,destination,path));
writeFileSync(lockPath,JSON.stringify({repository:'https://github.com/ichinya/lekalo-python-fastapi',commit,source,destination,files},null,2)+'\n');
console.log(JSON.stringify({ok:true,commit,files:staged.length}));
