import {verifiedTransport} from './rpc-transport.js';
import {config} from './config.js';
export const chainTransport=()=>verifiedTransport({urls:[config.rpcUrl,...(process.env.TRACEFORGE_RPC_FALLBACK_URLS||'').split(',').filter(Boolean)],chainId:config.chainId,contractAddress:config.contractAddress,runtimeHash:process.env.TRACEFORGE_RUNTIME_BYTECODE_HASH});
