/*
 * What a page may ask of the node in its Worker. Listed one by one, so a new method stays off the web until it's added on
 * purpose. It grows with the screens (docs/web-stage2.md, step 8).
 */

export const WEB_METHODS = ['whoami', 'status', 'spaces', 'joinSpace', 'createGroup', 'invite', 'members', 'chats', 'channels', 'messages', 'say', 'react', 'deleteMessage', 'feed', 'boards', 'posts', 'post', 'hints', 'hintServices', 'seen'] as const;

export type WebMethod = (typeof WEB_METHODS)[number];
