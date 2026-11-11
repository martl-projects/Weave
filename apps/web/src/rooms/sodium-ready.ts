import sodium from 'sodium-universal';
import { completeSodium } from './sodium-browser.ts';

// Before anything reads the sodium (noise-curve-ed takes its sizes as it loads): first among the tab's imports.
completeSodium(sodium as unknown as Parameters<typeof completeSodium>[0]);
