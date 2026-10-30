// Throwaway: call one Backend method on the running daemon. node scratch-call.ts <method> [json-arg]
import { followDaemon } from './src/client.ts';
import { resolveHome } from './src/home.ts';

const [method, arg] = process.argv.slice(2);
const b = followDaemon(resolveHome()) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
const out = await b[method!]!(...(arg ? [JSON.parse(arg)] : []));
console.log(JSON.stringify(out, null, 1));
