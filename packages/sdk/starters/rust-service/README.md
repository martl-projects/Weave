# A Weave service in Rust

A service that answers what it's asked, built into a WebAssembly component: small (tens of kilobytes) and fast. Weave runs it itself, sandboxed: nobody who uses it installs anything, and it can do exactly what its contract says.

Every service in Weave comes from a release: a project's, signed by a maintainer and pinned by its fingerprint. While you work on it, release it from this folder into a test project of yours, without GitHub: Weave keeps the files as blobs in the project (at most 32 MB), and the project's Weave releases service publishes them (add it once: `weave service add --shipped weave-releases --spaces <test project>`).

```
rustup target add wasm32-wasip2                     # once (Rust 1.82 or newer)
cargo build --target wasm32-wasip2 --release
weave app release dev-1 --from . -p <test project>  # reads weave.app.json, releases the component it names
weave service add my-bot --artifact <test project>@dev-1 --spaces <test project>
```

Changed it? Build again, `weave app release dev-2 --from . -p <test project>`, and `weave service set my-bot --update dev-2`.

`src/lib.rs` implements `on_event` of the `service` world in `wit/service.wit`; `weave::service::host` has what it may do (`me`, `setting`, `answer`, `publish`, `load`/`save`, `log`). With the `website` world it can serve a game or a page too: see the JavaScript website starter (`weave service new <folder> --website`) for how the pieces fit, and the WIT file for the Rust names. A Rust service can also keep files in `/data` directly (`std::fs`): it's the only folder it sees.

`weave.app.json` says what it is: its contract, its component (`"wasm": { "component": "target/wasm32-wasip2/release/my_weave_service.wasm" }`) and its settings. Releasing it for others works as for any Weave service: from Weave as above, a GitHub release file for `wasm`, or an image for `wasi/wasm` (see the JavaScript starter's README).
