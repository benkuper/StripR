/** Connected components in a positive light-minus-dark image. Coordinates are top-left normalized. */
export function detectPixel(dark, light, width, height, settings) {
  if (dark.length !== light.length || light.length !== width*height*4) throw new Error('Camera frame size changed. Restart the scan.');
  const diff = new Float32Array(width*height);
  for (let i=0;i<diff.length;i++) {
    const p=i*4;
    diff[i]=Math.max(light[p]-dark[p],light[p+1]-dark[p+1],light[p+2]-dark[p+2],0);
  }
  const seen=new Uint8Array(diff.length), queue=new Int32Array(diff.length); const blobs=[];
  for(let i=0;i<diff.length;i++) {
    if(seen[i] || diff[i]<settings.threshold) continue;
    let head=0,tail=1,weight=0,xsum=0,ysum=0,peak=0; queue[0]=i; seen[i]=1;
    while(head<tail) {
      const at=queue[head++],x=at%width,y=Math.floor(at/width),v=diff[at];
      weight+=v; xsum+=(x+.5)*v; ysum+=(y+.5)*v; peak=Math.max(peak,v);
      const neighbors=[];
      if(x>0) neighbors.push(at-1); if(x+1<width) neighbors.push(at+1);
      if(y>0) neighbors.push(at-width); if(y+1<height) neighbors.push(at+width);
      for(const next of neighbors) if(!seen[next] && diff[next]>=settings.threshold) {seen[next]=1;queue[tail++]=next;}
    }
    if(tail>=settings.minArea && tail<=settings.maxArea) blobs.push({weight,x:xsum/weight/width,y:ysum/weight/height,peak,area:tail});
  }
  blobs.sort((a,b)=>b.weight-a.weight);
  if(!blobs.length) return null;
  const b=blobs[0],dominance=blobs[1] ? 1-blobs[1].weight/b.weight : 1;
  // Similar competing reflections must be reviewed; never invent a coordinate.
  if(dominance<.2) return null;
  return {x:b.x,y:b.y,confidence:Math.min(1,(b.peak/150)*(.55+.45*dominance)),source:'scan'};
}
