import { execFile } from 'node:child_process'

const PS_TIMEOUT_MS = 10_000
const PS_MAX_OUTPUT_BYTES = 4 * 1024 * 1024

// Why: values are read raw so they expand against the environment being built, as Windows does.
const READ_SCRIPT = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$scopes = [ordered]@{
  machine = @('HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
  volatile = @('HKCU:\\Volatile Environment') + @(Get-ChildItem -LiteralPath 'HKCU:\\Volatile Environment' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSPath })
  user = @('HKCU:\\Environment')
}
$entries = foreach ($scope in $scopes.Keys) {
  foreach ($path in $scopes[$scope]) {
    $key = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
    if (-not $key) { continue }
    foreach ($name in $key.GetValueNames()) {
      if (-not $name) { continue }
      [pscustomobject]@{
        scope = $scope
        name = $name
        expand = $key.GetValueKind($name) -eq 'ExpandString'
        value = [string]$key.GetValue($name, '', 'DoNotExpandEnvironmentNames')
      }
    }
  }
}
ConvertTo-Json -Compress -InputObject @($entries)
`

/**
 * The machine, session and user variables Windows gives a newly signed-in desktop, in that order;
 * `[]` when they cannot be read.
 */
export function readRegistryEnvironment(env, run = execFile) {
  const systemRoot = lookup(env, 'SYSTEMROOT')
  const powershell = systemRoot
    ? `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell.exe'
  return new Promise((resolve) => {
    run(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', READ_SCRIPT],
      {
        env,
        encoding: 'utf8',
        timeout: PS_TIMEOUT_MS,
        maxBuffer: PS_MAX_OUTPUT_BYTES,
        windowsHide: true
      },
      (error, stdout) => resolve(error ? [] : parseEntries(stdout))
    )
  })
}

function parseEntries(stdout) {
  try {
    const parsed = JSON.parse(String(stdout).replace(/^﻿/, ''))
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.name === 'string' && typeof entry.value === 'string')
      : []
  } catch {
    return []
  }
}

function lookup(env, name) {
  const upper = name.toUpperCase()
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === upper)
  return key === undefined ? undefined : env[key]
}

// Why: Windows variable names are case-insensitive; a second casing would shadow the real one.
function setVariable(env, name, value) {
  const upper = name.toUpperCase()
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === upper) {
      delete env[key]
    }
  }
  env[name] = value
}

function expandVariables(value, env) {
  return value.replace(/%([^%]+)%/g, (match, name) => lookup(env, name) ?? match)
}

/**
 * Overlays registry variables the way Windows builds a signed-in user's environment: plain values
 * before expandable ones within each scope, and the user `Path` appended to the machine `Path`.
 */
export function applyRegistryEnvironment(env, entries) {
  for (const scope of ['machine', 'volatile', 'user']) {
    const inScope = entries.filter((entry) => entry.scope === scope)
    for (const expand of [false, true]) {
      for (const entry of inScope.filter((candidate) => Boolean(candidate.expand) === expand)) {
        let value = expand ? expandVariables(entry.value, env) : entry.value
        const existingPath = lookup(env, 'PATH')
        if (scope === 'user' && entry.name.toUpperCase() === 'PATH' && existingPath) {
          value = `${existingPath.replace(/;+$/, '')};${value}`
        }
        setVariable(env, entry.name, value)
      }
    }
  }
  return env
}
