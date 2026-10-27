// What the phone app's worker needs: pairing with a node and using it remotely.
// Nothing here may pull in Node's own modules (the worker runs on Bare).
export { decodePhoneLink, type PhoneLink } from './phone-link.ts';
export { connectTo, openTunnel, pairWith, type Dialer, type PairedNode, type RemoteSession, type Tunnel } from './remote-client.ts';
export type { FeedItem, RpcMethod } from './backend.ts';
export { LENS_CSP } from './lenscsp.ts';
