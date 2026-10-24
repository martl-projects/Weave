import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.weave.companion',
  appName: 'Weave',
  webDir: 'dist/web',
  // The screens work offline; nothing is loaded from the network.
  android: { allowMixedContent: false },
};

export default config;
