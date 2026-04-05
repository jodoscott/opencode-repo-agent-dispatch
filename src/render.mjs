export function fencedJson(value) {
  return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

export function renderRepoListMarkdown(payload) {
  const lines = ["## Repo Agents"]
  for (const repo of payload) {
    lines.push(`- \`${repo.repo}\`: default \`${repo.default_agent ?? "none"}\`; agents ${repo.agents.map((agent) => `\`${agent}\``).join(", ")}`)
  }
  lines.push(fencedJson(payload))
  return lines.join("\n")
}

export function renderDispatchMarkdown(payload) {
  const lines = [
    "## Dispatch Result",
    `- repo: \`${payload.repo}\``,
    `- agent: \`${payload.agent}\``,
    `- success: \`${String(payload.success)}\``,
  ]

  if (payload.session_id) lines.push(`- session: \`${payload.session_id}\``)
  if (payload.result) lines.push(`- result: \`${payload.result}\``)
  if (payload.progress?.length) {
    lines.push("- progress:")
    for (const entry of payload.progress) {
      lines.push(`  ${entry}`)
    }
  }
  lines.push(fencedJson(payload))
  return lines.join("\n")
}

export function renderStatusMarkdown(payload) {
  const lines = [
    "## Session Status",
    `- session: \`${payload.session_id}\``,
    `- title: ${payload.title}`,
    `- directory: \`${payload.directory}\``,
    `- agents: ${payload.agents.map((agent) => `\`${agent}\``).join(", ")}`,
  ]

  if (payload.finish) lines.push(`- finish: \`${payload.finish}\``)
  if (payload.result) lines.push(`- result: \`${payload.result}\``)
  if (payload.tool_calls?.length) {
    lines.push("- tool calls:")
    for (const toolCall of payload.tool_calls) {
      lines.push(`  - \`${toolCall.tool}\` status=\`${toolCall.status ?? "unknown"}\``)
    }
  }
  lines.push(fencedJson(payload))
  return lines.join("\n")
}

export function renderParallelMarkdown(results) {
  const lines = ["## Parallel Dispatch Results"]
  for (const result of results) {
    const agent = result.agent ?? "default"
    const status = result.success ? result.result : `FAILED: ${result.error ?? "unknown error"}`
    lines.push(`- \`${result.repo}\` / \`${agent}\`: \`${status}\``)
  }
  lines.push(fencedJson(results))
  return lines.join("\n")
}
