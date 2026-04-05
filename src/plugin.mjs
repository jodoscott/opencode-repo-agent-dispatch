import { tool } from "@opencode-ai/plugin"
import { dispatchRepoAgent, dispatchRepoAgentsParallel, listRepoAgents, statusSession } from "./core.mjs"
import { renderDispatchMarkdown, renderParallelMarkdown, renderRepoListMarkdown, renderStatusMarkdown } from "./render.mjs"

const dispatchTaskSchema = tool.schema.object({
  repo: tool.schema.string().describe("Target repo key, like infra-talos-mgmt or platform-kubernetes-omni"),
  agent: tool.schema.string().optional().describe("Specific target agent name; omit to use the repo default agent"),
  message: tool.schema.string().describe("Prompt to send to the target repo agent"),
  model: tool.schema.string().optional().describe("Optional provider/model override"),
  variant: tool.schema.string().optional().describe("Optional model variant override"),
  verbose: tool.schema.boolean().optional().describe("Show progress and summarized child event details"),
  rawEvents: tool.schema.boolean().optional().describe("Show the raw child OpenCode event stream"),
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
          context.metadata({ title: "Repo dispatch: parallel", metadata: { taskCount: args.tasks.length } })
          return renderParallelMarkdown(await dispatchRepoAgentsParallel(options, args.tasks, runtime))
        },
      }),
    },
  }
}

export default {
  id: "opencode-repo-agent-dispatch",
  server,
}
