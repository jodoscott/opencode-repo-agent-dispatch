# opencode-repo-agent-dispatch

General-purpose OpenCode plugin and CLI for dispatching agents across local repositories.

It provides:
- repo registry management
- repo-local agent listing
- child-agent dispatch to another repository
- child-session status lookup
- parallel repo-agent dispatch
- persistent dispatch jobs with status, wait, list, and cancel flows
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
- `repo_agent_dispatch_start`
- `repo_agent_dispatch_status`
- `repo_agent_dispatch_list`
- `repo_agent_dispatch_wait`
- `repo_agent_dispatch_watch`
- `repo_agent_dispatch_cancel`

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

Persistent harness job flow:

```bash
opencode-repo-agent-dispatch job-start \
  --config ./repo-dispatch.config.json \
  --tasks-file ./tasks.json \
  --concurrency 2

opencode-repo-agent-dispatch job-status \
  --config ./repo-dispatch.config.json \
  --job-id <job-id>

opencode-repo-agent-dispatch job-wait \
  --config ./repo-dispatch.config.json \
  --job-id <job-id> \
  --poll-interval-ms 1000 \
  --timeout-ms 60000

opencode-repo-agent-dispatch job-watch \
  --config ./repo-dispatch.config.json \
  --job-id <job-id> \
  --poll-interval-ms 1000 \
  --timeout-ms 15000

opencode-repo-agent-dispatch job-cancel \
  --config ./repo-dispatch.config.json \
  --job-id <job-id>
```

## Harness State

- persistent harness job state is stored under `~/.local/share/opencode-repo-agent-dispatch/`
- each job gets its own directory with `job.json` and `worker.log`
- the harness is designed for long-running multi-repo dispatch flows where one tool call should not have to do all orchestration inline

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
- Tag pushes like `v0.2.1` create a GitHub release.
- The release workflow uploads the packaged tarball to the GitHub release.
- npm publishing can be added later once registry credentials are configured.
