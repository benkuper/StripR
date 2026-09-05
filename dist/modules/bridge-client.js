export class Bridge {
  constructor(url,token='') {
    const parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Enter an HTTP or HTTPS server URL without credentials or query parameters.');
    this.url=parsed.href.replace(/\/$/,'');this.token=token;
  }
  async request(path,body,signal) {
    const abort=new AbortController(); const timeout=setTimeout(()=>abort.abort(),6000);
    const onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)abort.abort();
    try {
      const response=await fetch(this.url+path,{method:body ? 'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(this.token?{'Authorization':`Bearer ${this.token}`}:{})},body:body ? JSON.stringify(body):undefined,signal:abort.signal,cache:'no-store',credentials:'omit',targetAddressSpace:'local'});
      const data=await response.json().catch(()=>{throw new Error('The server did not return JSON. Check the bridge URL.');});
      if(!response.ok || data.ok===false)throw new Error(data.error || `Bridge error ${response.status}.`);
      return data;
    } catch(e) {
      if(signal?.aborted)throw new DOMException('Stopped','AbortError');
      if(e.name==='AbortError')throw new Error('The bridge timed out. Check the server and Wi-Fi connection.');
      if(e instanceof TypeError)throw new Error('Could not reach the bridge. Check its URL, token, CORS origin, and local network permission. On iPhone/iPad, use a trusted HTTPS bridge.');
      throw e;
    } finally {clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);}
  }
  async health() {const r=await this.request('/api/health');if(r.protocol!=='stripr/1')throw new Error('This server does not support the StripR v1 API.');return r;}
  configure(strips) {return this.request('/api/configure',{strips:strips.map(({id,count,universe,channel,order})=>({id,count,universe,channel,order}))});}
  pixel(strip,index,rgb,signal) {return this.request('/api/pixel',{strip,index,rgb},signal);}
  blackout() {return this.request('/api/blackout',{});}
}
