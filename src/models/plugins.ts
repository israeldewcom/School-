import { Schema } from 'mongoose';

// Applied globally via mongoose.plugin() in src/bootstrap.ts.
//
// Every document serialized to JSON now exposes `id` (from `_id`) so the
// frontend can call `.id` on any object without worrying about which model
// it came from. Also strips sensitive fields from every response.
export const toJSONPlugin = (schema: Schema) => {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: any) => {
      ret.id = ret._id ? ret._id.toString() : undefined;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.refreshTokens;
      return ret;
    },
  });

  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: any) => {
      ret.id = ret._id ? ret._id.toString() : undefined;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      delete ret.refreshTokens;
      return ret;
    },
  });
};
