export async function indexingHead(client:any,confirmations:bigint,networkKind=process.env.TRACEFORGE_NETWORK_KIND??'private') {
 const head=await client.getBlockNumber({cacheTime:0});
 if(networkKind==='public') {
  const finalized=await client.getBlock({blockTag:'finalized'});
  if(finalized.number==null||finalized.number>head)throw Error('Finalized block unavailable');
  return {head,safeHead:finalized.number as bigint};
 }
 return {head,safeHead:head>confirmations?head-confirmations:0n};
}
export async function verifyCheckpoint(client:any,checkpoint:{last_processed_block:string|number;last_processed_hash?:string|null}|undefined,networkKind=process.env.TRACEFORGE_NETWORK_KIND??'private') {
 if(networkKind!=='public'||!checkpoint)return;
 if(!checkpoint.last_processed_hash)throw Error('Public checkpoint has no canonical hash; rebuild the projection');
 const block=await client.getBlock({blockNumber:BigInt(checkpoint.last_processed_block)});
 if(block.hash?.toLowerCase()!==checkpoint.last_processed_hash.toLowerCase())throw Error('Finalized checkpoint changed; stop and rebuild this deployment projection');
}
