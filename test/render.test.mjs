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
    { repo: "a", agent: "alpha", message: "Do task A" },
    { repo: "b", agent: "beta", message: "Do task B" },
  ], [
    { repo: "a", agent: "alpha", success: true, session_id: "ses_a", result: "A_OK", elapsed_ms: 850, elapsed: "850ms", progress: ["child session started"] },
    { repo: "b", agent: "beta", success: false, error: "B_FAIL", elapsed_ms: 1250, elapsed: "1.3s", progress: ["child session finished (error)"] },
  ])

  assert.match(output, /Parallel Dispatch Results/)
  assert.match(output, /Dispatch Plan/)
  assert.match(output, /`a` -> `alpha`/)
  assert.match(output, /prompt: `Do task A`/)
  assert.match(output, /succeeded/)
  assert.match(output, /failed/)
  assert.match(output, /total child time: `2100ms`/)
  assert.match(output, /ses_a/)
  assert.match(output, /elapsed: `850ms`/)
  assert.match(output, /elapsed: `1.3s`/)
  assert.match(output, /A_OK/)
  assert.match(output, /B_FAIL/)
})
