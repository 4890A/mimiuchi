// Starts mimiuchi from the portable Windows folder. mimiuchi.exe runs this
// with the bundled runtime\node.exe; it can also be run by hand:
//
//   runtime\node.exe app\launcher.mjs [--port 3000] [--no-browser]
//
// It picks where data lives, finds a free port, starts `next start`, waits
// until the server answers, and opens the browser. The console window is the
// app's on/off switch: closing it stops the server.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

process.title = "mimiuchi";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(appDir);
const args = process.argv.slice(2);
const noBrowser = args.includes("--no-browser");
const portArg = args.indexOf("--port");
const requestedPort = Number(
  (portArg >= 0 ? args[portArg + 1] : undefined) ?? process.env.PORT ?? 3000,
);

// ---------------------------------------------------------------------------
// Where things live
// ---------------------------------------------------------------------------

// Data is kept outside the app folder, so upgrading is "delete the old folder,
// extract the new one": nothing of yours is inside it.
const home = path.resolve(
  process.env.MIMIUCHI_HOME ||
    path.join(process.env.LOCALAPPDATA || os.homedir(), "mimiuchi"),
);
const env = { ...process.env };
env.NODE_ENV = "production";
env.NEXT_TELEMETRY_DISABLED = "1";
env.KIKOERU_DATA_DIR ||= path.join(home, "data");
env.KIKOERU_COVERS_DIR ||= path.join(home, "covers");
const bundledFfmpeg = path.join(rootDir, "ffmpeg", "ffmpeg.exe");
if (!env.KIKOERU_FFMPEG_PATH && fs.existsSync(bundledFfmpeg)) {
  env.KIKOERU_FFMPEG_PATH = bundledFfmpeg;
}
// Never let a stray .env in someone's environment point us at a dev build dir.
delete env.KIKOERU_DIST_DIR;

const logDir = path.join(home, "logs");
const logFile = path.join(logDir, "server.log");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function say(line = "") {
  process.stdout.write(line + "\n");
}

/** Keeps the window open so a non-technical user can read what went wrong. */
async function waitForEnter(message = "Press Enter to close this window.") {
  if (!process.stdin.isTTY) return;
  say("");
  say(message);
  const rl = readline.createInterface({ input: process.stdin });
  await new Promise((resolve) => rl.once("line", resolve));
  rl.close();
}

/** GET /api/health: "mine", "other" (something else answered), or "none". */
function probe(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/health", timeout: 1500 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body).app === "mimiuchi" ? "mine" : "other");
          } catch {
            resolve("other");
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) =>
      resolve(err.code === "ECONNREFUSED" ? "none" : "other"),
    );
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "0.0.0.0", exclusive: true }, () =>
      srv.close(() => resolve(true)),
    );
  });
}

/** IPv4 addresses a phone on the same network could use. */
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    // Virtual adapters for VMs/WSL are unreachable from a phone.
    if (/vEthernet|VirtualBox|VMware|Hyper-V|Loopback/i.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (a.address.startsWith("169.254.")) continue;
      out.push(a.address);
    }
  }
  // Home-network ranges first: that is the one a phone on the same Wi-Fi
  // uses. VPN addresses such as Tailscale's 100.x still follow.
  const isPrivate = (ip) =>
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return out.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

function openBrowser(url) {
  if (noBrowser) return;
  // explorer.exe hands a URL to the default browser without a shell, so no
  // quoting can go wrong.
  spawn("explorer.exe", [url], { detached: true, stdio: "ignore" }).unref();
}

function banner(port) {
  const local = `http://localhost:${port}`;
  say("");
  say("  ==============================================================");
  say("   mimiuchi is running");
  say("  ==============================================================");
  say("");
  say(`   On this computer:   ${local}`);
  const lan = lanAddresses();
  if (lan.length > 0) {
    say(`   On your phone:      http://${lan[0]}:${port}`);
    for (const ip of lan.slice(1)) say(`                       http://${ip}:${port}`);
    say("                       (phone and computer on the same Wi-Fi)");
  }
  say("");
  say(`   Your data:          ${home}`);
  say(`   Log file:           ${logFile}`);
  say("");
  say("   Keep this window open while you use mimiuchi.");
  say("   Close it to stop mimiuchi.");
  say("  ==============================================================");
  say("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin) || !fs.existsSync(path.join(appDir, ".next"))) {
    say("mimiuchi can't start: some of its files are missing.");
    say("Extract the whole zip again, then run mimiuchi.exe from the extracted folder.");
    await waitForEnter();
    process.exit(1);
  }

  say("Starting mimiuchi…");

  // Already running (double-clicked twice)? Just open it.
  const existing = await probe(requestedPort);
  if (existing === "mine") {
    say(`mimiuchi is already running at http://localhost:${requestedPort}`);
    say("Opening it in your browser. This window will close by itself.");
    openBrowser(`http://localhost:${requestedPort}`);
    setTimeout(() => process.exit(0), 4000);
    return;
  }

  let port = requestedPort;
  if (existing === "other" || !(await portIsFree(port))) {
    let found = 0;
    for (let p = requestedPort + 1; p <= requestedPort + 20; p++) {
      if ((await probe(p)) === "mine") {
        say(`mimiuchi is already running at http://localhost:${p}`);
        openBrowser(`http://localhost:${p}`);
        setTimeout(() => process.exit(0), 4000);
        return;
      }
      if (await portIsFree(p)) {
        found = p;
        break;
      }
    }
    if (!found) {
      say(`Port ${requestedPort} and the next 20 are all in use by other programs.`);
      say("Close some programs, or start with a different port, e.g.:");
      say("  runtime\\node.exe app\\launcher.mjs --port 4000");
      await waitForEnter();
      process.exit(1);
    }
    say(`Port ${requestedPort} is used by another program, so mimiuchi will use ${found}.`);
    port = found;
  }

  fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.renameSync(logFile, path.join(logDir, "server.previous.log"));
  } catch {
    /* first run */
  }
  const log = fs.createWriteStream(logFile, { flags: "a" });
  log.write(`--- started ${new Date().toISOString()} on port ${port}\n`);

  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  // Everything goes to the log; only errors and warnings to the window, so the
  // addresses above stay on screen instead of scrolling away under scan logs.
  child.stdout.on("data", (chunk) => log.write(chunk));
  child.stderr.on("data", (chunk) => {
    log.write(chunk);
    process.stderr.write(chunk);
  });

  let stopping = false;
  const stop = () => {
    stopping = true;
    child.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop); // window closed

  let ready = false;
  child.on("exit", async (code) => {
    log.end();
    if (stopping) process.exit(0);
    say("");
    say(
      ready
        ? `mimiuchi stopped unexpectedly (exit code ${code}).`
        : `mimiuchi could not start (exit code ${code}).`,
    );
    say(`Details are in the log file: ${logFile}`);
    await waitForEnter();
    process.exit(code || 1);
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && child.exitCode === null) {
    if ((await probe(port)) === "mine") {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) {
    if (child.exitCode === null) {
      say("mimiuchi is taking unusually long to start; still waiting.");
      say(`If nothing happens, check the log file: ${logFile}`);
    }
    return;
  }

  banner(port);
  openBrowser(`http://localhost:${port}`);
}

main().catch(async (err) => {
  say(`mimiuchi hit an unexpected error: ${err?.stack ?? err}`);
  await waitForEnter();
  process.exit(1);
});
