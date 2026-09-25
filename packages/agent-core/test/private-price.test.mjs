import assert from 'node:assert/strict';
import test from 'node:test';
import {createDeterministicMockProvider, generateAllowedCandidate, generateLocalFallbackCandidate} from '../dist/index.js';

const context = {role:'buyer',productCode:'4821',round:1,publicReferencePrice:'100000000'};
const policy = {role:'buyer',maximumPrice:110000000n};

// Removing the local coordinate translation must fail these behavior checks.
test('session offset shifts outgoing prices without consulting the private limit', async () => {
  for (const maximumPrice of [95000000n,110000000n,120000000n]) {
    const input={context,policy:{...policy,maximumPrice},priceOffset:1250250n};
    assert.deepEqual(generateLocalFallbackCandidate(input),{action:'offer',price:'91250250'});
    assert.deepEqual(await generateAllowedCandidate({...input,provider:createDeterministicMockProvider()}),{action:'offer',price:'91250250'});
  }
});

test('external provider receives the same normalized offer across private offsets', async () => {
  const seen=[];
  for (const priceOffset of [-1750250n,1250250n]) {
    const incoming=100000000n+priceOffset;
    const c={...context,role:'seller',round:6,currentOffer:{maker:'buyer',price:String(incoming)}};
    const candidate=await generateAllowedCandidate({context:c,policy:{role:'seller',minimumPrice:95000000n},priceOffset,
      provider:{generateCandidates:async input=>{seen.push(structuredClone(input));return [{action:'accept',price:input.currentOffer.price}];}}});
    assert.deepEqual(candidate,{action:'accept',price:String(incoming)});
  }
  assert.deepEqual(seen[0],seen[1]);
  assert.equal(seen[0].currentOffer.price,'100000000');
  assert.deepEqual(Object.keys(seen[0]).sort(),['role','productCode','round','publicReferencePrice','currentOffer'].sort());
});

test('actual private bounds still reject shifted offers and acceptances', async () => {
  const input={context,policy:{role:'buyer',maximumPrice:90000000n},priceOffset:1250250n};
  assert.equal(generateLocalFallbackCandidate(input),undefined);
  assert.equal(await generateAllowedCandidate({...input,provider:createDeterministicMockProvider()}),undefined);
  const c={...context,role:'seller',round:6,currentOffer:{maker:'buyer',price:'98249750'}};
  const provider={generateCandidates:async x=>[{action:'accept',price:x.currentOffer.price}]};
  assert.equal(await generateAllowedCandidate({context:c,policy:{role:'seller',minimumPrice:99000000n},priceOffset:-1750250n,provider}),undefined);
});

test('invalid session offsets fail closed before calling an external provider', async () => {
  for (const priceOffset of [1n,3000250n,-3000250n]) {
    let calls=0;
    const provider={generateCandidates:async()=>{calls++;return [{action:'offer',price:'90000000'}];}};
    assert.equal(await generateAllowedCandidate({context,policy,priceOffset,provider}),undefined);
    assert.equal(generateLocalFallbackCandidate({context,policy,priceOffset}),undefined);
    assert.equal(calls,0);
  }
});

const negotiate=async(priceOffset,provider)=>{
 let offer=await generateAllowedCandidate({context,policy,priceOffset,provider}) ?? generateLocalFallbackCandidate({context,policy,priceOffset});
 if(!offer)return undefined;
 for(let round=1;round<=10;round++) {
  for(const role of ['seller','buyer']) {
   const c={...context,role,round,currentOffer:{maker:role==='seller'?'buyer':'seller',price:offer.price}};
   const p=role==='buyer'?policy:{role:'seller',minimumPrice:95000000n};
   const next=await generateAllowedCandidate({context:c,policy:p,priceOffset,provider}) ?? generateLocalFallbackCandidate({context:c,policy:p,priceOffset});
   if(!next)return undefined;
   if(next.action==='accept')return {price:next.price,round};
   offer=next;
  }
 }
};
test('same public reference can settle at different actual prices in mock and fallback paths', async () => {
 for(const provider of [createDeterministicMockProvider(),{generateCandidates:async()=>{throw Error('offline');}}]) {
  assert.deepEqual(await negotiate(-1750250n,provider),{price:'98249750',round:6});
  assert.deepEqual(await negotiate(1250250n,provider),{price:'101250250',round:6});
 }
});
