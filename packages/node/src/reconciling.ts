/*
 * What a running node does by itself (node.reconcile): admissions by standing rules, keys settled, proposals closed,
 * invitations ended, images fetched ahead. Shortly after new events arrive, and every few minutes regardless: sign-ins
 * renew, keys time out, a company's duties come due. The daemon runs it, and so does a browser's Worker.
 */

/** What this needs of the node. */
interface Reconciles {
  reconcile(): Promise<number>;
  replica: { onAppend(listener: () => void): () => void };
}

const SOON_MS = 500;
const EVERY_MS = 5 * 60_000;

/** Keep `node` reconciling until the returned function is called. */
export function keepReconciling(node: Reconciles, onError: (error: Error) => void = (error) => console.error(`weave: ${error.message}`)): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => node.reconcile().catch(onError), SOON_MS);
  };
  const unsubscribe = node.replica.onAppend(soon);
  soon();
  const heartbeat = setInterval(soon, EVERY_MS);
  (heartbeat as { unref?: () => void }).unref?.();
  return () => {
    unsubscribe();
    clearTimeout(timer);
    clearInterval(heartbeat);
  };
}
