// What a browser doesn't have: child processes, sockets, worker threads. Reaching for one says so, when it is called.
module.exports = new Proxy(function none() {}, {
  get: (_target, key) => {
    if (key === '__esModule') return false;
    if (typeof key === 'symbol') return undefined;
    return function nothere() {
      throw new Error(`${String(key)} isn't there in a browser`);
    };
  },
});
