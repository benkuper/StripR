/** Verify straight, evenly spaced strips using endpoints and three interior probes.
 * The checks deliberately reject bends, uneven spacing, missing detections and reflections.
 * A probe-based fit cannot guarantee the unsampled LEDs; inferred points are always marked.
 */
export function probeIndices(count) {
  return [...new Set([0,Math.round((count-1)*.25),Math.round((count-1)*.5),Math.round((count-1)*.75),count-1])].sort((a,b)=>a-b);
}
export function fitStraightStrip(points,count,tolerance=.004) {
  const indices=probeIndices(count);
  if(count<12||indices.some(i=>!points[i]||points[i].confidence<.6))return null;
  const a=points[0],b=points[count-1],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  // A line shorter than 8% of the image is too ambiguous for this fast path.
  if(length<.08)return null;
  const threshold=Math.min(tolerance,length*.025);
  let maxError=0;
  for(const i of indices){const t=i/(count-1),p=points[i],error=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(error>threshold)return null;maxError=Math.max(maxError,error);}
  const confidence=Math.min(...indices.map(i=>points[i].confidence));
  return {maxError,points:Array.from({length:count},(_,i)=>points[i]||{x:a.x+dx*i/(count-1),y:a.y+dy*i/(count-1),confidence,source:'interpolated'})};
}
