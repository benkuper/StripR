import { pixelAddress, pixelChannels, validateProject, totals } from './model.js';

export const escapeXML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const param=(name,type,value)=>`<Param name="${name}" T="${type}" default="${escapeXML(value)}" value="${escapeXML(value)}"/>`;
const choice=(name,type,value)=>`<ParamChoice name="${name}" T="${type}" default="${escapeXML(value)}" value="${escapeXML(value)}" storeChoices="0"/>`;
const range=(name,value,min,max)=>`<ParamRange name="${name}" T="DOUBLE" default="${value}" value="${value}"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/>${['defaultRange','minMax','startStop'].map(n=>`<ValueRange name="${n}" min="${min}" max="${max}"/>`).join('')}</ParamRange>`;
const levels=()=>['Brightness','Contrast','Red','Green','Blue'].map(n=>range(n,0,-1,1)).join('');
const rect=(tag,x,y,w,h)=>`<${tag} orientation="0">${[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([a,b])=>`<v x="${a.toFixed(5)}" y="${b.toFixed(5)}"/>`).join('')}</${tag}>`;

/** Resolume Arena 7 ScreenSetup, embedded 1x1 DMX fixtures, one Lumiverse per physical universe.
 * Serialization fields cross-checked against actual Arena presets (see docs/EXPORTS.md).
 * Output is disabled until the user selects a controller in Arena.
 */
export function exportResolume(raw) {
  const p=validateProject(raw), stats=totals(p);
  if(!stats.mapped) throw new Error('Map at least one LED before exporting.');
  if(p.strips.some(s=>s.points.some((point,index)=>point&&new Set(pixelChannels(s,index).map(a=>a.universe)).size>1))) throw new Error('Resolume export cannot split one LED across two universes. Use the “Next LED” universe policy or adjust the first address.');
  const {width,height,sampleSize,gamma}=p.settings, groups=new Map(); let uid=Date.now();
  p.strips.forEach(s=>s.points.forEach((point,index)=>{
    if(!point) return;
    const address=pixelAddress(s,index);
    if(!groups.has(address.universe)) groups.set(address.universe,[]);
    groups.get(address.universe).push({s,point,index,...address});
  }));
  const screens=[...groups].sort(([a],[b])=>a-b).map(([universe,pixels],screenIndex)=>{
    const title=`StripR · U${universe}`;
    const slices=pixels.map(({s,point,index,channel})=>{
      const fixtureId=`53545249505200000000${String(++uid).slice(-12)}`;
      const size=Math.min(sampleSize,width,height), x=Math.max(0,Math.min(width-size,point.x*width-size/2)),y=Math.max(0,Math.min(height-size,point.y*height-size/2));
      return `<DmxSlice uniqueId="${++uid}">
<Params name="Common">${param('Name','STRING',`${s.name} · LED ${index+1}`)}${param('Enabled','BOOL',1)}</Params>
<Params name="Input">${choice('Input Source','STRING','0:1')}${param('Input Opacity','BOOL',1)}${param('Input Bypass/Solo','BOOL',1)}${choice('Fixture','STRING',fixtureId)}${range('Start Channel',channel,1,131072)}${choice('Filter Mode','INT32',0)}</Params>
<Params name="Output">${param('Flip','UINT8',0)}${levels()}</Params>
${rect('InputRect',x,y,size,size)}${rect('OutputRect',-.5,-.5,1,1)}
<FixtureInstance name="FixtureInstance"><Fixture name="Fixture" uuid="${fixtureId}" fixtureName="StripR ${s.type.toUpperCase()} pixel"><Params name="Params"><ParamFixturePixels storage="0" name="Pixels">${range('Width',1,1,512)}${range('Height',1,1,512)}${choice('Color Format','STRING',s.order+(s.type==='rgba'?'a':''))}${choice('Distribution','INT32',170)}${range('Gamma',gamma,1,3)}</ParamFixturePixels></Params></Fixture></FixtureInstance>
</DmxSlice>`;
    }).join('\n');
    return `<DmxScreen name="${escapeXML(title)}" uniqueId="${++uid}" LumiverseId="${screenIndex}">
<Params name="Params">${param('Name','STRING',title)}${param('Enabled','BOOL',1)}${param('Hidden','BOOL',0)}${param('Auto Span','BOOL',0)}${param('Align Output','BOOL',0)}</Params>
<Params name="Output">${range('Opacity',1,0,1)}${levels()}</Params>
<guides>${[0,1].map(type=>`<ScreenGuide name="ScreenGuide" type="${type}"><Params name="Params"><ParamPixels name="Image"/>${range('Opacity',.25,0,1)}</Params></ScreenGuide>`).join('')}</guides>
<layers>${slices}</layers>
<OutputDevice><OutputDeviceDmx name="Lumiverse" deviceId="Lumiverse" idHash="${screenIndex+1}"><Params name="Params">${range('Framerate',30,1,40)}${range('Delay',0,0,150)}${choice('Dmx Interface','INT32',0)}</Params><DmxOutputParams name="Params">${param('TargetIP','STRING','TT_DISABLED')}${range('Subnet',Math.floor(universe/16),0,15)}${range('Universe',universe%16,0,15)}</DmxOutputParams></OutputDeviceDmx></OutputDevice>
</DmxScreen>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<XmlState name="${escapeXML(p.name)}">
<versionInfo name="Resolume Arena" majorVersion="7" minorVersion="22" microVersion="9" revision="47596"/>
<ScreenSetup name="ScreenSetup"><Params name="ScreenSetupParams"/><CurrentCompositionTextureSize width="${width}" height="${height}"/>
<screens>${screens}</screens>
<SoftEdging><Params name="Soft Edge">${['Red','Green','Blue'].map(c=>range(`Gamma ${c}`,2,1,3)).join('')}${range('Gamma',1,0,1)}${range('Luminance',.5,0,1)}${range('Power',2,.1,7)}</Params></SoftEdging>
</ScreenSetup></XmlState>`;
}
