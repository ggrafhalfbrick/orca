// Markdown Vault: notes in a folder of an Orca project as a Tasks source. Runs in Orca's plugin worker.
import { createVaultSource } from './src/vault-source.mjs'

export default function activate(orca) {
  const source = createVaultSource({
    host: (method, params) => orca.host.call(method, params),
    log: (message) => orca.log(message)
  })
  orca.tasks.registerSource('notes', {
    list: (params) => source.list(params),
    get: (params) => source.get(params)
  })
}
