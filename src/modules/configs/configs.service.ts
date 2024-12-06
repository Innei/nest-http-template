import {
  BadRequestException,
  Injectable,
  Logger,
  ValidationPipe,
} from '@nestjs/common'
import { ReturnModelType } from '@typegoose/typegoose'
import { ClassConstructor, plainToInstance } from 'class-transformer'

import { validateSync, ValidatorOptions } from 'class-validator'
import { cloneDeep, mergeWith } from 'es-toolkit/compat'

import { RedisKeys } from '~/constants/cache.constant'
import { CacheService } from '~/processors/cache/cache.service'
import { InjectModel } from '~/transformers/model.transformer'
import { getRedisKey } from '~/utils/redis.util'
import { camelcaseKeys, sleep } from '~/utils/tool.utils'

import * as optionDtos from '../configs/configs.dto'
import { UserService } from '../user/user.service'
import { generateDefaultConfig } from './configs.default'
import { IConfig, IConfigKeys } from './configs.interface'
import { ConfigModel } from './configs.model'

const allOptionKeys: Set<IConfigKeys> = new Set()
const map: Record<string, any> = Object.entries(optionDtos).reduce(
  (obj, [key, value]) => {
    const optionKey = (key.charAt(0).toLowerCase() +
      key.slice(1).replace(/Dto$/, '')) as IConfigKeys
    allOptionKeys.add(optionKey)
    return {
      ...obj,
      [String(optionKey)]: value,
    }
  },
  {},
)

/*
 * NOTE:
 * 1. 读配置在 Redis 中，getConfig 为收口，获取配置都从 Redis 拿，初始化之后入到 Redis，
 * 2. 对于加密的字段，在 Redis 的缓存中应该也是加密的。
 * 3. 何时解密，在 Node 中消费时，即 getConfig 时统一解密。
 */
@Injectable()
export class ConfigsService {
  private logger: Logger
  constructor(
    @InjectModel(ConfigModel)
    private readonly optionModel: ReturnModelType<typeof ConfigModel>,
    private readonly userService: UserService,
    private readonly redis: CacheService,
  ) {
    this.configInit().then(() => {
      this.logger.log('Config 已经加载完毕！')
    })

    this.logger = new Logger(ConfigsService.name)
  }
  private configInitd = false

  private async setConfig(config: IConfig) {
    const redis = this.redis.getClient()
    await redis.set(getRedisKey(RedisKeys.ConfigCache), JSON.stringify(config))
  }

  public async waitForConfigReady() {
    if (this.configInitd) {
      return await this.getConfig()
    }

    const maxCount = 10
    let curCount = 0
    do {
      if (this.configInitd) {
        return await this.getConfig()
      }
      await sleep(100)
      curCount += 1
    } while (curCount < maxCount)

    throw `重试 ${curCount} 次获取配置失败, 请检查数据库连接`
  }

  public get defaultConfig() {
    return generateDefaultConfig()
  }

  protected async configInit() {
    const configs = await this.optionModel.find().lean()
    const mergedConfig = generateDefaultConfig()
    configs.forEach((field) => {
      const name = field.name as keyof IConfig

      if (!allOptionKeys.has(name)) {
        return
      }

      const value = field.value
      mergedConfig[name] = { ...mergedConfig[name], ...value }
    })

    await this.setConfig(mergedConfig)
    this.configInitd = true
  }

  public get<T extends keyof IConfig>(key: T): Promise<Readonly<IConfig[T]>> {
    return new Promise((resolve, reject) => {
      this.waitForConfigReady()
        .then((config) => {
          resolve(config[key])
        })
        .catch(reject)
    })
  }

  // Config 在此收口
  public async getConfig(): Promise<Readonly<IConfig>> {
    const redis = this.redis.getClient()
    const configCache = await redis.get(getRedisKey(RedisKeys.ConfigCache))

    if (configCache) {
      try {
        const instanceConfigsValue = plainToInstance<IConfig, any>(
          IConfig as any,
          JSON.parse(configCache) as any,
        ) as any as IConfig

        return instanceConfigsValue
      } catch {
        await this.configInit()
        return await this.getConfig()
      }
    } else {
      await this.configInit()

      return await this.getConfig()
    }
  }

  private async patch<T extends keyof IConfig>(
    key: T,
    data: Partial<IConfig[T]>,
  ): Promise<IConfig[T]> {
    const config = await this.getConfig()
    const updatedConfigRow = await this.optionModel
      .findOneAndUpdate(
        { name: key as string },
        {
          value: mergeWith(cloneDeep(config[key]), data, (old, newer) => {
            // 数组不合并
            if (Array.isArray(old)) {
              return newer
            }
            // 对象合并
            if (typeof old === 'object' && typeof newer === 'object') {
              return { ...old, ...newer }
            }
          }),
        },
        { upsert: true, new: true },
      )
      .lean()
    const newData = updatedConfigRow.value
    const mergedFullConfig = Object.assign({}, config, { [key]: newData })

    await this.setConfig(mergedFullConfig)

    return newData
  }

  private validateOptions: ValidatorOptions = {
    whitelist: true,
    forbidNonWhitelisted: true,
  }
  private validate = new ValidationPipe(this.validateOptions)

  async patchAndValid<T extends keyof IConfig>(
    key: T,
    value: Partial<IConfig[T]>,
  ) {
    value = camelcaseKeys(value) as any

    const dto = map[key]
    if (!dto) {
      throw new BadRequestException('设置不存在')
    }
    const instanceValue = this.validWithDto(dto, value)

    switch (key) {
      default: {
        return this.patch(key, instanceValue)
      }
    }
  }

  private validWithDto<T extends object>(dto: ClassConstructor<T>, value: any) {
    const validModel = plainToInstance(dto, value)
    const errors = Array.isArray(validModel)
      ? (validModel as Array<any>).reduce(
          (acc, item) => acc.concat(validateSync(item, this.validateOptions)),
          [],
        )
      : validateSync(validModel, this.validateOptions)
    if (errors.length > 0) {
      const error = this.validate.createExceptionFactory()(errors as any[])
      throw error
    }
    return validModel
  }
}
