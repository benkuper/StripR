import test from 'node:test';
import assert from 'node:assert/strict';
import {Bridge} from '../dist/modules/bridge-client.js';

test('bridge requests only hint the address space when the URL does not reveal it',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({ok:true,protocol:'stripr/1'}),{headers:{'Content-Type':'application/json'}});};
  try{
    await new Bridge('http://localhost:8787').health();
    await new Bridge('http://127.0.0.1:8787').health();
    await new Bridge('http://192.168.1.20:8787').health();
    await new Bridge('http://bridge.internal:8787').health();
    assert.deepEqual(calls.map(call=>call.options.targetAddressSpace),[undefined,undefined,undefined,'local']);
  }finally{globalThis.fetch=originalFetch;}
});

test('bridge token stays optional in requests',async()=>{
  const originalFetch=globalThis.fetch,headers=[];
  globalThis.fetch=async(url,options)=>{headers.push(options.headers);return new Response(JSON.stringify({ok:true,protocol:'stripr/1'}),{headers:{'Content-Type':'application/json'}});};
  try{
    await new Bridge('http://192.168.1.20:8787').health();
    await new Bridge('http://192.168.1.20:8787','secret').health();
    assert.equal(headers[0].Authorization,undefined);
    assert.equal(headers[1].Authorization,'Bearer secret');
  }finally{globalThis.fetch=originalFetch;}
});

test('bridge configuration includes strip type and universe policy',async()=>{
  const originalFetch=globalThis.fetch,bodies=[];
  globalThis.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});};
  try{
    await new Bridge('http://127.0.0.1:8787').configure([{id:'s',count:1,type:'rgba',universe:3,channel:511,universePolicy:'channel',order:'grb',points:[]}]);
    assert.deepEqual(bodies[0],{strips:[{id:'s',count:1,type:'rgba',universe:3,channel:511,universePolicy:'channel',order:'grb'}]});
  }finally{globalThis.fetch=originalFetch;}
});

test('bridge output selection sends protocol and controller target',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});};
  try{
    await new Bridge('http://127.0.0.1:8787').output('sacn','wled.local');
    assert.equal(calls[0].url,'http://127.0.0.1:8787/api/output');
    assert.deepEqual(calls[0].body,{protocol:'sacn',target:'wled.local'});
  }finally{globalThis.fetch=originalFetch;}
});
