import path from "node:path"

export function resolveBaseDirectory(options = {}, workingDirectory = process.cwd()) {
  if (!options.baseDirectory) return workingDirectory
  return path.resolve(workingDirectory, options.baseDirectory)
}

export function normalizeRepoRegistry(options = {}, workingDirectory = process.cwd()) {
  const baseDirectory = resolveBaseDirectory(options, workingDirectory)
  const repos = options.repos ?? {}

  return Object.entries(repos).reduce((acc, [repoKey, repo]) => {
    if (!repo?.path) {
      throw new Error(`Repository '${repoKey}' is missing a path`)
    }

    acc[repoKey] = {
      key: repoKey,
      path: path.resolve(baseDirectory, repo.path),
      defaultAgent: repo.defaultAgent ?? null,
      agents: repo.agents ?? null,
    }
    return acc
  }, {})
}

export function getRepoDefinition(options, repoKey, workingDirectory = process.cwd()) {
  const registry = normalizeRepoRegistry(options, workingDirectory)
  const repo = registry[repoKey]
  if (!repo) {
    throw new Error(`Unknown repo: ${repoKey}`)
  }
  return repo
}
