import test from 'node:test';
import assert from 'node:assert/strict';
import {indexingHead,verifyCheckpoint} from '../dist/finality.js';
test('public indexing stops at finality while private indexing uses its confirmation depth',async()=>{
 const client={getBlockNumber:async()=>100n,getBlock:async()=>({number:80n})};
 assert.deepEqual(await indexingHead(client,1n,'public'),{head:100n,safeHead:80n});
 assert.deepEqual(await indexingHead(client,1n,'private'),{head:100n,safeHead:99n});
 await assert.rejects(indexingHead({...client,getBlock:async()=>({number:null})},1n,'public'));
 await assert.rejects(indexingHead({...client,getBlock:async()=>({number:101n})},1n,'public'));
});
test('public checkpoint monitoring rejects absent or changed canonical hashes',async()=>{
 const client={getBlock:async()=>({hash:'0xabc'})};
 await verifyCheckpoint(client,{last_processed_block:'80',last_processed_hash:'0xabc'},'public');
 await assert.rejects(verifyCheckpoint(client,{last_processed_block:'80',last_processed_hash:'0xdef'},'public'),/Finalized checkpoint changed/);
 await assert.rejects(verifyCheckpoint(client,{last_processed_block:'80'},'public'),/no canonical hash/);
 await verifyCheckpoint({}, {last_processed_block:'80'},'private');
});
