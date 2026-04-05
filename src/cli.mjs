#!/usr/bin/env node

import process from "node:process"
import { dispatchRepoAgent, dispatchRepoAgentsParallel, listRepoAgents, loadConfigFile, statusSession } from "./core.mjs"

function usage() {
  process.stderr.write(`Usage:\n  opencode-repo-agent-dispatch list --config <path>\n  opencode-repo-agent-dispatch run --config <path> --repo <repo> [--agent <agent>] --message <text> [--model <provider/model>] [--variant <variant>] [--verbose] [--raw-events]\n  opencode-repo-agent-dispatch status --config <path> --session-id <session-id>\n  opencode-repo-agent-dispatch parallel --config <path> --tasks-file <path>\n`)
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  const args = { command }

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    switch (token) {
      case "--config":
        args.config = rest[++index]
        break
      case "--repo":
        args.repo = rest[++index]
        break
      case "--agent":
        args.agent = rest[++index]
        break
      case "--message":
        args.message = rest[++index]
        break
      case "--model":
        args.model = rest[++index]
        break
      case "--variant":
        args.variant = rest[++index]
        break
      case "--session-id":
        args.sessionId = rest[++index]
        break
      case "--tasks-file":
        args.tasksFile = rest[++index]
        break
      case "--verbose":
        args.verbose = true
        break
      case "--raw-events":
        args.rawEvents = true
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  return args
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (!args.command || !args.config) {
      usage()
      process.exit(1)
    }

    const options = await loadConfigFile(args.config)
    const runtime = {
      quiet: false,
      workingDirectory: process.cwd(),
      onProgress: (message) => process.stderr.write(`[opencode-repo-agent-dispatch] ${message}\n`),
      onRawEvent: (line) => process.stderr.write(`[opencode-repo-agent-dispatch][raw] ${line}\n`),
      onStderr: (line) => process.stderr.write(`${line}\n`),
    }

    let result
    switch (args.command) {
      case "list":
        result = listRepoAgents(options, process.cwd())
        break
      case "run":
        result = await dispatchRepoAgent(options, args, runtime)
        break
      case "status":
        result = await statusSession(options, args, runtime)
        break
      case "parallel": {
        if (!args.tasksFile) {
          throw new Error("Missing required --tasks-file")
        }
        const tasks = await loadConfigFile(args.tasksFile)
        result = await dispatchRepoAgentsParallel(options, tasks, runtime)
        break
      }
      default:
        throw new Error(`Unknown command: ${args.command}`)
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}

await main()
