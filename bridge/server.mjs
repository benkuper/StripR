#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {getAsset,isSea} from 'node:sea';
import {spawn} from 'node:child_process';
import {validatePatch,pixelChannels,integer} from '../dist/modules/model.js';

const ROOT=isSea()?null:fileURLToPath(new URL('../dist/',import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const SACN_CID=randomBytes(16);SACN_CID[6]=(SACN_CID[6]&0x0f)|0x40;SACN_CID[8]=(SACN_CID[8]&0x3f)|0x80;
async function staticAsset(urlPath){
  const relative=decodeURIComponent(urlPath==='/'?'index.html':urlPath.replace(/^\/+/,''));
  if(!relative||relative.split('/').includes('..')||relative.includes('\\'))return null;
  if(isSea()){try{return Buffer.from(getAsset('dist/'+relative));}catch{return null;}}
  const local=resolve(ROOT,relative),prefix=ROOT.endsWith(sep)?ROOT:ROOT+sep;
  if(local!==ROOT&&!local.startsWith(prefix))return null;
  return readFile(local).catch(()=>null);
}

export function targetConfigPath({platform=process.platform,env=process.env,home=homedir()}={}){
  if(platform==='win32')return join(env.APPDATA||join(home,'AppData','Roaming'),'StripR','config.json');
  if(platform==='darwin')return join(home,'Library','Application Support','StripR','config.json');
  return join(env.XDG_CONFIG_HOME||join(home,'.config'),'stripr','config.json');
}
export async function readLastTarget(path=targetConfigPath()){
  return (await readOutputConfig(path)).lastTarget;
}
export async function readOutputConfig(path=targetConfigPath()){
  try{const value=JSON.parse(await readFile(path,'utf8'));return{lastTarget:typeof value.lastTarget==='string'?value.lastTarget.trim():'',protocol:['artnet','sacn'].includes(value.protocol)?value.protocol:'artnet'};}catch{return{lastTarget:'',protocol:'artnet'};}
}
export async function rememberTarget(target,path=targetConfigPath()){
  const current=await readOutputConfig(path);await rememberOutput({target,protocol:current.protocol},path);
}
export async function rememberOutput({target,protocol},path=targetConfigPath()){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  await writeFile(path,JSON.stringify({lastTarget:target,protocol},null,2)+'\n',{encoding:'utf8',mode:0o600});
}
export async function promptForTarget(lastTarget='',{input=process.stdin,output=process.stdout}={}){
  const terminal=Boolean(lastTarget&&input.isTTY&&output.isTTY),rl=createInterface({input,output});
  try{
    const answer=rl.question(`LED controller target${lastTarget&&!terminal?' ['+lastTarget+']':''}: `);
    if(terminal)rl.write(lastTarget);
    return (await answer).trim()||lastTarget;
  }finally{rl.close();}
}
export function launchBrowser(url,{platform=process.platform,spawnProcess=spawn,env=process.env}={}){
  try{
    const command=platform==='win32'?(env.ComSpec||'cmd.exe'):platform==='darwin'?'open':'xdg-open';
    const args=platform==='win32'?['/d','/s','/c','start','""',url]:[url];
    const child=spawnProcess(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.once?.('error',()=>{});child.unref();return true;
  }catch{return false;}
}
export async function selectTarget(options,{ask=promptForTarget,configFile=targetConfigPath(),warn=message=>process.stderr.write(message+'\n')}={}){
  if(options.demo)return null;
  let target=options.target?.trim(),lastTarget='';
  if(!target){
    lastTarget=await readLastTarget(configFile);
    while(!target){target=(await ask(lastTarget)).trim()||lastTarget;if(!target)warn('Enter the LED controller address.');}
  }
  try{await rememberTarget(target,configFile);}catch(e){warn(`Could not remember target: ${e.message}`);}
  return target;
}
export function artDmxPacket(universe,data,sequence=1){
  if(!Number.isInteger(universe)||universe<0||universe>32767)throw new Error('Invalid Art-Net universe.');
  if(data.length>512)throw new Error('DMX data exceeds 512 channels.');
  const size=Math.max(2,data.length+(data.length%2)),packet=Buffer.alloc(18+size);
  packet.write('Art-Net\0',0,'ascii');packet.writeUInt16LE(0x5000,8);packet.writeUInt16BE(14,10);packet[12]=sequence;packet[13]=0;packet.writeUInt16LE(universe,14);packet.writeUInt16BE(size,16);Buffer.from(data).copy(packet,18);return packet;
}
export function sacnDataPacket(universe,data,sequence=0,{cid=SACN_CID,sourceName='StripR',priority=100}={}){
  if(!Number.isInteger(universe)||universe<1||universe>63999)throw new Error('Invalid sACN universe.');
  if(data.length>512)throw new Error('DMX data exceeds 512 channels.');
  if(!Number.isInteger(sequence)||sequence<0||sequence>255)throw new Error('Invalid sACN sequence.');
  if(!Number.isInteger(priority)||priority<0||priority>200)throw new Error('Invalid sACN priority.');
  const source=Buffer.from(sourceName,'utf8'),componentId=Buffer.from(cid);
  if(componentId.length!==16)throw new Error('sACN CID must contain 16 bytes.');
  const values=Buffer.from(data),packet=Buffer.alloc(126+values.length);
  packet.writeUInt16BE(0x0010,0);packet.writeUInt16BE(0,2);packet.write('ASC-E1.17\0\0\0',4,'ascii');
  packet.writeUInt16BE(0x7000|(packet.length-16),16);packet.writeUInt32BE(0x00000004,18);componentId.copy(packet,22);
  packet.writeUInt16BE(0x7000|(packet.length-38),38);packet.writeUInt32BE(0x00000002,40);source.copy(packet,44,0,Math.min(source.length,63));
  packet[108]=priority;packet.writeUInt16BE(0,109);packet[111]=sequence;packet[112]=0;packet.writeUInt16BE(universe,113);
  packet.writeUInt16BE(0x7000|(packet.length-115),115);packet[117]=0x02;packet[118]=0xa1;packet.writeUInt16BE(0,119);packet.writeUInt16BE(1,121);packet.writeUInt16BE(values.length+1,123);packet[125]=0;values.copy(packet,126);return packet;
}
export class ArtNetAdapter {
  constructor(target){this.target=target;this.socket=dgram.createSocket('udp4');this.frames=new Map();this.sequence=1;this.lastError=null;this.socket.on('error',e=>{this.lastError=e;});this.interval=setInterval(()=>this.flush().catch(e=>{this.lastError=e;}),1000/30);this.interval.unref();}
  async configure(strips){await this.blackout();this.frames.clear();for(const s of strips)for(let i=0;i<s.count;i++)for(const {universe} of pixelChannels(s,i))if(!this.frames.has(universe))this.frames.set(universe,Buffer.alloc(512));}
  async pixel(strip,index,rgb){for(const data of this.frames.values())data.fill(0);const colors={r:rgb[0],g:rgb[1],b:rgb[2],a:255},values=(strip.order+(strip.type==='rgba'?'a':'')).split('').map(c=>colors[c]);pixelChannels(strip,index).forEach(({universe,channel},i)=>this.frames.get(universe)[channel-1]=values[i]);await this.flush();}
  async blackout(){for(const data of this.frames.values())data.fill(0);await this.flush();}
  async flush(){if(this.lastError){const e=this.lastError;this.lastError=null;throw e;}const sequence=this.sequence;this.sequence=this.sequence%255+1;await Promise.all([...this.frames].map(([universe,data])=>new Promise((res,rej)=>this.socket.send(artDmxPacket(universe,data,sequence),6454,this.target,e=>e?rej(e):res()))));}
  async close(){clearInterval(this.interval);try{await this.blackout();}finally{try{this.socket.close();}catch{}}}
}
export class SacnAdapter {
  constructor(target,{socket=dgram.createSocket('udp4'),cid=SACN_CID,sourceName='StripR',refreshHz=30}={}){this.target=target;this.socket=socket;this.cid=Buffer.from(cid);this.sourceName=sourceName;this.frames=new Map();this.sequence=0;this.lastError=null;this.socket.on?.('error',e=>{this.lastError=e;});this.interval=refreshHz>0?setInterval(()=>this.flush().catch(e=>{this.lastError=e;}),1000/refreshHz):null;this.interval?.unref();}
  async configure(strips){await this.blackout();this.frames.clear();for(const s of strips)for(let i=0;i<s.count;i++)for(const {universe} of pixelChannels(s,i))if(!this.frames.has(universe))this.frames.set(universe,Buffer.alloc(512));}
  async pixel(strip,index,rgb){for(const data of this.frames.values())data.fill(0);const colors={r:rgb[0],g:rgb[1],b:rgb[2],a:255},values=(strip.order+(strip.type==='rgba'?'a':'')).split('').map(c=>colors[c]);pixelChannels(strip,index).forEach(({universe,channel},i)=>this.frames.get(universe)[channel-1]=values[i]);await this.flush();}
  async blackout(){for(const data of this.frames.values())data.fill(0);await this.flush();}
  async flush(){if(this.lastError){const e=this.lastError;this.lastError=null;throw e;}const sequence=this.sequence;this.sequence=(this.sequence+1)&0xff;await Promise.all([...this.frames].map(([universe,data])=>new Promise((res,rej)=>this.socket.send(sacnDataPacket(universe+1,data,sequence,{cid:this.cid,sourceName:this.sourceName}),5568,this.target,e=>e?rej(e):res()))));}
  async close(){if(this.interval)clearInterval(this.interval);try{await this.blackout();}finally{try{this.socket.close();}catch{}}}
}
export class DemoAdapter {
  constructor(){this.current=null;this.strips=[];}
  async configure(strips){this.strips=strips;this.current=null;}
  async pixel(strip,index,rgb){this.current={strip:strip.id,index,rgb};}
  async blackout(){this.current=null;}
  async close(){await this.blackout();}
}
function outputSettings(protocol,target){
  const normalized=String(protocol||'').toLowerCase(),address=typeof target==='string'?target.trim():'';
  if(!['artnet','sacn'].includes(normalized))throw new Error('Protocol must be artnet or sacn.');
  if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(address))throw new Error('Enter a valid controller hostname or IPv4 address.');
  return{protocol:normalized,target:address};
}
export class OutputManager {
  constructor({demo=false,protocol='artnet',target='',createAdapter=(name,address)=>name==='sacn'?new SacnAdapter(address):new ArtNetAdapter(address),onChange=()=>{}}={}){this.demo=demo;this.createAdapter=createAdapter;this.onChange=onChange;this.protocol=String(protocol).toLowerCase();if(!['artnet','sacn'].includes(this.protocol))throw new Error('Protocol must be artnet or sacn.');this.target=typeof target==='string'?target.trim():'';if(this.target&&!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(this.target))throw new Error('Enter a valid controller hostname or IPv4 address.');this.adapter=demo?new DemoAdapter():this.target?createAdapter(this.protocol,this.target):null;}
  info(){return this.demo?{protocol:'demo',target:'',configured:true}:{protocol:this.protocol,target:this.target,configured:Boolean(this.adapter),port:this.protocol==='sacn'?5568:6454,universeOffset:this.protocol==='sacn'?1:0};}
  async setOutput(settings){if(this.demo)throw new Error('Simulation mode has no hardware output.');const nextSettings=outputSettings(settings?.protocol,settings?.target);if(this.adapter&&nextSettings.protocol===this.protocol&&nextSettings.target===this.target)return this.info();const next=this.createAdapter(nextSettings.protocol,nextSettings.target),old=this.adapter;this.adapter=null;try{await old?.close();}catch(e){await next.close().catch(()=>{});this.adapter=old;throw e;}this.protocol=nextSettings.protocol;this.target=nextSettings.target;this.adapter=next;await this.onChange(nextSettings);return this.info();}
  requireAdapter(){if(!this.adapter)throw new Error('Configure the controller protocol and address first.');return this.adapter;}
  configure(strips){return this.requireAdapter().configure(strips);}
  pixel(strip,index,rgb){return this.requireAdapter().pixel(strip,index,rgb);}
  blackout(){return this.adapter?.blackout()??Promise.resolve();}
  close(){const adapter=this.adapter;this.adapter=null;return adapter?.close()??Promise.resolve();}
}
function equalToken(value,expected){const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
async function readJSON(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw Object.assign(new Error('Use Content-Type: application/json.'),{status:415});
  const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>256*1024)throw Object.assign(new Error('Request too large.'),{status:413});chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON body.'),{status:400});}
}
export function createBridge({adapter=new DemoAdapter(),adapterName='demo',token='',origins=['https://benkuper.github.io'],tls=null,watchdogMs=10000}={}){
  let strips=[],lastCommand=0,active=false,queue=Promise.resolve(),closed=false;
  const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const watchdog=setInterval(()=>{if(active&&Date.now()-lastCommand>watchdogMs){active=false;serial(()=>adapter.blackout()).catch(e=>process.stderr.write('Watchdog blackout error: '+e.message+'\n'));}},250);watchdog.unref();
  const handler=async(req,res)=>{
    const origin=req.headers.origin,ownOrigin=`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;const allowed=origin&&(origins.includes(origin)||origin===ownOrigin);
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
    if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('Access-Control-Max-Age','600');}
    const send=(status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}};
    try{
      if(origin&&!allowed)return send(403,{ok:false,error:'Origin is not allowed. Add this site’s exact origin with --origin.'});
      const path=new URL(req.url,'http://stripr.local').pathname;
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(!path.startsWith('/api/')){
        if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{ok:false,error:'Method not allowed.'});
        const data=await staticAsset(path);if(!data)return send(404,{ok:false,error:'File not found.'});
        res.writeHead(200,{'Content-Type':TYPES[extname(path==='/'?'index.html':path)]||'application/octet-stream'});return res.end(req.method==='HEAD'?undefined:data);
      }
      if(token&&!equalToken(req.headers.authorization||'',`Bearer ${token}`))return send(401,{ok:false,error:'Invalid bridge token. Copy the token printed by the bridge.'});
      if(path==='/api/health'&&req.method==='GET'){const output=adapter.info?.();return send(200,{ok:true,protocol:'stripr/1',name:'StripR local app',adapter:output?.protocol||adapterName,watchdogMs,...(output?{output}:{})});}
      if(req.method!=='POST')return send(405,{ok:false,error:'Use POST for this endpoint.'});
      if(!['/api/output','/api/configure','/api/pixel','/api/blackout'].includes(path))return send(404,{ok:false,error:'Unknown API endpoint.'});
      const body=await readJSON(req);
      await serial(async()=>{
        if(closed)throw new Error('Bridge is closing.');
        if(path==='/api/output'){
          if(typeof adapter.setOutput!=='function')throw new Error('This bridge does not support runtime output configuration.');
          await adapter.setOutput(body);strips=[];active=false;
        } else if(path==='/api/configure'){
          validatePatch(body.strips);
          await adapter.blackout();active=false;
          await adapter.configure(body.strips);strips=body.strips.map(({id,count,type='rgb',universe,channel,universePolicy='led',order})=>({id,count,type,universe,channel,universePolicy,order}));
        } else if(path==='/api/pixel'){
          const strip=strips.find(s=>s.id===body.strip);if(!strip)throw new Error('Unknown strip. Configure the bridge first.');
          if(typeof body.index!=='number')throw new Error('LED index must be a number.');
          integer(body.index,0,strip.count-1,'LED index');
          if(!Array.isArray(body.rgb)||body.rgb.length!==3)throw new Error('rgb must contain three byte values.');
          body.rgb.forEach(v=>{if(typeof v!=='number')throw new Error('RGB values must be numbers.');integer(v,0,255,'RGB value');});
          await adapter.pixel(strip,body.index,body.rgb);lastCommand=Date.now();active=true;
        } else {await adapter.blackout();active=false;}
      });
      send(200,{ok:true});
    }catch(e){send(e.status||400,{ok:false,error:e.message});}
  };
  const server=tls?https.createServer(tls,handler):http.createServer(handler);server.requestTimeout=10000;server.headersTimeout=10000;
  return {server,token,async close(){closed=true;clearInterval(watchdog);await queue;await adapter.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}};
}
export function parseArgs(values){const out={origins:[]};for(let i=0;i<values.length;i++){const key=values[i];if(key==='--demo')out.demo=true;else if(key==='--no-open')out.noOpen=true;else if(key==='--help')out.help=true;else if(['--target','--protocol','--host','--port','--cert','--key','--origin'].includes(key)){const value=values[++i];if(!value||value.startsWith('--'))throw new Error(`Missing value for ${key}`);if(key==='--origin')out.origins.push(value);else out[key.slice(2)]=value;}else throw new Error(`Unknown option: ${key}`);}return out;}
export async function runCli(values=process.argv.slice(2),{input=process.stdin,output=process.stdout,error=process.stderr,configFile=targetConfigPath()}={}){
  const options=parseArgs(values);
  if(options.help){output.write('StripR local app\n  The executable contains the web interface and an Art-Net/sACN bridge.\n  --protocol NAME   Initial output protocol: artnet (default) or sacn\n  --target ADDRESS  Initial unicast controller address\n  --demo            Run without physical LED output\n  --no-open         Do not open the app in the default browser\n  --host ADDRESS    Listen address (default 0.0.0.0)\n  --port PORT       Listen port (default 8787)\n  --cert FILE --key FILE  Enable HTTPS\n  --origin URL      Additional allowed site origin; may be repeated\n  Output can be changed in the web interface and is remembered.\n  STRIPR_TOKEN environment variable enables optional token authentication.\n');return null;}
  const saved=await readOutputConfig(configFile),protocol=(options.protocol||saved.protocol||'artnet').toLowerCase();if(!['artnet','sacn'].includes(protocol))throw new Error('Protocol must be artnet or sacn.');options.protocol=protocol;
  if(options.demo&&options.target)throw new Error('Choose --demo or --target, not both.');
  options.target=options.demo?'':options.target?.trim()||saved.lastTarget;
  if(!options.demo&&options.target&&(options.target!==saved.lastTarget||protocol!==saved.protocol))try{await rememberOutput({target:options.target,protocol},configFile);}catch(e){error.write(`Could not remember output settings: ${e.message}\n`);}
  if(!!options.cert!==!!options.key)throw new Error('HTTPS requires both --cert and --key.');
  const port=integer(options.port||8787,1,65535,'Port'),host=options.host||'0.0.0.0',scheme=options.cert?'https':'http';
  const tls=options.cert?{cert:await readFile(options.cert),key:await readFile(options.key)}:null;
  const adapter=new OutputManager({demo:options.demo,protocol,target:options.target,onChange:settings=>rememberOutput(settings,configFile).catch(e=>error.write(`Could not remember output settings: ${e.message}\n`))});
  const origins=['https://benkuper.github.io',`${scheme}://localhost:${port}`,`${scheme}://127.0.0.1:${port}`,...options.origins];
  origins.forEach(o=>{if(new URL(o).origin!==o)throw new Error('Origins must contain scheme and hostname only, plus port when needed.');});
  const bridge=createBridge({adapter,adapterName:options.demo?'demo':protocol,token:process.env.STRIPR_TOKEN||undefined,origins,tls});
  bridge.server.on('error',e=>{error.write(e.message+'\n');process.exitCode=1;});
  bridge.server.listen(port,host,()=>{const appUrl=`${scheme}://localhost:${port}`,outputName=protocol==='sacn'?'sACN':'Art-Net',outputState=options.demo?'SIMULATION — no hardware output':options.target?outputName+' → '+options.target:'hardware output not configured — choose it in the web interface';output.write(`StripR · ${outputState}\nLocal app: ${appUrl}\nFrom a phone: use this computer’s LAN IP with port ${port}.\nToken authentication: ${bridge.token?'enabled; use '+bridge.token:'disabled (set STRIPR_TOKEN to enable)'}\nAllowed external origins: ${origins.join(', ')}\nOutputs clear after 10 seconds without pixel commands. Ctrl+C to stop.\n`);if(!options.noOpen&&!launchBrowser(appUrl))error.write(`Could not open a browser automatically. Open ${appUrl}\n`);});
  let stopping=false;const shutdown=async()=>{if(stopping)return;stopping=true;await bridge.close();};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  return bridge;
}
if(!isSea()&&process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runCli().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
