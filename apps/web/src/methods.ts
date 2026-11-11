/*
 * What a page may ask of the node in its Worker. It starts from what a phone may (`PHONE_METHODS`: everyday use, listed
 * one by one, so a new method stays off the web until it's added on purpose), adds what the everyday screens ask for
 * beyond that, and takes away what needs a computer. It grows with the screens (docs/web-stage2.md, step 8).
 */

/** Asked by the everyday screens, and fine in a browser. */
const MORE = ['hints', 'hintServices', 'seen', 'marks', 'markServices', 'services', 'servicesIn', 'fetchers', 'preferences', 'setPreferences', 'reach', 'imprint', 'avatars', 'badges', 'myAccounts', 'platforms', 'accountProof', 'linkAccount', 'accounts', 'artifacts', 'catalog', 'shows'];

/** On a phone through its computer, and without one here: a room's tunnel goes through the DHT (step 9). */
const NOT_HERE = ['visitWebsite', 'leaveWebsite', 'closeWebsite', 'sayOnWebsite', 'websiteChat', 'updateCheck'];

export const webMethods = (phone: readonly string[]): ReadonlySet<string> => new Set([...phone, ...MORE].filter((method) => !NOT_HERE.includes(method)));
