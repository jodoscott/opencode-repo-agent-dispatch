export function fencedJson(value) {
  return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function trimText(input) {
  const singleLine = String(input ?? "").replace(/\n/g, " ")
  return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine
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
  if (payload.elapsed) lines.push(`- elapsed: \`${payload.elapsed}\``)
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

export function renderJobMarkdown(job) {
  const lines = [
    "## Dispatch Job",
    `- job: \`${job.id}\``,
    `- status: \`${job.status}\``,
    `- tasks: \`${job.summary?.task_count ?? job.tasks?.length ?? 0}\``,
    `- running: \`${job.summary?.running ?? 0}\``,
    `- queued: \`${job.summary?.queued ?? 0}\``,
    `- succeeded: \`${job.summary?.succeeded ?? 0}\``,
    `- failed: \`${job.summary?.failed ?? 0}\``,
    `- cancelled: \`${job.summary?.cancelled ?? 0}\``,
  ]

  if (job.summary?.last_completed) lines.push(`- last completed: \`${job.summary.last_completed}\``)
  if (job.summary?.last_progress) lines.push(`- last progress: \`${job.summary.last_progress}\``)

  lines.push("")
  lines.push("## Tasks")
  for (const task of job.tasks ?? []) {
    lines.push(`- [${task.index}] \`${task.repo}\` -> \`${task.agent ?? "default"}\` status=\`${task.status}\``)
    lines.push(`  prompt: \`${trimText(task.message_summary ?? task.message)}\``)
    if (task.session_id) lines.push(`  session: \`${task.session_id}\``)
    if (task.elapsed) lines.push(`  elapsed: \`${task.elapsed}\``)
    if (task.last_progress) lines.push(`  progress: \`${task.last_progress}\``)
    if (task.error) lines.push(`  error: \`${trimText(task.error)}\``)
  }

  lines.push(fencedJson(job))
  return lines.join("\n")
}

export function renderJobListMarkdown(jobs) {
  const lines = ["## Dispatch Jobs"]
  if (!jobs.length) {
    lines.push("- no jobs")
    lines.push(fencedJson(jobs))
    return lines.join("\n")
  }

  for (const job of jobs) {
    lines.push(`- \`${job.id}\` status=\`${job.status}\` tasks=\`${job.summary?.task_count ?? job.tasks?.length ?? 0}\` succeeded=\`${job.summary?.succeeded ?? 0}\` failed=\`${job.summary?.failed ?? 0}\``)
  }
  lines.push(fencedJson(jobs))
  return lines.join("\n")
}

export function renderParallelMarkdown(tasks, results) {
  const successCount = results.filter((result) => result.success).length
  const failureCount = results.length - successCount
  const totalElapsedMs = results.reduce((sum, result) => sum + (result.elapsed_ms ?? 0), 0)
  const lines = [
    "## Parallel Dispatch Results",
    `- tasks: \`${results.length}\``,
    `- succeeded: \`${successCount}\``,
    `- failed: \`${failureCount}\``,
    `- total child time: \`${totalElapsedMs}ms\``,
  ]

  if (tasks?.length) {
    lines.push("")
    lines.push("## Dispatch Plan")
    tasks.forEach((task, index) => {
      const prompt = trimText(task.message)
      const extras = [
        task.model ? `model=\`${task.model}\`` : null,
        task.variant ? `variant=\`${task.variant}\`` : null,
      ].filter(Boolean)
      lines.push(`- [${index + 1}] \`${task.repo}\` -> \`${task.agent ?? "default"}\``)
      lines.push(`  prompt: \`${prompt}\``)
      if (extras.length) lines.push(`  ${extras.join(" ")}`)
    })
  }

  for (const result of results) {
    const agent = result.agent ?? "default"
    lines.push("")
    lines.push(`### \`${result.repo}\` / \`${agent}\``)
    lines.push(`- success: \`${String(result.success)}\``)

    if (result.session_id) lines.push(`- session: \`${result.session_id}\``)
    if (result.elapsed) lines.push(`- elapsed: \`${result.elapsed}\``)
    if (result.result) lines.push(`- result: \`${result.result}\``)
    if (!result.success && result.error) lines.push(`- error: \`${result.error}\``)

    if (result.progress?.length) {
      lines.push("- progress:")
      for (const entry of result.progress) {
        lines.push(`  ${entry}`)
      }
    }
  }

  lines.push(fencedJson(results))
  return lines.join("\n")
}
