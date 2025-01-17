import { dbHelper } from 'test/helper/db-mock.helper'

import { redisHelper } from 'test/helper/redis-mock.helper'

// @ts-nocheck
import { beforeAll } from 'vitest'

declare const global: any

beforeAll(async () => {
  global.isDev = true
  global.cwd = process.cwd()
})

afterAll(async () => {
  await dbHelper.clear()
  await dbHelper.close()
  await (await redisHelper).close()
})

beforeAll(async () => {
  await dbHelper.connect()
  await redisHelper
})

beforeEach(() => {
  global.isDev = true
  global.cwd = process.cwd()
})
