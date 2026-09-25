import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync,diffieHellman} from 'node:crypto';
import * as core from '../dist/index.js';

test('both parties derive the same bounded offset from their ephemeral shared secret',()=>{
 const buyer=generateKeyPairSync('x25519'), seller=generateKeyPairSync('x25519');
 const args={sessionId:'room-test',productCode:'4821',publicReferencePrice:'100000000'};
 const a=core.deriveSessionPriceOffset({...args,sharedKey:diffieHellman({privateKey:buyer.privateKey,publicKey:seller.publicKey})});
 const b=core.deriveSessionPriceOffset({...args,sharedKey:diffieHellman({privateKey:seller.privateKey,publicKey:buyer.publicKey})});
 assert.equal(a,b); assert.ok(a>=-3000000n&&a<=3000000n);assert.equal(a%250n,0n);
});
test('fresh sessions produce varied offsets and invalid derivation inputs are rejected',()=>{
 const args={sessionId:'room-test',productCode:'4821',publicReferencePrice:'100000000'};
 const values=Array.from({length:16},(_,i)=>core.deriveSessionPriceOffset({...args,sharedKey:Buffer.alloc(32,i+1)}));
 assert.ok(new Set(values).size>8);
 for(const bad of [{sharedKey:Buffer.alloc(0)},{publicReferencePrice:'0'},{productCode:'bad'},{sessionId:''}])
  assert.throws(()=>core.deriveSessionPriceOffset({...args,sharedKey:Buffer.alloc(32,1),...bad}));
});
