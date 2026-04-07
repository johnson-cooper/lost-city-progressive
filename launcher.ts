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
};

const runningProcesses: Record<string, any> = {};

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

function showMenu() {
  console.log(`
=== Bun Launcher ===

1. Start Server (bun start)
2. Run Hiscores (parallel)
3. Dev Mode
4. Friend
5. Logger
6. Login
7. Build
8. Clean
9. Stop Hiscores
10. Start Server & Hiscores (Best Option)
0. Exit

Choose an option:
`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function handleInput(input: string) {
  switch (input.trim()) {
    case "1":
      runScript("start");
      break;

    case "2":
      runScript("hiscores", true); // 🔥 parallel
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

    case "0":
      console.log("👋 Exiting...");
      process.exit(0);
  }

  showMenu();
}

showMenu();
rl.on("line", handleInput);
