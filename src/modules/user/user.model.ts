import {
  DocumentType,
  modelOptions,
  mongoose,
  prop,
  Severity,
} from '@typegoose/typegoose'

import { hashSync } from 'bcryptjs'

import { BaseModel } from '~/shared/model/base.model'

export type UserDocument = DocumentType<UserModel>

export class OAuthModel {
  @prop()
  platform: string
  @prop()
  id: string
}

export class TokenModel {
  @prop()
  created: Date

  @prop()
  token: string

  @prop()
  expired?: Date

  @prop({ unique: true })
  name: string
}

@modelOptions({ options: { customName: 'User', allowMixed: Severity.ALLOW } })
export class UserModel extends BaseModel {
  @prop({ required: true, unique: true, trim: true })
  username!: string

  @prop({ trim: true })
  name!: string

  @prop()
  introduce?: string

  @prop()
  avatar?: string

  @prop({
    select: false,
    get(val) {
      return val
    },
    set(val) {
      return hashSync(val, 6)
    },
    required: true,
  })
  password!: string

  @prop()
  mail?: string

  @prop()
  url?: string

  @prop()
  lastLoginTime?: Date

  @prop({ select: false })
  lastLoginIp?: string

  @prop({ type: mongoose.Schema.Types.Mixed })
  socialIds?: any

  @prop({ select: false, required: true })
  authCode!: string

  @prop({ type: TokenModel, select: false })
  apiToken?: TokenModel[]

  @prop({ type: OAuthModel, select: false })
  oauth2?: OAuthModel[]
}
