import { tool } from "@opencode-ai/plugin"
import { dispatchRepoAgent, dispatchRepoAgentsParallel, listRepoAgents, statusSession } from "./core.mjs"
import { cancelJob, createJob, listJobs, readJob } from "./harness.mjs"
import { renderDispatchMarkdown, renderJobListMarkdown, renderJobMarkdown, renderParallelMarkdown, renderRepoListMarkdown, renderStatusMarkdown } from "./render.mjs"

const dispatchTaskSchema = tool.schema.object({
  repo: tool.schema.string().describe("Target repo key, like infra-talos-mgmt or platform-kubernetes-omni"),
  agent: tool.schema.string().optional().describe("Specific target agent name; omit to use the repo default agent"),
  message: tool.schema.string().describe("Prompt to send to the target repo agent"),
  model: tool.schema.string().optional().describe("Optional provider/model override"),
  variant: tool.schema.string().optional().describe("Optional model variant override"),
  verbose: tool.schema.boolean().optional().describe("Show progress and summarized child event details"),
  rawEvents: tool.schema.boolean().optional().describe("Show the raw child OpenCode event stream"),
})

function summarizeTasks(tasks) {
  return tasks.map((task) => `${task.repo}/${task.agent ?? "default"}`)
}

function formatTaskDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "unknown"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function normalizeHarnessTasks(tasks) {
  return tasks.map((task) => ({
    repo: task.repo,
    agent: task.agent,
    message: task.message,
    verbose: Boolean(task.verbose),
    rawEvents: Boolean(task.rawEvents),
  }))
}

const startTaskSchema = tool.schema.object({
  repo: tool.schema.string(),
  agent: tool.schema.string().optional(),
  message: tool.schema.string(),
  model: tool.schema.string().optional(),
  variant: tool.schema.string().optional(),
  verbose: tool.schema.boolean().optional(),
  rawEvents: tool.schema.boolean().optional(),
})

export async function server(input, options = {}) {
  const runtime = {
    workingDirectory: input.directory,
    quiet: true,
  }

  return {
    tool: {
      repo_agent_list: tool({
        description: "List sibling repos and repo-local agents available for dispatch",
        args: {},
        async execute(_args, context) {
          context.metadata({ title: "Repo dispatch: list" })
          return renderRepoListMarkdown(listRepoAgents(options, input.directory))
        },
      }),
      repo_agent_dispatch: tool({
        description: "Dispatch a prompt to a specific sibling repo agent through the local OpenCode CLI",
        args: dispatchTaskSchema.shape,
        async execute(args, context) {
          context.metadata({ title: "Repo dispatch: run", metadata: { repo: args.repo, agent: args.agent } })
          return renderDispatchMarkdown(await dispatchRepoAgent(options, args, runtime))
        },
      }),
      repo_agent_status: tool({
        description: "Inspect a previously returned child repo-agent session id",
        args: {
          sessionId: tool.schema.string().describe("Child repo-agent session id returned by repo_agent_dispatch"),
        },
        async execute(args, context) {
          context.metadata({ title: "Repo dispatch: status", metadata: { sessionId: args.sessionId } })
          return renderStatusMarkdown(await statusSession(options, args, runtime))
        },
      }),
      repo_agent_dispatch_parallel: tool({
        description: "Dispatch multiple prompts to sibling repo agents in parallel",
        args: {
          tasks: tool.schema.array(dispatchTaskSchema).min(1).describe("Independent repo-agent dispatch tasks"),
        },
        async execute(args, context) {
          const targets = summarizeTasks(args.tasks)
          let completed = 0
          context.metadata({
            title: `Repo dispatch: parallel (0/${args.tasks.length} complete)`,
            metadata: {
              taskCount: args.tasks.length,
              targets,
              status: "running",
            },
          })

          const results = await Promise.all(
            args.tasks.map(async (task) => {
              const result = await dispatchRepoAgent(options, task, runtime)
              completed += 1
              context.metadata({
                title: `Repo dispatch: parallel (${completed}/${args.tasks.length} complete)`,
                metadata: {
                  taskCount: args.tasks.length,
                  targets,
                  status: completed === args.tasks.length ? "completed" : "running",
                  lastCompleted: `${task.repo}/${task.agent ?? result.agent ?? "default"}`,
                  lastCompletedElapsed: result.elapsed ?? formatTaskDuration(result.elapsed_ms),
                },
              })
              return result
            }),
          )

          context.metadata({
            title: `Repo dispatch: parallel (${results.length}/${results.length} complete)`,
            metadata: {
              taskCount: results.length,
              targets,
              status: "completed",
              succeeded: results.filter((result) => result.success).length,
              failed: results.filter((result) => !result.success).length,
            },
          })

          return renderParallelMarkdown(args.tasks, results)
        },
      }),
      repo_agent_dispatch_start: tool({
        description: "Start a persistent parallel dispatch job and return its job id",
        args: {
          tasks: tool.schema.array(startTaskSchema).min(1).describe("Tasks to run under the persistent dispatch harness"),
          concurrency: tool.schema.number().int().positive().optional().describe("Maximum concurrent child tasks"),
        },
        async execute(args, context) {
          const job = await createJob(
            options,
            { tasks: normalizeHarnessTasks(args.tasks), concurrency: args.concurrency },
            { moduleUrl: import.meta.url, workingDirectory: input.directory },
          )
          context.metadata({
            title: `Repo dispatch job started (${job.id})`,
            metadata: {
              jobId: job.id,
              taskCount: job.summary.task_count,
              status: job.status,
            },
          })
          return renderJobMarkdown(job)
        },
      }),
      repo_agent_dispatch_status: tool({
        description: "Read the current state of a persistent dispatch job",
        args: {
          jobId: tool.schema.string().describe("Dispatch job id"),
        },
        async execute(args, context) {
          const job = await readJob(options, args.jobId)
          context.metadata({ title: `Repo dispatch job status (${job.status})`, metadata: { jobId: job.id, status: job.status } })
          return renderJobMarkdown(job)
        },
      }),
      repo_agent_dispatch_list: tool({
        description: "List persistent dispatch jobs",
        args: {},
        async execute(_args, context) {
          const jobs = await listJobs(options)
          context.metadata({ title: `Repo dispatch jobs (${jobs.length})`, metadata: { count: jobs.length } })
          return renderJobListMarkdown(jobs)
        },
      }),
      repo_agent_dispatch_wait: tool({
        description: "Wait for a persistent dispatch job to finish",
        args: {
          jobId: tool.schema.string().describe("Dispatch job id"),
          pollIntervalMs: tool.schema.number().int().positive().optional().describe("Polling interval in milliseconds"),
          timeoutMs: tool.schema.number().int().positive().optional().describe("Timeout in milliseconds"),
        },
        async execute(args, context) {
          let snapshot = await readJob(options, args.jobId)
          context.metadata({ title: `Repo dispatch wait (${snapshot.status})`, metadata: { jobId: snapshot.id, status: snapshot.status } })
          const startedAt = Date.now()
          while (!["completed", "failed", "cancelled"].includes(snapshot.status)) {
            if (args.timeoutMs && Date.now() - startedAt > args.timeoutMs) {
              throw new Error(`Timed out waiting for job ${args.jobId}`)
            }

            await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs ?? 1000))
            snapshot = await readJob(options, args.jobId)
            context.metadata({
              title: `Repo dispatch wait (${snapshot.status})`,
              metadata: {
                jobId: snapshot.id,
                status: snapshot.status,
                succeeded: snapshot.summary?.succeeded ?? 0,
                failed: snapshot.summary?.failed ?? 0,
                running: snapshot.summary?.running ?? 0,
                queued: snapshot.summary?.queued ?? 0,
                lastProgress: snapshot.summary?.last_progress ?? null,
              },
            })
          }

          return renderJobMarkdown(snapshot)
        },
      }),
      repo_agent_dispatch_cancel: tool({
        description: "Request cancellation of a persistent dispatch job",
        args: {
          jobId: tool.schema.string().describe("Dispatch job id"),
        },
        async execute(args, context) {
          const job = await cancelJob(options, args.jobId)
          context.metadata({ title: `Repo dispatch cancel (${job.status})`, metadata: { jobId: job.id, status: job.status } })
          return renderJobMarkdown(job)
        },
      }),
    },
  }
}

export default {
  id: "opencode-repo-agent-dispatch",
  server,
}
