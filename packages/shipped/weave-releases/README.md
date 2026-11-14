# Weave releases

Publishes a project's releases from a folder on a maintainer's computer, without GitHub: the files travel as
encrypted Weave blobs in the project, and every member's Weave fetches them from whoever holds them, checking each
file against the size and SHA-256 its maintainer signed.

It ships with Weave and is the fast way to try a service of your own: build it, then
`weave app release dev-1 --from . -p <project>` reads the folder's `weave.app.json`, packs the files it names (a
WebAssembly component and its site), stores them as blobs (at most 32 MB a release) and asks this service to publish
the release. Add it as a service from that release once (`weave service add --artifact <project>`), and move it to
each new one after (`weave service set <name> --update latest`).

It hands nothing out itself (`artifact.fetch`): a release from Weave is fetched by Weave, from the project's members.

    weave service add --shipped weave-releases --spaces <project>
