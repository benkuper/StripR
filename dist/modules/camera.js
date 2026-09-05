export class Camera {
  constructor(video) { this.video=video; this.stream=null; this.canvas=document.createElement('canvas'); this.ctx=this.canvas.getContext('2d',{willReadFrequently:true}); }
  async start(deviceId) {
    this.stop();
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost. Open the published StripR site in your browser.');
    const video = { width:{ideal:1280},height:{ideal:720}, ...(deviceId ? {deviceId:{exact:deviceId}} : {facingMode:{ideal:'environment'}}) };
    try { this.stream=await navigator.mediaDevices.getUserMedia({video,audio:false}); }
    catch(e) {
      const messages={NotAllowedError:'Camera permission was denied. Allow camera access in your browser’s site settings.',NotFoundError:'No camera found. Connect a camera and try again.',NotReadableError:'The camera is busy. Close other camera apps and try again.'};
      throw new Error(messages[e.name] || e.message);
    }
    this.video.srcObject=this.stream;
    try { await this.video.play(); await this.freshFrame(); } catch(e) {this.stop();throw e;}
    const devices=await navigator.mediaDevices.enumerateDevices().catch(()=>[]);
    return devices.filter(d=>d.kind==='videoinput');
  }
  stop() { this.stream?.getTracks().forEach(t=>t.stop()); this.stream=null; this.video.srcObject=null; }
  get active() {return !!this.stream?.getVideoTracks().some(t=>t.readyState==='live');}
  async freshFrame(signal) {
    if(signal?.aborted) throw new DOMException('Stopped','AbortError');
    await new Promise((resolve,reject)=>{
      let callback, timer;
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(callback && this.video.cancelVideoFrameCallback)this.video.cancelVideoFrameCallback(callback);};
      const done=()=>{cleanup();resolve();},abort=()=>{cleanup();reject(new DOMException('Stopped','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});
      if(this.video.requestVideoFrameCallback) {callback=this.video.requestVideoFrameCallback(done);timer=setTimeout(()=>{cleanup();reject(new Error('Camera stopped delivering frames. Keep the screen awake and restart the camera.'));},3000);}
      else timer=setTimeout(done,80);
    });
    if(!this.active || !this.video.videoWidth) throw new Error('The camera disconnected. Restart it to continue.');
  }
  async capture(samples=1,signal) {
    const width=Math.min(640,this.video.videoWidth),height=Math.round(width*this.video.videoHeight/this.video.videoWidth);
    if(!width || !height) throw new Error('The camera is not ready.');
    this.canvas.width=width;this.canvas.height=height;
    const sum=new Float32Array(width*height*4);
    for(let n=0;n<samples;n++) {await this.freshFrame(signal);this.ctx.drawImage(this.video,0,0,width,height);const data=this.ctx.getImageData(0,0,width,height).data;for(let i=0;i<data.length;i++)sum[i]+=data[i]/samples;}
    return {data:sum,width,height};
  }
}
export function delay(ms,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted) return reject(new DOMException('Stopped','AbortError'));
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});
  });
}
