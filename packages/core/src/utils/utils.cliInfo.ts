import { execSync } from 'child_process'

export const getGitRepoName = (): string =>
  execSync('basename `git rev-parse --show-toplevel`').toString().trim()
export const getGitBranchName = (): string =>
  execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim()
export const getGitShort = (): string => execSync(`git rev-parse --short HEAD`).toString().trim()
export const getServiceName = (): string =>
  execSync(`npm run env | grep "npm_package_name"`).toString().trim().split('=')[1]

const stageFlags = ['prod', 'rc', 'dev'] as const
type StageFlag = typeof stageFlags[number]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isStageFlag = (x: any): x is StageFlag => stageFlags.includes(x)

export const getStackName = (stage: string): string => `${getServiceName()}-${stage}`

export const getStageFlag = (stage: string): StageFlag => {
  const splitStage = stage.split('-')[0]
  const stageFlag = isStageFlag(splitStage) ? splitStage : 'dev'
  return stageFlag
}
