export class Bridge {
  constructor(url,token='') {
    const parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Enter an HTTP or HTTPS server URL without credentials or query parameters.');
    this.url=parsed.href.replace(/\/$/,'');this.token=token;this.protocol=parsed.protocol;this.hostname=parsed.hostname;this.addressSpace=isLoopback(parsed.hostname)?'loopback':'local';this.targetAddressSpace=isExplicitNetworkAddress(parsed.hostname)?null:'local';
  }
  async request(path,body,signal) {
    const abort=new AbortController(); const timeout=setTimeout(()=>abort.abort(),6000);
    const onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)abort.abort();
    try {
      const response=await fetch(this.url+path,{method:body ? 'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(this.token?{'Authorization':`Bearer ${this.token}`}:{})},body:body ? JSON.stringify(body):undefined,signal:abort.signal,cache:'no-store',credentials:'omit',...(this.targetAddressSpace?{targetAddressSpace:this.targetAddressSpace}:{})});
      const data=await response.json().catch(()=>{throw new Error('The server did not return JSON. Check the bridge URL.');});
      if(!response.ok || data.ok===false)throw new Error(data.error || `Bridge error ${response.status}.`);
      return data;
    } catch(e) {
      if(signal?.aborted)throw new DOMException('Stopped','AbortError');
      if(e.name==='AbortError')throw new Error('The bridge timed out. Check the server and Wi-Fi connection.');
      if(e instanceof TypeError)throw new Error(this.connectionError());
      throw e;
    } finally {clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);}
  }
  connectionError() {
    const at=`Could not reach the bridge at ${this.url}.`;
    if(this.addressSpace==='loopback')return `${at} Make sure it is running. If the bridge is on another computer, localhost points to this device; use that computer's LAN IP instead.`;
    if(globalThis.isSecureContext&&this.protocol==='http:')return `${at} Allow local network access in Chrome/Edge. Safari and iPhone/iPad require the bridge to use trusted HTTPS.`;
    return `${at} Check that it is running, reachable on this network, allowed through the firewall, and permits this site's CORS origin.`;
  }
  async health() {const r=await this.request('/api/health');if(r.protocol!=='stripr/1')throw new Error('This server does not support the StripR v1 API.');return r;}
  output(protocol,target) {return this.request('/api/output',{protocol,target});}
  configure(strips) {return this.request('/api/configure',{strips:strips.map(({id,count,type,universe,channel,universePolicy,order})=>({id,count,type,universe,channel,universePolicy,order}))});}
  pixel(strip,index,rgb,signal) {return this.request('/api/pixel',{strip,index,rgb},signal);}
  blackout() {return this.request('/api/blackout',{});}
}

function isLoopback(hostname){return hostname==='localhost'||hostname.endsWith('.localhost')||hostname==='[::1]'||/^127(?:\.\d{1,3}){3}$/.test(hostname);}
function isExplicitNetworkAddress(hostname){return isLoopback(hostname)||hostname.endsWith('.local')||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)||/^\[.*\]$/.test(hostname);}
