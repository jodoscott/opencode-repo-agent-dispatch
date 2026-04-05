#!/usr/bin/env node

import process from "node:process"
import { dispatchRepoAgent } from "./core.mjs"
import { readJob, recomputeJobSummary, writeJob } from "./harness.mjs"

let cancelled = false
let persistQueue = Promise.resolve()
process.on("SIGTERM", () => {
  cancelled = true
})

function parseArgs(argv) {
  const [command, ...rest] = argv
  const args = { command }
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    switch (token) {
      case "--state-dir":
        args.stateDirectory = rest[++index]
        break
      case "--job-id":
        args.jobId = rest[++index]
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }
  return args
}

async function persistProgress(options, jobId, taskId, callback) {
  persistQueue = persistQueue.then(async () => {
    const job = await readJob(options, jobId)
    const task = job.tasks.find((item) => item.id === taskId)
    if (!task) throw new Error(`Unknown task: ${taskId}`)
    callback(task, job)
    recomputeJobSummary(job)
    await writeJob(options, job)
  })
  await persistQueue
}

async function runJob(options, jobId) {
  const job = await readJob(options, jobId)
  const dispatchOptions = job.dispatch_options ?? {}
  const dispatchWorkingDirectory = job.dispatch_working_directory ?? process.cwd()
  const childEnv = { ...process.env }
  delete childEnv.OPENCODE
  delete childEnv.OPENCODE_PID
  job.status = job.cancel_requested ? "cancelling" : "running"
  job.started_at = job.started_at ?? new Date().toISOString()
  recomputeJobSummary(job)
  await writeJob(options, job)

  const concurrency = Math.max(1, job.concurrency ?? job.tasks.length)
  let nextIndex = 0

  async function runOne(task) {
    if (cancelled) {
      const freshJob = await readJob(options, jobId)
      freshJob.cancel_requested = true
      await writeJob(options, freshJob)
    }

    const currentJob = await readJob(options, jobId)
    if (currentJob.cancel_requested || cancelled) {
      await persistProgress(options, jobId, task.id, (currentTask) => {
        currentTask.status = "cancelled"
        currentTask.finished_at = new Date().toISOString()
        currentTask.updated_at = new Date().toISOString()
      })
      return
    }

    await persistProgress(options, jobId, task.id, (currentTask, currentJob) => {
      currentTask.status = "starting"
      currentTask.started_at = new Date().toISOString()
      currentTask.updated_at = new Date().toISOString()
      currentJob.summary.last_progress = `${currentTask.repo}/${currentTask.agent ?? "default"} starting`
    })

    const result = await dispatchRepoAgent(
      dispatchOptions,
      {
        repo: task.repo,
        agent: task.agent ?? undefined,
        message: task.message,
        model: task.model ?? undefined,
        variant: task.variant ?? undefined,
        verbose: task.verbose,
        rawEvents: task.rawEvents,
      },
      {
        quiet: false,
        workingDirectory: dispatchWorkingDirectory,
        env: childEnv,
        onProgress: async (message) => {
          await persistProgress(options, jobId, task.id, (currentTask, currentJob) => {
            currentTask.status = "running"
            currentTask.updated_at = new Date().toISOString()
            currentTask.last_progress = message
            currentTask.progress = [...currentTask.progress, message].slice(-20)
            currentJob.summary.last_progress = `${currentTask.repo}/${currentTask.agent ?? "default"}: ${message}`
          })
        },
        onStderr: async (line) => {
          await persistProgress(options, jobId, task.id, (currentTask) => {
            currentTask.last_progress = line
            currentTask.updated_at = new Date().toISOString()
          })
        },
      },
    )

    await persistProgress(options, jobId, task.id, (currentTask, currentJob) => {
      currentTask.status = result.success ? "completed" : "failed"
      currentTask.finished_at = new Date().toISOString()
      currentTask.updated_at = new Date().toISOString()
      currentTask.session_id = result.session_id ?? null
      currentTask.result = result.result ?? null
      currentTask.error = result.error ?? null
      currentTask.elapsed_ms = result.elapsed_ms ?? null
      currentTask.elapsed = result.elapsed ?? null
      currentTask.progress = result.progress ?? currentTask.progress
      currentTask.last_progress = result.progress?.at(-1) ?? currentTask.last_progress
      currentJob.summary.last_completed = `${currentTask.repo}/${currentTask.agent ?? result.agent ?? "default"}`
      currentJob.summary.last_progress = currentTask.last_progress
    })
  }

  async function workerLoop() {
    for (;;) {
      const freshJob = await readJob(options, jobId)
      if (freshJob.cancel_requested || cancelled) break
      const task = freshJob.tasks[nextIndex]
      nextIndex += 1
      if (!task) break
      if (task.status !== "queued") continue
      await runOne(task)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, job.tasks.length) }, () => workerLoop()))

  const finalJob = await readJob(options, jobId)
  finalJob.finished_at = new Date().toISOString()
  if (finalJob.cancel_requested && finalJob.tasks.every((task) => ["completed", "failed", "cancelled"].includes(task.status))) {
    finalJob.status = finalJob.tasks.some((task) => task.status === "failed") ? "failed" : "cancelled"
  }
  recomputeJobSummary(finalJob)
  await writeJob(options, finalJob)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command !== "run-job" || !args.jobId) {
    throw new Error("Usage: worker.mjs run-job --state-dir <dir> --job-id <id>")
  }

  await runJob({ stateDirectory: args.stateDirectory }, args.jobId)
}

await main()
