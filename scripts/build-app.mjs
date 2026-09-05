import {build} from 'esbuild';
import {inject} from 'postject';
import {copyFile,mkdir,open,readFile,readdir,stat,writeFile,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,relative,sep} from 'node:path';

const root=resolve(import.meta.dirname,'..'),outDir=resolve(root,'build');
const suffix=process.platform==='win32'?'.exe':'';
const platformName={win32:'windows',darwin:'macos'}[process.platform]||process.platform;
const artifact=process.env.STRIPR_ARTIFACT_NAME||`stripr-${platformName}-${process.arch}${suffix}`;
const bundle=resolve(outDir,'stripr.cjs'),blob=resolve(outDir,'stripr.blob'),config=resolve(outDir,'sea-config.json'),executable=resolve(outDir,artifact);

async function files(dir){
  const result=[];
  for(const item of await readdir(dir)){const path=resolve(dir,item);if((await stat(path)).isDirectory())result.push(...await files(path));else result.push(path);}
  return result;
}
function run(command,args){
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${command} exited with status ${result.status}`);
}
async function removeWindowsSignature(path){
  const file=await open(path,'r+');
  try{
    const offset=Buffer.alloc(4);await file.read(offset,0,4,0x3c);const pe=offset.readUInt32LE();
    const magic=Buffer.alloc(2);await file.read(magic,0,2,pe+24);const value=magic.readUInt16LE();
    if(value!==0x10b&&value!==0x20b)throw new Error('Copied Node runtime is not a supported PE executable.');
    const securityDirectory=pe+24+(value===0x20b?112:96)+32;
    await file.write(Buffer.alloc(8),0,8,securityDirectory);
  }finally{await file.close();}
}

await mkdir(outDir,{recursive:true});
await build({entryPoints:[resolve(root,'bridge/app.mjs')],outfile:bundle,bundle:true,platform:'node',format:'cjs',target:'node22',define:{'import.meta.url':'"file:///stripr/bridge/server.mjs"'},logLevel:'info'});
const assets={};
for(const path of await files(resolve(root,'dist')))assets[relative(root,path).split(sep).join('/')]=path;
await writeFile(config,JSON.stringify({main:bundle,output:blob,disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false,assets},null,2));
run(process.execPath,['--experimental-sea-config',config]);
await copyFile(process.execPath,executable);
if(process.platform==='darwin')run('codesign',['--remove-signature',executable]);
if(process.platform==='win32')await removeWindowsSignature(executable);
await inject(executable,'NODE_SEA_BLOB',await readFile(blob),{sentinelFuse:'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',machoSegmentName:'NODE_SEA'});
await chmod(executable,0o755);
if(process.platform==='darwin')run('codesign',['--sign','-',executable]);
run(executable,['--help']);
process.stdout.write(`Built ${executable}\n`);
