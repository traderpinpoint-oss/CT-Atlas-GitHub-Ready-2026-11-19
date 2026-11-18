import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name));
const manifest=JSON.parse(read('asset-manifest.json'));
for(const item of manifest.files){
  const contents=read(item.path);
  assert.equal(contents.length,item.bytes,`Size mismatch: ${item.path}`);
  assert.equal(crypto.createHash('sha256').update(contents).digest('hex'),item.sha256,`Changed or corrupted: ${item.path}`);
}
const context=vm.createContext({window:{}});
for(const name of ['data.js','head-data.js','cardiac-data.js','chest-data.js','multiplanar-data.js'])vm.runInContext(read(name).toString(),context,{filename:name});
const w=context.window;
const series=[{id:'abdomen',views:w.CT_VIEWS},...w.HEAD_SERIES,...w.CARDIAC_SERIES,...w.CHEST_SERIES,...w.MULTIPLANAR_SERIES];
assert.equal(series.length,15);
let count=0;
for(const s of series)for(const view of s.views){assert.ok(fs.existsSync(path.join(root,view.image)),`Missing image: ${view.image}`);count++;}
assert.equal(count,1509);
for(const [,url] of read('index.html').toString().matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(?:https?:|data:)/.test(url))continue;
  assert.ok(fs.existsSync(path.join(root,url.split('?')[0])),`Missing HTML dependency: ${url}`);
}
console.log(`PASS: ${series.length} series, ${count} recorded views; ${manifest.files.length} file hashes and HTML dependencies verified.`);
