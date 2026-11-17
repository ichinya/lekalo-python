// Immutable dependency ownership; no source snapshots in this runtime.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const manifest=readFileSync(new URL('Cargo.toml',root),'utf8');
const lock=readFileSync(new URL('Cargo.lock',root),'utf8');
for(const [name,repo] of [['lekalo-adapter-sdk-rust','lekalo-adapter-sdk'],['lekalo-python-fastapi','lekalo-python-fastapi']]) {
 const line=manifest.split('\n').find(s=>s.startsWith(name+' = '));
 const pin=line?.match(/rev = "([a-f0-9]{40})"/)?.[1];
 assert(pin && line.includes(`git = "https://github.com/ichinya/${repo}"`));
 assert(lock.includes(`git+https://github.com/ichinya/${repo}?rev=${pin}#${pin}`));
}
assert(!existsSync(new URL('vendor/lekalo-python-fastapi/Cargo.toml',root)));
console.log(JSON.stringify({ok:true,dependencies:2}));
