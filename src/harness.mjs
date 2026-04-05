import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

function defaultStateDirectory() {
  return path.join(os.homedir(), ".local", "share", "opencode-repo-agent-dispatch")
}

function summarizeMessage(message) {
  const singleLine = String(message ?? "").replace(/\n/g, " ")
  return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine
}

function nowIso() {
  return new Date().toISOString()
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath))
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2))
  await fs.rename(tempPath, filePath)
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8")
  return JSON.parse(raw)
}

export function getStateDirectory(options = {}) {
  return path.resolve(options.stateDirectory ?? defaultStateDirectory())
}

export function getJobsDirectory(options = {}) {
  return path.join(getStateDirectory(options), "jobs")
}

export function getJobDirectory(options = {}, jobId) {
  return path.join(getJobsDirectory(options), jobId)
}

export function getJobFilePath(options = {}, jobId) {
  return path.join(getJobDirectory(options, jobId), "job.json")
}

export function getJobLogPath(options = {}, jobId) {
  return path.join(getJobDirectory(options, jobId), "worker.log")
}

export function getWorkerEntrypoint(moduleUrl = import.meta.url) {
  return fileURLToPath(new URL("./worker.mjs", moduleUrl))
}

export async function createJob(options = {}, input, runtime = {}) {
  const jobId = randomUUID()
  const jobDir = getJobDirectory(options, jobId)
  await ensureDir(jobDir)
  const workingDirectory = runtime.workingDirectory ?? process.cwd()

  const tasks = input.tasks.map((task, index) => ({
    id: `${jobId}-task-${index + 1}`,
    index: index + 1,
    repo: task.repo,
    agent: task.agent ?? null,
    message: task.message,
    message_summary: summarizeMessage(task.message),
    model: task.model ?? null,
    variant: task.variant ?? null,
    verbose: Boolean(task.verbose),
    rawEvents: Boolean(task.rawEvents),
    status: "queued",
    created_at: nowIso(),
    updated_at: nowIso(),
    started_at: null,
    finished_at: null,
    elapsed_ms: null,
    elapsed: null,
    session_id: null,
    result: null,
    error: null,
    progress: [],
    last_progress: null,
  }))

  const job = {
    id: jobId,
    status: "queued",
    created_at: nowIso(),
    updated_at: nowIso(),
    started_at: null,
    finished_at: null,
    concurrency: input.concurrency ?? tasks.length,
    worker_pid: null,
    cancel_requested: false,
    dispatch_working_directory: workingDirectory,
    dispatch_options: {
      baseDirectory: options.baseDirectory,
      repos: options.repos,
      opencodeBin: options.opencodeBin,
    },
    summary: {
      task_count: tasks.length,
      succeeded: 0,
      failed: 0,
      running: 0,
      queued: tasks.length,
      cancelled: 0,
      last_completed: null,
      last_progress: null,
    },
    tasks,
  }

  await writeJson(getJobFilePath(options, jobId), job)

  if (runtime.startWorker !== false) {
    await startJobWorker(options, jobId, runtime)
  }

  return readJob(options, jobId)
}

export async function readJob(options = {}, jobId) {
  return readJson(getJobFilePath(options, jobId))
}

export async function writeJob(options = {}, job) {
  job.updated_at = nowIso()
  await writeJson(getJobFilePath(options, job.id), job)
  return job
}

export async function listJobs(options = {}) {
  const jobsDir = getJobsDirectory(options)
  try {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true })
    const jobs = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        jobs.push(await readJob(options, entry.name))
      } catch {
        // ignore unreadable job records
      }
    }
    return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at))
  } catch {
    return []
  }
}

export async function cancelJob(options = {}, jobId) {
  const job = await readJob(options, jobId)
  job.cancel_requested = true
  if (!["completed", "failed", "cancelled"].includes(job.status)) {
    job.status = "cancelling"
  }
  await writeJob(options, job)

  if (job.worker_pid) {
    try {
      process.kill(job.worker_pid, "SIGTERM")
    } catch {
      // ignore already-finished worker
    }
  }

  return readJob(options, jobId)
}

export async function updateTask(options = {}, jobId, taskId, updater) {
  const job = await readJob(options, jobId)
  const task = job.tasks.find((item) => item.id === taskId)
  if (!task) {
    throw new Error(`Unknown task: ${taskId}`)
  }
  updater(task, job)
  recomputeJobSummary(job)
  await writeJob(options, job)
  return job
}

export function recomputeJobSummary(job) {
  const summary = {
    task_count: job.tasks.length,
    succeeded: 0,
    failed: 0,
    running: 0,
    queued: 0,
    cancelled: 0,
    last_completed: job.summary?.last_completed ?? null,
    last_progress: job.summary?.last_progress ?? null,
  }

  for (const task of job.tasks) {
    if (task.status === "completed") summary.succeeded += 1
    else if (task.status === "failed") summary.failed += 1
    else if (task.status === "cancelled") summary.cancelled += 1
    else if (["running", "starting"].includes(task.status)) summary.running += 1
    else if (task.status === "queued") summary.queued += 1
  }

  job.summary = summary

  if (job.cancel_requested && summary.running === 0 && summary.queued === 0) {
    job.status = summary.cancelled === job.tasks.length ? "cancelled" : job.status
  } else if (summary.running > 0) {
    job.status = "running"
  } else if (summary.failed > 0 && summary.succeeded + summary.failed + summary.cancelled === job.tasks.length) {
    job.status = "failed"
  } else if (summary.succeeded === job.tasks.length) {
    job.status = "completed"
  } else if (summary.cancelled === job.tasks.length) {
    job.status = "cancelled"
  } else if (summary.queued === job.tasks.length) {
    job.status = job.cancel_requested ? "cancelling" : "queued"
  }
}

export async function startJobWorker(options = {}, jobId, runtime = {}) {
  const workerEntrypoint = options.workerEntrypoint ?? getWorkerEntrypoint(runtime.moduleUrl ?? import.meta.url)
  const nodeBin = options.nodeBin ?? runtime.nodeBin ?? "node"
  const stateDir = getStateDirectory(options)
  const args = [workerEntrypoint, "run-job", "--state-dir", stateDir, "--job-id", jobId]
  const logPath = getJobLogPath(options, jobId)
  await ensureDir(path.dirname(logPath))
  const logHandle = await fs.open(logPath, "a")

  const child = spawn(nodeBin, args, {
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  })
  child.unref()
  await logHandle.close()

  const job = await readJob(options, jobId)
  job.worker_pid = child.pid
  job.status = "starting"
  if (!job.started_at) job.started_at = nowIso()
  await writeJob(options, job)
  return job
}

export async function waitForJob(options = {}, jobId, waitOptions = {}) {
  const pollIntervalMs = waitOptions.pollIntervalMs ?? 1000
  const timeoutMs = waitOptions.timeoutMs ?? 300000
  const startedAt = Date.now()

  for (;;) {
    const job = await readJob(options, jobId)
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return job
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for job ${jobId}`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}
