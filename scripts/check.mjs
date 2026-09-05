import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
async function walk(dir){const paths=[];for(const item of await readdir(dir)){const p=resolve(dir,item);if((await stat(p)).isDirectory())paths.push(...await walk(p));else paths.push(p);}return paths;}
const files=await walk(resolve(root,'dist'));
for(const file of [...files,...await walk(resolve(root,'bridge'))].filter(f=>/\.(m?js)$/.test(f))){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);const content=await readFile(file,'utf8');for(const m of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g))await stat(resolve(dirname(file),m[1].split(/[?#]/,1)[0]));}
const html=await readFile(resolve(root,'dist/index.html'),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML IDs.');
const js=await readFile(resolve(root,'dist/app.js'),'utf8');for(const m of js.matchAll(/(?<!\$)\$\('([^']+)'\)/g)){if(!ids.includes(m[1]))throw new Error('Missing HTML ID: '+m[1]);}
for(const m of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))await stat(resolve(root,'dist',m[1].split(/[?#]/,1)[0]));
console.log(`Checked ${files.length} static files, local imports, HTML IDs, assets, and JavaScript syntax.`);
