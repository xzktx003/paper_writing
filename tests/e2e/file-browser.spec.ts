import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

const ONE_BY_ONE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pX6lzUAAAAASUVORK5CYII=";

function setupFixture() {
  const rootDir = mkdtempSync(
    path.join(process.cwd(), "tests/e2e/file-browser-runtime-"),
  );

  mkdirSync(path.join(rootDir, "nested"), { recursive: true });
  writeFileSync(path.join(rootDir, "note.txt"), "hello file browser");
  writeFileSync(path.join(rootDir, "nested", "inside.txt"), "inside folder");
  writeFileSync(path.join(rootDir, ".secret.txt"), "hidden file");
  writeFileSync(path.join(rootDir, "rename-me.txt"), "rename me");
  writeFileSync(path.join(rootDir, "delete-me.txt"), "delete me");
  writeFileSync(
    path.join(rootDir, "photo.png"),
    Buffer.from(ONE_BY_ONE_PNG, "base64"),
  );

  const uploadFilePath = path.join(tmpdir(), `upload-${Date.now()}.txt`);
  writeFileSync(uploadFilePath, "uploaded from playwright");

  return {
    rootDir,
    uploadFilePath,
    folderName: path.basename(rootDir),
  };
}

interface RemoteFixture {
  rootDir: string;
  uploadFilePath: string;
  hostName: string;
  sshdDir: string;
  port: number;
  sshdProcess: ChildProcess;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startRemoteSshFixture(): RemoteFixture {
  const rootDir = mkdtempSync(path.join(tmpdir(), "file-browser-remote-"));
  mkdirSync(path.join(rootDir, "nested"), { recursive: true });
  writeFileSync(path.join(rootDir, "note.txt"), "hello remote file browser");
  writeFileSync(path.join(rootDir, "nested", "inside.txt"), "inside remote");
  writeFileSync(path.join(rootDir, ".secret.txt"), "remote hidden file");
  writeFileSync(path.join(rootDir, "rename-me.txt"), "remote rename me");
  writeFileSync(path.join(rootDir, "delete-me.txt"), "remote delete me");
  writeFileSync(
    path.join(rootDir, "photo.png"),
    Buffer.from(ONE_BY_ONE_PNG, "base64"),
  );

  const uploadFilePath = path.join(tmpdir(), `remote-upload-${Date.now()}.txt`);
  writeFileSync(uploadFilePath, "uploaded to remote ssh fixture");

  const sshdDir = mkdtempSync(path.join(tmpdir(), "file-browser-sshd-"));
  const clientKeyPath = path.join(sshdDir, "client_key");
  const hostKeyPath = path.join(sshdDir, "host_key");
  const authorizedKeysPath = path.join(sshdDir, "authorized_keys");
  const sshdConfigPath = path.join(sshdDir, "sshd_config");
  const sshdLogPath = path.join(sshdDir, "sshd.log");
  const port = 22330 + Math.floor(Math.random() * 1000);

  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", clientKeyPath], {
    stdio: "ignore",
  });
  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", hostKeyPath], {
    stdio: "ignore",
  });
  copyFileSync(`${clientKeyPath}.pub`, authorizedKeysPath);

  writeFileSync(
    sshdConfigPath,
    [
      `Port ${port}`,
      "ListenAddress 127.0.0.1",
      `HostKey ${hostKeyPath}`,
      `PidFile ${path.join(sshdDir, "sshd.pid")}`,
      `AuthorizedKeysFile ${authorizedKeysPath}`,
      "PasswordAuthentication no",
      "KbdInteractiveAuthentication no",
      "ChallengeResponseAuthentication no",
      "UsePAM no",
      "PermitRootLogin no",
      `AllowUsers ${process.env.USER ?? "xuzk"}`,
      "StrictModes no",
      "PubkeyAuthentication yes",
      "Subsystem sftp internal-sftp",
      "LogLevel VERBOSE",
    ].join("\n"),
    "utf8",
  );

  const sshdProcess = spawn(
    "/usr/sbin/sshd",
    ["-D", "-f", sshdConfigPath, "-E", sshdLogPath],
    {
      stdio: "ignore",
    },
  );

  const hostName = `playwright-ssh-${Date.now()}`;

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const output = execFileSync(
        "ssh",
        [
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          "UserKnownHostsFile=/dev/null",
          "-i",
          clientKeyPath,
          "-p",
          String(port),
          `${process.env.USER ?? "xuzk"}@127.0.0.1`,
          "pwd",
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      if (output.trim() === homedir()) {
        return {
          rootDir,
          uploadFilePath,
          hostName,
          sshdDir,
          port,
          sshdProcess,
        };
      }
    } catch {
      // wait for sshd to become ready
    }
  }

  sshdProcess.kill("SIGKILL");
  throw new Error("remote ssh fixture did not become ready");
}

async function openRemoteFixture(
  page: Page,
  fixture: RemoteFixture,
  displayName: string,
) {
  const drawer = page.getByTestId("file-browser-drawer");
  await page.route("**/api/ssh-hosts", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        hosts: [
          {
            name: fixture.hostName,
            host: "127.0.0.1",
            port: fixture.port,
            username: process.env.USER ?? "xuzk",
            identityFile: path.join(fixture.sshdDir, "client_key"),
            defaultPath: fixture.rootDir,
          },
        ],
      }),
    });
  });

  await focusSession(page, displayName);
  await openFileBrowserForFocusedSession(page);

  await drawer.getByTestId("file-browser-host-toggle").click();
  await page
    .locator(".host-dropdown-item", { hasText: fixture.hostName })
    .click();
  await expect(drawer.getByTestId("file-entry-note.txt")).toBeVisible({
    timeout: 15_000,
  });
}

async function launchMockSession(
  request: APIRequestContext,
  displayName: string,
  workingDirectory: string,
) {
  const response = await request.post("/api/agent-launch/pty", {
    data: {
      workspaceId: "default",
      displayName,
      agentKind: "shell",
      command: `node ${JSON.stringify(path.join(process.cwd(), "scripts/mock-terminal-agent.mjs"))} scroll`,
      workingDirectory,
    },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as string;
}

async function deleteSessionIfPresent(
  request: APIRequestContext,
  sessionId?: string,
) {
  if (!sessionId) {
    return;
  }

  await request.delete(`/api/agent-sessions/${sessionId}`);
}

async function focusSession(page: Page, displayName: string) {
  await page.goto("/");
  const targetCard = page.locator(".grid-card", {
    has: page.locator(".grid-card-name", { hasText: displayName }),
  });
  await expect(targetCard).toBeVisible({ timeout: 15_000 });
  await targetCard.dblclick();
  await expect(page.locator(".focus-main-name")).toContainText(displayName);
}

async function switchFocusedSession(page: Page, displayName: string) {
  const sidebarCard = page.locator(".focus-sidebar-card", {
    has: page.locator("span", { hasText: displayName }),
  });
  await expect(sidebarCard).toBeVisible();
  await sidebarCard.dblclick();
  await expect(page.locator(".focus-main-name")).toContainText(displayName);
}

async function openFileBrowserForFocusedSession(page: Page) {
  const toggle = page.getByTestId("file-browser-toggle");
  await expect(toggle).toBeEnabled();
  await toggle.click();
  const drawer = page.getByTestId("file-browser-drawer");
  await expect(drawer).toBeVisible();
  return drawer;
}

test("file browser supports real local browsing, edit, upload, download, and delete flows", async ({
  page,
  request,
}) => {
  const fixture = setupFixture();
  const displayName = `file-browser-local-${Date.now()}`;
  let sessionId: string | undefined;

  try {
    sessionId = await launchMockSession(request, displayName, fixture.rootDir);
    await focusSession(page, displayName);
    const drawer = await openFileBrowserForFocusedSession(page);

    await expect(
      drawer.locator(".file-browser-breadcrumb").last(),
    ).toContainText(path.basename(fixture.rootDir));

    await expect(drawer.getByTestId("file-entry-.secret.txt")).toHaveCount(0);
    await drawer.getByLabel("显示隐藏文件").check();
    await drawer.getByRole("button", { name: "刷新" }).click();
    await expect(drawer.getByTestId("file-entry-.secret.txt")).toBeVisible();

    await drawer.getByRole("button", { name: "新建" }).click();
    const createDialog = page.locator(".file-browser-dialog").first();
    await createDialog.locator("input").fill("created-folder");
    await createDialog.getByRole("button", { name: "创建" }).click();
    await expect(drawer.getByTestId("file-entry-created-folder")).toBeVisible();

    await drawer
      .getByTestId("file-entry-rename-me.txt")
      .click({ button: "right" });
    await page.getByRole("button", { name: "重命名" }).click();
    const renameDialog = page.locator(".file-browser-dialog").first();
    await renameDialog.locator("input").fill("renamed.txt");
    await renameDialog.getByRole("button", { name: "保存" }).click();
    await expect(drawer.getByTestId("file-entry-renamed.txt")).toBeVisible();

    await drawer
      .getByTestId("file-entry-note.txt")
      .getByRole("checkbox")
      .check();
    await expect(drawer.locator(".file-browser-preview-text")).toContainText(
      "hello file browser",
    );

    await drawer.getByTestId("file-entry-note.txt").dblclick();
    const editor = drawer.locator(".file-browser-editor");
    await expect(editor).toBeVisible();
    await editor.fill("hello file browser\nedited by playwright");
    await drawer.getByRole("button", { name: "保存" }).click();
    await drawer
      .getByTestId("file-entry-note.txt")
      .getByRole("checkbox")
      .check();
    await expect(drawer.locator(".file-browser-preview-text")).toContainText(
      "edited by playwright",
    );

    await drawer
      .getByTestId("file-entry-note.txt")
      .getByRole("checkbox")
      .uncheck();
    await drawer
      .getByTestId("file-entry-photo.png")
      .getByRole("checkbox")
      .check();
    await expect(drawer.locator(".file-browser-preview-image")).toBeVisible();

    await drawer
      .locator('input[type="file"]')
      .setInputFiles(fixture.uploadFilePath);
    await expect(
      drawer.getByTestId(`file-entry-${path.basename(fixture.uploadFilePath)}`),
    ).toBeVisible();

    await drawer
      .getByTestId("file-entry-photo.png")
      .getByRole("checkbox")
      .uncheck();
    await drawer
      .getByTestId("file-entry-renamed.txt")
      .getByRole("checkbox")
      .check();
    const downloadPromise = page.waitForEvent("download");
    await drawer.getByRole("button", { name: "下载" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("renamed.txt");

    await drawer
      .getByTestId("file-entry-delete-me.txt")
      .getByRole("checkbox")
      .check();
    await drawer
      .getByTestId(`file-entry-${path.basename(fixture.uploadFilePath)}`)
      .getByRole("checkbox")
      .check();
    page.once("dialog", (dialog) => dialog.accept());
    await drawer.getByRole("button", { name: "删除" }).click();
    await expect(drawer.getByTestId("file-entry-delete-me.txt")).toHaveCount(0);
    await expect(
      drawer.getByTestId(`file-entry-${path.basename(fixture.uploadFilePath)}`),
    ).toHaveCount(0);
  } finally {
    await deleteSessionIfPresent(request, sessionId);
    rmSync(fixture.rootDir, { recursive: true, force: true });
    rmSync(fixture.uploadFilePath, { force: true });
  }
});

test("file browser is scoped per focused session, keeps splitter behavior, and stays unavailable in grid view", async ({
  page,
  request,
}) => {
  const fixtureA = setupFixture();
  const fixtureB = setupFixture();
  const sessionAName = `file-browser-focus-a-${Date.now()}`;
  const sessionBName = `file-browser-focus-b-${Date.now()}`;
  let sessionAId: string | undefined;
  let sessionBId: string | undefined;

  writeFileSync(
    path.join(fixtureA.rootDir, "note.txt"),
    "hello file browser A",
  );
  writeFileSync(
    path.join(fixtureA.rootDir, "nested", "inside.txt"),
    "inside A",
  );
  writeFileSync(
    path.join(fixtureB.rootDir, "note.txt"),
    "hello file browser B",
  );
  writeFileSync(
    path.join(fixtureB.rootDir, "nested", "inside.txt"),
    "inside B",
  );

  await page.goto("/");

  const topBar = page.locator(".top-bar");
  const topToggle = topBar.getByTestId("file-browser-toggle");
  await expect(topToggle).toBeVisible();
  await expect(topToggle).toBeDisabled();

  try {
    sessionAId = await launchMockSession(
      request,
      sessionAName,
      fixtureA.rootDir,
    );
    sessionBId = await launchMockSession(
      request,
      sessionBName,
      fixtureB.rootDir,
    );

    await focusSession(page, sessionAName);
    const drawer = await openFileBrowserForFocusedSession(page);
    await expect(drawer.getByTestId("file-entry-note.txt")).toBeVisible();
    await expect(drawer.locator(".file-browser-preview-text")).toHaveCount(0);

    await drawer.getByTestId("file-entry-nested").dblclick();
    await expect(drawer.getByTestId("file-entry-inside.txt")).toBeVisible();
    await expect(
      drawer.locator(".file-browser-breadcrumb").last(),
    ).toContainText("nested");

    const mainSplitter = page.getByTestId("file-browser-main-splitter");
    const drawerBefore = await drawer.boundingBox();
    await mainSplitter.hover();
    await page.mouse.down();
    await page.mouse.move(
      (drawerBefore?.x ?? 0) + (drawerBefore?.width ?? 0) + 120,
      300,
    );
    await page.mouse.up();
    const drawerAfter = await drawer.boundingBox();
    expect((drawerAfter?.width ?? 0) > (drawerBefore?.width ?? 0)).toBeTruthy();

    const treePane = drawer.locator(".file-browser-tree");
    const treeBefore = await treePane.boundingBox();
    const treeSplitter = drawer.getByTestId("file-browser-tree-splitter");
    const treeSplitterBox = await treeSplitter.boundingBox();
    await page.mouse.move(
      (treeSplitterBox?.x ?? 0) + (treeSplitterBox?.width ?? 0) / 2,
      (treeSplitterBox?.y ?? 0) + (treeSplitterBox?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (treeSplitterBox?.x ?? 0) + (treeSplitterBox?.width ?? 0) / 2 + 80,
      (treeSplitterBox?.y ?? 0) + (treeSplitterBox?.height ?? 0) / 2,
    );
    await page.mouse.up();
    const treeAfter = await treePane.boundingBox();
    expect((treeAfter?.width ?? 0) > (treeBefore?.width ?? 0)).toBeTruthy();

    await switchFocusedSession(page, sessionBName);
    await expect(page.getByTestId("file-browser-drawer")).toHaveCount(0);

    const drawerB = await openFileBrowserForFocusedSession(page);
    await expect(drawerB.getByTestId("file-entry-note.txt")).toBeVisible();
    await drawerB
      .getByTestId("file-entry-note.txt")
      .getByRole("checkbox")
      .check();
    await expect(drawerB.locator(".file-browser-preview-text")).toContainText(
      "hello file browser B",
    );

    const previewSplitter = drawerB.getByTestId(
      "file-browser-preview-splitter",
    );
    const previewBefore = await drawerB
      .locator(".file-browser-preview")
      .boundingBox();
    const previewSplitterBox = await previewSplitter.boundingBox();
    await page.mouse.move(
      (previewSplitterBox?.x ?? 0) + (previewSplitterBox?.width ?? 0) / 2,
      (previewSplitterBox?.y ?? 0) + 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (previewSplitterBox?.x ?? 0) + (previewSplitterBox?.width ?? 0) / 2,
      (previewSplitterBox?.y ?? 0) - 80,
    );
    await page.mouse.up();
    const previewAfter = await drawerB
      .locator(".file-browser-preview")
      .boundingBox();
    expect(
      (previewAfter?.height ?? 0) > (previewBefore?.height ?? 0),
    ).toBeTruthy();

    await switchFocusedSession(page, sessionAName);
    const restoredDrawer = page.getByTestId("file-browser-drawer");
    await expect(restoredDrawer).toBeVisible();
    await expect(
      restoredDrawer.getByTestId("file-entry-inside.txt"),
    ).toBeVisible();
    await expect(
      restoredDrawer.locator(".file-browser-breadcrumb").last(),
    ).toContainText("nested");

    await page.getByRole("button", { name: "返回宫格" }).click();
    await expect(page.getByTestId("file-browser-drawer")).toHaveCount(0);
    await expect(page.getByTestId("file-browser-toggle")).toBeDisabled();
  } finally {
    await deleteSessionIfPresent(request, sessionAId);
    await deleteSessionIfPresent(request, sessionBId);
    rmSync(fixtureA.rootDir, { recursive: true, force: true });
    rmSync(fixtureA.uploadFilePath, { force: true });
    rmSync(fixtureB.rootDir, { recursive: true, force: true });
    rmSync(fixtureB.uploadFilePath, { force: true });
  }
});

test("file browser supports real SSH/SFTP browsing, edit, chmod, upload, download, and delete flows", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const fixture = startRemoteSshFixture();
  const displayName = `file-browser-remote-anchor-${Date.now()}`;
  let sessionId: string | undefined;

  try {
    sessionId = await launchMockSession(request, displayName, process.cwd());
    const drawer = page.getByTestId("file-browser-drawer");
    await openRemoteFixture(page, fixture, displayName);

    await expect(drawer.getByTestId("file-entry-.secret.txt")).toHaveCount(0);
    await drawer.getByLabel("显示隐藏文件").check();
    await drawer.getByRole("button", { name: "刷新" }).click();
    await expect(drawer.getByTestId("file-entry-.secret.txt")).toBeVisible();

    await drawer
      .getByTestId("file-entry-note.txt")
      .getByRole("checkbox")
      .check();
    await expect(drawer.locator(".file-browser-preview-text")).toContainText(
      "hello remote file browser",
    );

    await drawer.getByTestId("file-entry-note.txt").dblclick();
    const editor = drawer.locator(".file-browser-editor");
    await expect(editor).toBeVisible();
    await editor.fill("hello remote file browser\nedited over ssh");
    await drawer.getByRole("button", { name: "保存" }).click();
    await drawer
      .getByTestId("file-entry-note.txt")
      .getByRole("checkbox")
      .check();
    await expect(drawer.locator(".file-browser-preview-text")).toContainText(
      "edited over ssh",
    );

    await drawer
      .getByTestId("file-entry-rename-me.txt")
      .click({ button: "right" });
    await page.getByRole("button", { name: "重命名" }).click();
    const renameDialog = page.locator(".file-browser-dialog").first();
    await renameDialog.locator("input").fill("renamed-remote.txt");
    await renameDialog.getByRole("button", { name: "保存" }).click();
    await expect(
      drawer.getByTestId("file-entry-renamed-remote.txt"),
    ).toBeVisible();

    await drawer
      .getByTestId("file-entry-renamed-remote.txt")
      .getByRole("checkbox")
      .check();
    await drawer.getByRole("button", { name: "chmod" }).click();
    const chmodDialog = page.locator(".file-browser-dialog").first();
    await chmodDialog
      .locator(".file-browser-chmod-group")
      .nth(1)
      .getByLabel("r")
      .uncheck();
    await chmodDialog
      .locator(".file-browser-chmod-group")
      .nth(1)
      .getByLabel("w")
      .uncheck();
    await chmodDialog
      .locator(".file-browser-chmod-group")
      .nth(2)
      .getByLabel("r")
      .uncheck();
    await chmodDialog.getByRole("button", { name: /应用 600/ }).click();
    await expect(
      drawer.getByTestId("file-entry-renamed-remote.txt"),
    ).toContainText("-rw-------");

    await drawer
      .locator('input[type="file"]')
      .setInputFiles(fixture.uploadFilePath);
    await expect(
      drawer.getByTestId(`file-entry-${path.basename(fixture.uploadFilePath)}`),
    ).toBeVisible();

    await drawer
      .getByTestId("file-entry-renamed-remote.txt")
      .getByRole("checkbox")
      .check();
    await expect(drawer.getByRole("button", { name: "下载" })).toBeEnabled();
    const downloadResponse = await request.post("/api/fs/download", {
      data: {
        path: path.join(fixture.rootDir, "renamed-remote.txt"),
        sshTarget: {
          host: "127.0.0.1",
          port: fixture.port,
          username: process.env.USER ?? "xuzk",
          identityFile: path.join(fixture.sshdDir, "client_key"),
        },
      },
    });
    expect(downloadResponse.ok()).toBeTruthy();
    await expect(await downloadResponse.body()).toBeTruthy();

    await drawer
      .getByTestId("file-entry-delete-me.txt")
      .getByRole("checkbox")
      .check();
    await drawer
      .getByTestId(`file-entry-${path.basename(fixture.uploadFilePath)}`)
      .getByRole("checkbox")
      .check();
    page.once("dialog", (dialog) => dialog.accept());
    await drawer.getByRole("button", { name: "删除" }).click();
    await expect(drawer.getByTestId("file-entry-delete-me.txt")).toHaveCount(0);
    await expect(
      drawer.getByTestId(`file-entry-${path.basename(fixture.uploadFilePath)}`),
    ).toHaveCount(0);
  } finally {
    await deleteSessionIfPresent(request, sessionId);
    fixture.sshdProcess.kill("SIGKILL");
    await wait(100);
    rmSync(fixture.rootDir, { recursive: true, force: true });
    rmSync(fixture.uploadFilePath, { force: true });
    rmSync(fixture.sshdDir, { recursive: true, force: true });
  }
});
