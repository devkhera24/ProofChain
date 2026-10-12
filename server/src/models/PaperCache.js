import mongoose from "mongoose";
import { toJSONPlugin } from "./plugins.js";

const { Schema } = mongoose;

// Caches scholarly API responses (TTL)
const cacheSchema = new Schema({
  _id: String, // provider:sha1(url)
  payload: Schema.Types.Mixed,
  expiresAt: { type: Date, index: { expires: 0 } },
});
cacheSchema.plugin(toJSONPlugin);

export const PaperCache = mongoose.model("PaperCache", cacheSchema);
