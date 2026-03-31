import assert from "node:assert/strict";
import test from "node:test";

import { buildSshArgs, formatSshDestination } from "./ssh-command.js";

test("buildSshArgs clears inherited forwards for interactive ssh sessions", () => {
  const args = buildSshArgs(
    {
      host: "117.89.254.22",
      port: 10022,
      username: "xuzk",
      identityFile: "/tmp/id_test",
    },
    {
      requestTty: true,
      remoteCommand: "exec tmux new-session -A -s test",
    },
  );

  assert.deepEqual(args, [
    "-t",
    "-o",
    "ClearAllForwardings=yes",
    "-p",
    "10022",
    "-i",
    "/tmp/id_test",
    "xuzk@117.89.254.22",
    "exec tmux new-session -A -s test",
  ]);
});

test("buildSshArgs supports non-interactive helper commands with batch mode", () => {
  const args = buildSshArgs(
    {
      host: "127.0.0.1",
      port: 22,
      username: "nobody",
    },
    {
      batchMode: true,
      connectTimeoutSeconds: 5,
      remoteCommand: "tmux list-panes -a",
    },
  );

  assert.deepEqual(args, [
    "-o",
    "BatchMode=yes",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ConnectTimeout=5",
    "-p",
    "22",
    "nobody@127.0.0.1",
    "tmux list-panes -a",
  ]);
});

test("formatSshDestination rejects unsafe values", () => {
  assert.throws(
    () =>
      formatSshDestination({
        host: "safe-host",
        username: "bad\nname",
      }),
    /Invalid username/,
  );
});
