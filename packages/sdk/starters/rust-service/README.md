# A Weave service in Rust

A service that answers what it's asked, built into a WebAssembly component: small (tens of kilobytes) and fast. Weave runs it itself, sandboxed: nobody who uses it installs anything, and it can do exactly what its contract says.

```
rustup target add wasm32-wasip2      # once (Rust 1.82 or newer)
cargo build --target wasm32-wasip2 --release
weave service add my-bot --wasm target/wasm32-wasip2/release/my_weave_service.wasm --reads addressed --spaces <project>
```

`src/lib.rs` implements `on_event` of the `service` world in `wit/service.wit`; `weave::service::host` has what it may do (`me`, `setting`, `answer`, `publish`, `load`/`save`, `log`). With the `website` world it can serve a game or a page too: see the JavaScript website starter (`weave service new <folder> --website`) for how the pieces fit, and the WIT file for the Rust names. A Rust service can also keep files in `/data` directly (`std::fs`): it's the only folder it sees.

Releasing works as for any Weave service: a `weave.app.json` with `"wasm": { "component": "my_weave_service.wasm" }`, then a GitHub release file for `wasm` or an image for `wasi/wasm` (see the JavaScript starter's README).
