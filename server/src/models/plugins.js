/** Shared toJSON: `id` instead of `_id`, no `__v`, never vectors. `hide` lists extra fields to strip. */
export function toJSONPlugin(schema, { hide = [] } = {}) {
  schema.set("toJSON", {
    virtuals: true,
    transform: (_d, ret) => {
      ret.id = ret._id?.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.embedding; // never send vectors to the client
      for (const field of hide) delete ret[field];
      return ret;
    },
  });
}
