import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import { getRepoDefinition, normalizeRepoRegistry } from "./config.mjs"

function trimText(input) {
  const singleLine = String(input ?? "").replace(/\n/g, " ")
  return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine
}

function summarizeEvent(event) {
  switch (event?.type) {
    case "step_start":
      return "child session started"
    case "tool_use": {
      const toolName = event.part?.tool ?? "unknown"
      const title = event.part?.state?.title
      return title ? `tool: ${toolName} | ${title}` : `tool: ${toolName}`
    }
    case "text":
      return event.part?.text ? `text: ${trimText(event.part.text)}` : null
    case "step_finish":
      return event.part?.reason ? `child session finished (${event.part.reason})` : "child session finished"
    default:
      return null
  }
}

function extractJsonDocument(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error("No JSON output received")
  }

  const firstBrace = trimmed.indexOf("{")
  const firstBracket = trimmed.indexOf("[")
  const startCandidates = [firstBrace, firstBracket].filter((value) => value >= 0)
  const start = Math.min(...startCandidates)
  if (!Number.isFinite(start)) {
    throw new Error("Could not locate JSON in command output")
  }

  return JSON.parse(trimmed.slice(start))
}

function runCommand(command, args, { cwd = process.cwd(), env = process.env, onStdoutLine, onStderrLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env })
    const stdoutLines = []
    const stderrLines = []
    let stdoutBuffer = ""
    let stderrBuffer = ""

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ""
      for (const line of lines) {
        stdoutLines.push(line)
        onStdoutLine?.(line)
      }
    })

    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString()
      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() ?? ""
      for (const line of lines) {
        stderrLines.push(line)
        onStderrLine?.(line)
      }
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (stdoutBuffer) stdoutLines.push(stdoutBuffer)
      if (stderrBuffer) stderrLines.push(stderrBuffer)
      resolve({ code: code ?? 0, stdoutLines, stderrLines })
    })
  })
}

export function listRepoAgents(options = {}, workingDirectory = process.cwd()) {
  const registry = normalizeRepoRegistry(options, workingDirectory)
  return Object.values(registry)
    .map((repo) => ({
      repo: repo.key,
      path: repo.path,
      default_agent: repo.defaultAgent,
      agents: repo.agents ?? (repo.defaultAgent ? [repo.defaultAgent] : []),
    }))
    .sort((a, b) => a.repo.localeCompare(b.repo))
}

export async function dispatchRepoAgent(options = {}, args, runtime = {}) {
  const repo = getRepoDefinition(options, args.repo, runtime.workingDirectory)
  const opencodeBin = options.opencodeBin ?? "opencode"
  const agent = args.agent ?? repo.defaultAgent

  if (!agent) {
    throw new Error(`No agent provided and repo '${args.repo}' has no defaultAgent`)
  }

  const commandArgs = [
    "run",
    "--dir",
    repo.path,
    "--agent",
    agent,
    "--format",
    "json",
  ]

  if (args.model) commandArgs.push("--model", args.model)
  if (args.variant) commandArgs.push("--variant", args.variant)
  commandArgs.push(args.message)

  const events = []
  const progress = []
  const stderr = []

  if (!runtime.quiet) {
    runtime.onProgress?.(`dispatching repo=${args.repo} agent=${agent}`)
    if (args.verbose && args.message) {
      runtime.onProgress?.(`message: ${trimText(args.message)}`)
    }
  }

  const result = await runCommand(opencodeBin, commandArgs, {
    cwd: runtime.workingDirectory ?? process.cwd(),
    onStdoutLine: (line) => {
      if (!line.trim()) return
      let event
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      events.push(event)
      const summary = summarizeEvent(event)
      if (summary) {
        progress.push(summary)
        if (!runtime.quiet) runtime.onProgress?.(summary)
      }
      if (args.rawEvents && !runtime.quiet) {
        runtime.onRawEvent?.(line)
      }
    },
    onStderrLine: (line) => {
      if (!line.trim()) return
      stderr.push(line)
      if (!runtime.quiet) runtime.onStderr?.(line)
    },
  })

  if (result.code !== 0) {
    return {
      repo: args.repo,
      path: repo.path,
      agent,
      success: false,
      error: [...stderr, ...result.stdoutLines].join("\n"),
      progress,
      events,
      stderr,
    }
  }

  return {
    repo: args.repo,
    path: repo.path,
    agent,
    success: true,
    session_id: events.find((event) => event.sessionID)?.sessionID ?? "",
    result: events.filter((event) => event.type === "text").map((event) => event.part?.text ?? "").join(""),
    event_count: events.length,
    progress,
    events,
    stderr,
  }
}

export async function dispatchRepoAgentsParallel(options = {}, tasks, runtime = {}) {
  return Promise.all(tasks.map((task) => dispatchRepoAgent(options, task, runtime)))
}

export async function statusSession(options = {}, args, runtime = {}) {
  const opencodeBin = options.opencodeBin ?? "opencode"
  const result = await runCommand(opencodeBin, ["export", args.sessionId], {
    cwd: runtime.workingDirectory ?? process.cwd(),
  })

  if (result.code !== 0) {
    throw new Error(`Failed to export session ${args.sessionId}`)
  }

  const exported = extractJsonDocument(result.stdoutLines.join("\n"))

  return {
    session_id: exported.info.id,
    title: exported.info.title,
    directory: exported.info.directory,
    version: exported.info.version,
    created: exported.info.time.created,
    updated: exported.info.time.updated,
    agents: [...new Set(exported.messages.map((message) => message.info.agent).filter(Boolean))],
    result: exported.messages.flatMap((message) => message.parts).filter((part) => part.type === "text").at(-1)?.text ?? "",
    tool_calls: exported.messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "tool")
      .map((part) => ({
        tool: part.tool,
        status: part.state?.status ?? null,
        title: part.state?.title ?? null,
        started: part.state?.time?.start ?? null,
        ended: part.state?.time?.end ?? null,
      })),
    tokens: exported.messages.map((message) => message.info.tokens).filter(Boolean).at(-1) ?? null,
    finish: exported.messages.map((message) => message.info.finish).filter(Boolean).at(-1) ?? null,
  }
}

export async function loadConfigFile(configPath) {
  const raw = await fs.readFile(configPath, "utf8")
  return JSON.parse(raw)
}
