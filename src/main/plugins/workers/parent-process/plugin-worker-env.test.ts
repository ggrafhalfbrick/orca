import { describe, expect, it } from 'vitest'
import { buildPluginWorkerEnv } from './plugin-worker-env'

describe('buildPluginWorkerEnv', () => {
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
          ALLUSERSPROFILE: 'C:\\ProgramData',
          PUBLIC: 'C:\\Users\\Public',
          CommonProgramFiles: 'C:\\PF\\Common Files',
          OS: 'Windows_NT',
          AWS_SECRET_ACCESS_KEY: 'x'
        },
        'win32'
      )
    ).toEqual({
      APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
      ALLUSERSPROFILE: 'C:\\ProgramData',
      PUBLIC: 'C:\\Users\\Public',
      'PROGRAMFILES(X86)': 'C:\\PF86',
      COMMONPROGRAMFILES: 'C:\\PF\\Common Files',
      OS: 'Windows_NT',
      ELECTRON_RUN_AS_NODE: '1'
    })
  })
})
