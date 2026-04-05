import test from "node:test"
import assert from "node:assert/strict"
import { renderDispatchMarkdown, renderParallelMarkdown, renderStatusMarkdown } from "../src/render.mjs"

test("renderDispatchMarkdown includes result and session", () => {
  const output = renderDispatchMarkdown({
    repo: "infra-talos-mgmt",
    agent: "talos-mgmt",
    success: true,
    session_id: "ses_123",
    result: "OK",
    progress: ["child session started"],
  })

  assert.match(output, /Dispatch Result/)
  assert.match(output, /ses_123/)
  assert.match(output, /OK/)
})

test("renderStatusMarkdown includes tool call summary", () => {
  const output = renderStatusMarkdown({
    session_id: "ses_123",
    title: "Example",
    directory: "/tmp/example",
    agents: ["project-manager"],
    finish: "stop",
    result: "DONE",
    tool_calls: [{ tool: "repo_agent_dispatch", status: "completed" }],
  })

  assert.match(output, /Session Status/)
  assert.match(output, /repo_agent_dispatch/)
})

test("renderParallelMarkdown includes both task results", () => {
  const output = renderParallelMarkdown([
    { repo: "a", agent: "alpha", success: true, result: "A_OK" },
    { repo: "b", agent: "beta", success: true, result: "B_OK" },
  ])

  assert.match(output, /Parallel Dispatch Results/)
  assert.match(output, /A_OK/)
  assert.match(output, /B_OK/)
})
