# opencode-repo-agent-dispatch

General-purpose OpenCode plugin and CLI for dispatching agents across local repositories.

It provides:
- repo registry management
- repo-local agent listing
- child-agent dispatch to another repository
- child-session status lookup
- parallel repo-agent dispatch
- TUI-friendly tool output for OpenCode sessions

## Install

```bash
npm install opencode-repo-agent-dispatch
```

For local development:

```bash
npm install ../opencode-repo-agent-dispatch
```

## Plugin Configuration

Add the plugin to your `opencode.json` and provide a repo registry.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-repo-agent-dispatch/plugin",
      {
        "baseDirectory": "/Users/name/Projects",
        "repos": {
          "infra-talos-mgmt": {
            "path": "infra-talos-mgmt",
            "defaultAgent": "talos-mgmt"
          },
          "platform-kubernetes-omni": {
            "path": "platform-kubernetes-omni",
            "defaultAgent": "platform-omni"
          }
        }
      }
    ]
  ]
}
```

`baseDirectory` is optional. Relative repo paths resolve from `baseDirectory` when set, otherwise from the current OpenCode project directory.

## Tools

- `repo_agent_list`
- `repo_agent_dispatch`
- `repo_agent_status`
- `repo_agent_dispatch_parallel`

## CLI

```bash
opencode-repo-agent-dispatch list --config ./repo-dispatch.config.json

opencode-repo-agent-dispatch run \
  --config ./repo-dispatch.config.json \
  --repo infra-talos-mgmt \
  --agent talos-mgmt \
  --message "Reply with exactly OK and nothing else."

opencode-repo-agent-dispatch status \
  --config ./repo-dispatch.config.json \
  --session-id ses_abc123
```

Parallel dispatch:

```bash
opencode-repo-agent-dispatch parallel \
  --config ./repo-dispatch.config.json \
  --tasks-file ./tasks.json
```

## Config File

The CLI accepts a JSON config file:

```json
{
  "baseDirectory": "/Users/name/Projects",
  "repos": {
    "infra-talos-mgmt": {
      "path": "infra-talos-mgmt",
      "defaultAgent": "talos-mgmt"
    }
  }
}
```

## Release Model

- CI runs on push and pull request.
- Tag pushes like `v0.1.0` create a GitHub release.
- If `NPM_TOKEN` is configured, the release workflow also publishes to npm.
