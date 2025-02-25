import { cp, rm, writeFile } from 'node:fs/promises'
import { format, join, parse, relative } from 'node:path'
import process from 'node:process'
import { consola } from 'consola'
import { cyan, green } from 'picocolors'
import { glob } from 'tinyglobby'
import { name, version } from '../package.json'
import { getHash } from './utils'

export const RE_HASHED_FILENAME = /([.-])(\w{8})\.(\w+)$/

export interface CliOptions {
  assetsDir: string
  extensions: Array<string>
  suffix: string
}

export async function generate(options: CliOptions) {
  const { assetsDir, extensions, suffix } = options
  const extensionPattern = `{${extensions.join(',')}}`
  const assetFiles = await glob(
    `${assetsDir}/${extensionPattern}/**/*.${extensionPattern}`,
  )

  let hashedFiles = 0
  const manifest = Object.create(null)

  for (const ext of extensions) {
    const dirPath = `${assetsDir}/${ext}-${suffix}`
    try {
      await rm(dirPath, { recursive: true })
      consola.info(`Deleted: ${cyan(dirPath)}`)
    }
    catch {
      consola.info(`Skipping: ${cyan(dirPath)} - does not exist`)
    }
  }

  for (const path of assetFiles) {
    const parsedPath = parse(path)
    const key = relativeToAssetsDir(path)

    const extension = extensions.find(ext => parsedPath.dir.includes(`/${ext}`))
    const hashDir = extension ? parsedPath.dir.replace(`/${extension}`, `/${extension}-${suffix}`) : parsedPath.dir

    // Make sure file hasn't been hashed already
    if (RE_HASHED_FILENAME.test(parsedPath.base)) {
      consola.info(
        `skipping ${cyan(
          relative(assetsDir, path),
        )}, seems to be hashed already`,
      )

      continue
    }

    const hash = await getHash(path)
    const newFilePath = format({
      ...parsedPath,
      base: undefined,
      dir: hashDir,
      ext: `.${hash}${parsedPath.ext}`,
    })

    await cp(path, newFilePath)

    manifest[key] = relativeToAssetsDir(newFilePath)
    hashedFiles++
  }

  if (hashedFiles > 0) {
    await writeFile(
      join(assetsDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    )
  }

  consola.success(
    `${hashedFiles} asset files hashed in ${cyan(
      relative(process.cwd(), assetsDir),
    )}\n`,
  )
}

export async function build(options: CliOptions) {
  consola.log(green(`${name} v${version}`))
  consola.start('hashing build assets...')
  consola.info(
    `included file extensions: ${options.extensions
      .map(i => cyan(i))
      .join(', ')}`,
  )

  await generate(options)
}

function relativeToAssetsDir(path: string) {
  return path.substring(path.lastIndexOf('assets/'))
}
