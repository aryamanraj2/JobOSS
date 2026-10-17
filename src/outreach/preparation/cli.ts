import { Options } from './contracts.js'
import { validateRequest, type PreparationRequest } from './run.js'
/** Pure/import-safe parsing. No environment, DB, policy or model construction. */
export function parsePreparationArgs(args: string[]): PreparationRequest & { statusOnly?: boolean } {
  const values: Record<string,string> = {}; const flags = new Set<string>()
  const names = new Set(['limit','discovery-limit','discovery-passes','primary-pages','provider','campaign','run-id'])
  for (let i=0;i<args.length;i++) {
    const name = args[i]!.replace(/^--/,'')
    if (!args[i]!.startsWith('--') || values[name] || flags.has(name)) throw new Error('Invalid or repeated preparation option')
    if (['resume','status','upgrade-existing'].includes(name)) flags.add(name)
    else if (names.has(name) && args[i+1] && !args[i+1]!.startsWith('--')) values[name] = args[++i]!
    else throw new Error(`Unknown or missing preparation option: ${name}`)
  }
  const options = { ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
    ...(values['discovery-limit'] === undefined ? {} : { discoveryLimit: Number(values['discovery-limit']) }),
    ...(values['discovery-passes'] === undefined ? {} : { discoveryPasses: Number(values['discovery-passes']) }),
    ...(values['primary-pages'] === undefined ? {} : { primaryPages: Number(values['primary-pages']) }),
    ...(values.provider === undefined ? {} : { provider: values.provider as 'codex'|'claude'|'manual' }),
    ...(values.campaign === undefined ? {} : { campaignCycle: values.campaign }), ...(flags.has('upgrade-existing') ? { upgradeExisting: true } : {}) }
  const resume = flags.has('resume'), statusOnly = flags.has('status')
  if (statusOnly && (!values['run-id'] || resume || Object.keys(options).length)) throw new Error('Status requires only --status --run-id')
  if (!statusOnly) { if (resume) Options.partial().parse(options); validateRequest({ ...(values['run-id'] ? { runId: values['run-id'] } : {}), resume, options }) }
  else if (!/^[A-Za-z0-9_-]{1,90}$/.test(values['run-id']!)) throw new Error('Invalid run-id')
  return { ...(values['run-id'] ? { runId: values['run-id'] } : {}), resume, options, statusOnly }
}
