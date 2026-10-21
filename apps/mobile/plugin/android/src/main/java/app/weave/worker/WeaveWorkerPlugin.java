package app.weave.worker;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import org.json.JSONObject;
import to.holepunch.bare.kit.IPC;
import to.holepunch.bare.kit.Worklet;

/**
 * Runs the phone app's worker (worklet/main.ts, packed into
 * public/worklet.android.bundle) on Bare and carries its lines: post() sends
 * one to it, and each line it writes arrives in the WebView as a "message"
 * event. Pausing the app suspends the worker; coming back resumes it.
 */
@CapacitorPlugin(name = "WeaveWorker")
public class WeaveWorkerPlugin extends Plugin {
    private static final String TAG = "WeaveWorker";

    private Worklet worklet;
    private IPC ipc;
    private final ByteArrayOutputStream partial = new ByteArrayOutputStream();
    private final ArrayDeque<ByteBuffer> outbox = new ArrayDeque<>();
    private boolean writing = false;

    @Override
    public void load() {
        ByteBuffer source;
        try (InputStream in = getContext().getAssets().open("public/worklet.android.bundle")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = in.read(chunk)) != -1) bytes.write(chunk, 0, n);
            byte[] all = bytes.toByteArray();
            source = ByteBuffer.allocateDirect(all.length);
            source.put(all);
            source.flip();
        } catch (IOException e) {
            Log.e(TAG, "the worker's bundle is missing", e);
            return;
        }

        worklet = new Worklet(new Worklet.Options());
        // The name's extension tells Bare that this is a bundle.
        worklet.start("/worklet.bundle", source, null);
        ipc = new IPC(worklet);
        ipc.readable(this::drain);

        // First: where the worker keeps its file (the phone's key and its computer).
        String dir = getContext().getFilesDir().getAbsolutePath() + "/weave";
        send("{\"op\":\"start\",\"dir\":" + JSONObject.quote(dir) + "}\n");
    }

    @PluginMethod
    public void post(PluginCall call) {
        String message = call.getString("message");
        if (message == null || ipc == null) {
            call.reject(ipc == null ? "the worker didn't start" : "nothing to send");
            return;
        }
        send(message + "\n");
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        if (worklet != null) worklet.suspend();
    }

    @Override
    protected void handleOnResume() {
        if (worklet != null) worklet.resume();
    }

    @Override
    protected void handleOnDestroy() {
        if (ipc != null) ipc.close();
        if (worklet != null) worklet.terminate();
    }

    /** Whole lines from the worker, each to the WebView. */
    private synchronized void drain() {
        ByteBuffer data;
        while ((data = ipc.read()) != null) {
            if (data.limit() == 0) {
                // The worker closed its end.
                ipc.readable(null);
                return;
            }
            while (data.hasRemaining()) {
                byte b = data.get();
                if (b != '\n') {
                    partial.write(b);
                    continue;
                }
                JSObject event = new JSObject();
                event.put("message", new String(partial.toByteArray(), StandardCharsets.UTF_8));
                partial.reset();
                notifyListeners("message", event);
            }
        }
    }

    /** Writes go out one at a time: a write may be partial and finish later. */
    private synchronized void send(String text) {
        outbox.add(ByteBuffer.wrap(text.getBytes(StandardCharsets.UTF_8)));
        if (!writing) next();
    }

    private synchronized void next() {
        ByteBuffer data = outbox.poll();
        writing = data != null;
        if (data == null) return;
        ipc.write(data, (error) -> {
            if (error != null) Log.e(TAG, "couldn't write to the worker", error);
            next();
        });
    }
}
