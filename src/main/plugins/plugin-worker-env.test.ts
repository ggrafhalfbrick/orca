import { describe, expect, it } from 'vitest'
import { buildPluginWorkerEnv } from './plugin-worker-env'

describe('buildPluginWorkerEnv', () => {
  it('matches allowlisted keys case-sensitively on POSIX', () => {
    expect(
      buildPluginWorkerEnv(
        { PATH: '/safe', path: '/wrong', HOME: '/home', NODE_OPTIONS: '--inspect' },
        'linux'
      )
    ).toEqual({ PATH: '/safe', HOME: '/home', ELECTRON_RUN_AS_NODE: '1' })
  })

  it('passes the desktop session so worker commands can start desktop apps', () => {
    expect(
      buildPluginWorkerEnv(
        { DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000', GITHUB_TOKEN: 'secret' },
        'linux'
      )
    ).toEqual({ DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000', ELECTRON_RUN_AS_NODE: '1' })
    expect(
      buildPluginWorkerEnv(
        {
          AppData: 'C:\\Users\\me\\AppData\\Roaming',
          'ProgramFiles(x86)': 'C:\\PF86',
          AWS_SECRET_ACCESS_KEY: 'x'
        },
        'win32'
      )
    ).toEqual({
      APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
      'PROGRAMFILES(X86)': 'C:\\PF86',
      ELECTRON_RUN_AS_NODE: '1'
    })
  })

  it('matches Windows environment keys case-insensitively', () => {
    expect(buildPluginWorkerEnv({ Path: 'C:\\safe', systemroot: 'C:\\Windows' }, 'win32')).toEqual({
      PATH: 'C:\\safe',
      SystemRoot: 'C:\\Windows',
      ELECTRON_RUN_AS_NODE: '1'
    })
  })
})
