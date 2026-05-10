import { spawn } from "bun";
import readline from "readline";

type ScriptMap = Record<string, string[]>;

const scripts: ScriptMap = {
  start: ["bun", "run", "start"],
  hiscores: ["bun", "run", "hiscores"],
  dev: ["bun", "run", "dev"],
  friend: ["bun", "run", "friend"],
  logger: ["bun", "run", "logger"],
  login: ["bun", "run", "login"],
  build: ["bun", "run", "build"],
  clean: ["bun", "run", "clean"],
  setup: ["bun", "setup"],
};

const runningProcesses: Record<string, any> = {};
let rl: readline.Interface;

function createReadline() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on("line", handleInput);
}

function runScript(name: string, detached = false) {
  if (!scripts[name]) {
    console.log(`❌ Script "${name}" not found`);
    return;
  }

  console.log(`🚀 Starting ${name}...`);

  const proc = spawn({
    cmd: scripts[name],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  runningProcesses[name] = proc;

  if (detached) {
    console.log(`🧵 ${name} running in background`);
  } else {
    proc.exited.then(() => {
      console.log(`🛑 ${name} stopped`);
      delete runningProcesses[name];
    });
  }
}

// For processes that need full stdin control (interactive prompts).
// Closes readline so the child owns stdin, then restores it on exit.
async function runInteractive(name: string) {
  if (!scripts[name]) {
    console.log(`❌ Script "${name}" not found`);
    return;
  }

  console.log(`🚀 Starting ${name}...`);

  rl.close();

  const proc = spawn({
    cmd: scripts[name],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  runningProcesses[name] = proc;
  await proc.exited;

  console.log(`🛑 ${name} stopped`);
  delete runningProcesses[name];

  createReadline();
  showMenu();
}

function showMenu() {
  console.log(`
=== Bun Launcher ===

1.  Start Server (bun start)
2.  Run Hiscores (parallel)
3.  Dev Mode
4.  Friend
5.  Logger
6.  Login
7.  Build
8.  Clean
9.  Stop Hiscores
10. Start Server & Hiscores (Best Option)
11. Setup (bun setup)
0.  Exit

Choose an option:
`);
}

async function handleInput(input: string) {
  switch (input.trim()) {
    case "1":
      runScript("start");
      break;

    case "2":
      runScript("hiscores", true);
      break;

    case "3":
      runScript("dev");
      break;

    case "4":
      runScript("friend");
      break;

    case "5":
      runScript("logger");
      break;

    case "6":
      runScript("login");
      break;

    case "7":
      runScript("build");
      break;

    case "8":
      runScript("clean");
      break;

    case "9":
      if (runningProcesses["hiscores"]) {
        runningProcesses["hiscores"].kill();
        console.log("🛑 Hiscores stopped");
      } else {
        console.log("⚠️ Hiscores not running");
      }
      break;

    case "10":
      runScript("start");
      runScript("hiscores", true);
      break;

    case "11":
      await runInteractive("setup");
      return; // runInteractive shows the menu after exit

    case "0":
      console.log("👋 Exiting...");
      process.exit(0);
  }

  showMenu();
}

showMenu();
createReadline();
