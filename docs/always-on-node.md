# Your always-on node

A server, a NAS or a home cluster that keeps your spaces and hosts your rooms while your computers are off. Friends play your app at three in the morning, and what they write in your groups and projects reaches you when you're back.

## What it may do

- **Its key:** It gets a key of its own, issued by one of your computers like an agent's. That key may host your rooms (`weave.room…`) and nothing else. Anything else it signed, everyone else would drop, so it doesn't even try: it can't post, chat, vote, invite or change anything for you.
- **What it reads:** It holds your encryption keys and the keys of your groups, projects and communities, so it can keep them (it runs as an archive and keeps everything) and check who may join your rooms.
- **What it doesn't get:** your direct chats. It can't add devices, rotate keys or recover anything: that still takes your recovery words.
- **Revoking:** Revoke it like an agent, in Weave (Keys & devices → Always-on nodes → Revoke) or with `weave revoke node:<name>`. What it signs from then on counts nowhere.
- **No recovery words:** Pairing never asks for them.

## Pairing

1. **On the node:** run `weave-server pair kitchen-nas` (or `weave node pair kitchen-nas`). It shows a request: `weave:node-request:…`.
2. **On one of your computers:** in Weave, open Keys & devices → Always-on nodes, paste the request and click **Link node**. From the command line it's `weave node add <request>`. You get an answer: `weave:node-answer:…`, boxed so that only that node can open it.
3. **On the node:** run `weave-server join <answer>`, then `weave-server run`.

Spaces you join later reach it too: while you have an always-on node, your computers keep a sealed list of your spaces for it in your own space.

## With Docker

```bash
docker run -it --rm -v weave:/data ghcr.io/martl-projects/weave-server pair kitchen-nas
docker run -it --rm -v weave:/data ghcr.io/martl-projects/weave-server join 'weave:node-answer:…'
docker run -d --name weave --restart unless-stopped -v weave:/data ghcr.io/martl-projects/weave-server
```

- **Ports:** It needs no open ports: Weave finds its peers through the network's DHT and connects outward, and connections through firewalls work too (hole punching).
- **Health:** The image's health check asks `weave-server status`.
- **Keys:** In a container there's no keystore of the operating system. The home key lies in the volume (`vault.json`), so keep the volume as private as the machine.

## In a Kubernetes cluster

- **Pods:** One pod, one replica, `Recreate`. Two copies of the same node would sign as the same key at once, which Weave reports as a stolen key.
- **The app beside it:** A room's app runs as a second container in the same pod: they share `127.0.0.1`, and the room forwards to the app's port there. With `start.image`, that's the image the project released, at the digest in its release.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: weave }
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector: { matchLabels: { app: weave } }
  template:
    metadata: { labels: { app: weave } }
    spec:
      containers:
        - name: weave
          image: ghcr.io/martl-projects/weave-server:0.17.2
          volumeMounts: [{ name: data, mountPath: /data }]
          livenessProbe: { exec: { command: [node, /app/weave-server.mjs, status] }, periodSeconds: 60 }
        - name: party-app            # a room's app, beside the node
          image: ghcr.io/you/party-game@sha256:…
          env: [{ name: PORT, value: "3000" }]
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: weave-data }
```

Pair it once with `kubectl exec -it deploy/weave -c weave -- node /app/weave-server.mjs pair cluster`, then `… join <answer>`, then restart the pod.

## Tried, and not yet

- **Tested:**
  - **Pairing:** the request, the answer and joining.
  - **Spaces:** the node reads your spaces, and a space created later reaches it.
  - **Refusing:** It refuses to post, and others would drop it anyway.
  - **Hosting:** It hosts a room while your computer is offline, and a friend reaches the app through it (local test network).
  - **Revoking:** Revocation reaches the others.
- **Tried on this computer:** the built Weave Server: `pair`, `join` (with the answer from the app's new Always-on nodes section and from the command line), `run`, `status`, and a clean `weave daemon stop`.
- **Not tried:** the Docker image and Kubernetes (Docker didn't start here), and a node on another network for days.
