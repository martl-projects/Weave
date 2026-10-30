# Unread

Counts what came in for you next to the chat, place, board or channel in Places, until you open it on any of your devices. Messages to you count (direct messages, @mentions, replies to you, chat in your posts); its rules say, for a person, a place or a board, whether something counts.

A hint service Weave ships (docs/v2-stage20.md): it folds `weave.notice` (what your node works out is for you) and `weave.seen` (what you opened, sealed to you), and answers for spaces, boards and channels. Its settings are its rules: `{"rules": [{"who"?, "space"?, "board"?, "count", "notify"}]}`, the most specific one winning.
