import { createClient } from 'redis'
import { REDIS_PREFIX, RECONNECT_GRACE_MS } from '../../../shared/src/index.ts'

export type RedisClient = ReturnType<typeof createClient>

export async function connectRedis(): Promise<RedisClient> {
  const url = Bun.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
  const client = createClient({ url })
  client.on('error', (err: unknown) => console.error('[redis] client error', err))
  await client.connect()
  console.log('[redis] connected')
  return client
}

const P = REDIS_PREFIX

export const redisKeys = {
  room: (roomCode: string) => `${P}room:${roomCode}`,
  participants: (roomCode: string) => `${P}room:${roomCode}:participants`,
  joinOrder: (roomCode: string) => `${P}room:${roomCode}:join-order`,
  state: (roomCode: string) => `${P}room:${roomCode}:state`,
  displayName: (roomCode: string, displayName: string) =>
    `${P}room:${roomCode}:display:${displayName.toLowerCase()}`,
  session: (sessionId: string) => `${P}session:${sessionId}`
}

export const GRACE_TTL_SECONDS = Math.ceil(RECONNECT_GRACE_MS / 1000)

// RESP2 returns strings, but TS types include Buffer union. These helpers coerce to clean types.
export async function hashGetAll(redis: RedisClient, key: string): Promise<Record<string, string>> {
  return (await redis.hGetAll(key)) as unknown as Record<string, string>
}

export async function hashGet(redis: RedisClient, key: string, field: string): Promise<string | undefined> {
  return (await redis.hGet(key, field)) as string | undefined
}

export async function hashKeys(redis: RedisClient, key: string): Promise<string[]> {
  return (await redis.hKeys(key)) as string[]
}

export async function sortedRange(redis: RedisClient, key: string, min: number, max: number): Promise<string[]> {
  return (await redis.zRange(key, min, max)) as string[]
}

export async function stringGet(redis: RedisClient, key: string): Promise<string | null> {
  return (await redis.get(key)) as string | null
}
