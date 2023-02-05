import { createE2EApp } from 'test/helper/create-e2e-app'
import { clearDynamicData } from 'test/utils'

import { PostController } from '~/modules/post/post.controller'
import { PostModel } from '~/modules/post/post.model'
import { PostService } from '~/modules/post/post.service'

describe('Test PostController E2E', () => {
  const proxy = createE2EApp({
    controllers: [PostController],
    providers: [PostService],
    models: [PostModel],
    async pourData(modelMap) {
      const { model } = modelMap.get(PostModel)
      await model.create([
        {
          title: 'test1',
          text: 'test1',
          slug: 'test1',
        },
        {
          title: 'test2',
          text: 'test2',
          slug: 'test2',
        },
      ])

      return async () => {
        await model.deleteMany({})
      }
    },
  })

  test('GET /posts', async () => {
    const app = proxy.app

    const res = await app.inject({
      method: 'GET',
      url: '/posts',
    })

    expect(res.statusCode).toBe(200)
    const result = res.json()
    clearDynamicData(result.data)
    expect(result).toMatchSnapshot()
  })
})
