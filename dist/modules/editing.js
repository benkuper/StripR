export function transformCoordinates(points,{dx=0,dy=0,scale=1,rotation=0}={}){
  if(!Array.isArray(points)||!points.length)throw new Error('Select at least one mapped LED.');
  for(const [name,value] of Object.entries({dx,dy,scale,rotation}))if(!Number.isFinite(value))throw new Error(`${name} must be a number.`);
  if(scale<=0||scale>100)throw new Error('Scale must be greater than 0 and no more than 100.');
  const center=points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length}),{x:0,y:0});
  const angle=rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const transformed=points.map(point=>{
    const x=(point.x-center.x)*scale,y=(point.y-center.y)*scale;
    return {...point,x:center.x+x*cos-y*sin+dx,y:center.y+x*sin+y*cos+dy,confidence:1,source:'manual'};
  });
  const xs=transformed.map(p=>p.x),ys=transformed.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  if(maxX-minX>1+1e-9||maxY-minY>1+1e-9)throw new Error('The transformed selection is too large to fit on the map.');
  const adjustX=minX<0?-minX:maxX>1?1-maxX:0,adjustY=minY<0?-minY:maxY>1?1-maxY:0;
  return transformed.map(point=>({...point,x:Math.max(0,Math.min(1,point.x+adjustX)),y:Math.max(0,Math.min(1,point.y+adjustY))}));
}

export class EditHistory {
  constructor(limit=100){this.limit=limit;this.undoStack=[];this.redoStack=[];}
  get canUndo(){return this.undoStack.length>0;}get canRedo(){return this.redoStack.length>0;}
  get undoLabel(){return this.undoStack.at(-1)?.label||'';}get redoLabel(){return this.redoStack.at(-1)?.label||'';}
  record(before,after,label){if(before===after)return false;this.undoStack.push({state:before,label});if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack.length=0;return true;}
  undo(current){return this.#step(this.undoStack,this.redoStack,current);}
  redo(current){return this.#step(this.redoStack,this.undoStack,current);}
  #step(from,to,current){if(!from.length)return null;const entry=from.pop();to.push({state:current,label:entry.label});return entry;}
}
