import {
  ERROR_CODES,
  FILTER_MODES,
  isBuiltinVrcParam,
  isSupportedOscPath,
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  createDefaultRoomSettings,
  type ParamValue,
  type RoomSettings
} from '../../../shared/src/index.ts'
import { RoomManagerError } from './room-errors.ts'

export function mergeSettings(partialSettings?: Partial<RoomSettings>): RoomSettings {
  const defaults = createDefaultRoomSettings()
  const filterPaths = [...new Set((partialSettings?.filterPaths ?? defaults.filterPaths).map((entry) => entry.trim()))]
  const filterBlacklistPaths = [...new Set((partialSettings?.filterBlacklistPaths ?? defaults.filterBlacklistPaths).map((entry) => entry.trim()))]

  for (const path of [...filterPaths, ...filterBlacklistPaths]) {
    // Allow glob patterns (e.g. /avatar/parameters/Eye*) — only reject
    // paths that clearly don't target the /avatar namespace after stripping
    // leading glob characters.
    const literal = path.replace(/^[*?{[]+/, '')
    if (literal.length > 0 && !isSupportedOscPath(literal)) {
      throw new RoomManagerError(ERROR_CODES.invalidFilterPath, `Unsupported filter path: ${path}`)
    }
  }

  const filterMode = partialSettings?.filterMode ?? defaults.filterMode
  if (![FILTER_MODES.allowAll, FILTER_MODES.whitelist, FILTER_MODES.blacklist, FILTER_MODES.combined].includes(filterMode)) {
    throw new RoomManagerError(ERROR_CODES.invalidFilterMode, 'Invalid filter mode.')
  }

  return {
    autoOwnerEnabled: partialSettings?.autoOwnerEnabled ?? defaults.autoOwnerEnabled,
    instantOwnerTakeoverEnabled:
      partialSettings?.instantOwnerTakeoverEnabled ?? defaults.instantOwnerTakeoverEnabled,
    filterMode,
    filterPaths,
    filterBlacklistPaths
  }
}

export function normalizeParams(params: ParamValue[]): ParamValue[] {
  const latestByPath = new Map<string, ParamValue>()

  for (const param of params) {
    if (!isSupportedOscPath(param.path)) {
      throw new RoomManagerError(ERROR_CODES.invalidParamPath, `Unsupported OSC path: ${param.path}`)
    }

    if (isBuiltinVrcParam(param.path)) {
      continue
    }

    if (!isSupportedValueType(param)) {
      throw new RoomManagerError(ERROR_CODES.unsupportedParamType, `Unsupported param type: ${param.valueType}`)
    }

    latestByPath.set(param.path, { ...param })
  }

  return [...latestByPath.values()]
}

export function generateRoomCodeCandidate(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARSET.length)
    return ROOM_CODE_CHARSET[randomIndex]
  }).join('')
}

function isSupportedValueType(param: ParamValue): boolean {
  if (param.valueType === 'bool') {
    return typeof param.value === 'boolean'
  }

  if (param.valueType === 'int') {
    return typeof param.value === 'number' && Number.isInteger(param.value)
  }

  if (param.valueType === 'float') {
    return typeof param.value === 'number'
  }

  return false
}