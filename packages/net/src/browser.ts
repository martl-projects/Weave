// What runs in a browser: the sync protocol and its WebSocket carrier, without the DHT.
export { authKey, authTag, PeerSession2, spaceTag, type HeldSpace, type Message2, type PeerStream, type SpaceAccess } from './session2.ts';
export { MAX_FRAME_TEXT, wsPeerStream, type TextSocket } from './wspeer.ts';
