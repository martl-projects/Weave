// A Weave service in Rust, built into a WebAssembly component that Weave runs itself (nothing to install). It's
// handed what it may read, one item at a time: here, requests addressed to it. What it imports is all it can do.

wit_bindgen::generate!({ world: "service", path: "wit" });

use weave::service::host;

struct Service;

impl Guest for Service {
    fn on_event(item: String) {
        let Ok(item) = serde_json::from_str::<serde_json::Value>(&item) else { return };
        if item["kind"] != "weave.service.request" {
            return;
        }
        let id = item["id"].as_str().unwrap_or_default();
        let asked = item["body"]["text"].as_str().unwrap_or_default();
        let me = serde_json::from_str::<serde_json::Value>(&host::me()).unwrap_or_default();
        let name = me["name"].as_str().unwrap_or("a service");
        let greeting = host::setting("GREETING").unwrap_or_else(|| "Hello".to_string());
        let text = format!("{greeting} from {name}! You asked \"{asked}\".");
        if let Err(why) = host::answer(id, Some(&text), None, None) {
            host::log(&format!("couldn't answer {id}: {why}"));
        }
    }
}

export!(Service);
