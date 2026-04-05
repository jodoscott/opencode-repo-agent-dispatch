import test from "node:test"
import assert from "node:assert/strict"
import { normalizeRepoRegistry } from "../src/config.mjs"

test("normalizeRepoRegistry resolves relative repo paths", () => {
  const registry = normalizeRepoRegistry(
    {
      baseDirectory: "../Projects",
      repos: {
        alpha: {
          path: "repo-alpha",
          defaultAgent: "alpha-agent",
        },
      },
    },
    "/Users/example/workspace/root",
  )

  assert.equal(registry.alpha.defaultAgent, "alpha-agent")
  assert.equal(registry.alpha.path, "/Users/example/workspace/Projects/repo-alpha")
})
