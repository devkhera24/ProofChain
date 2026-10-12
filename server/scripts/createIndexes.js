import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import "../src/models/index.js"; // a barrel file that imports every model

await mongoose.connect(env.MONGODB_URI);

for (const model of Object.values(mongoose.models)) {
  await model.syncIndexes();
  console.log(`✔ indexes synced: ${model.modelName}`);
}

const passages = mongoose.connection.db.collection("passages");
try {
  const existing = await passages.listSearchIndexes().toArray();
  const current = existing.find((i) => i.name === env.VECTOR_INDEX_NAME);
  if (current) {
    console.log(`✔ vector index "${env.VECTOR_INDEX_NAME}" already exists (status: ${current.status})`);
  } else {
    await passages.createSearchIndex({
      name: env.VECTOR_INDEX_NAME,
      type: "vectorSearch",
      definition: {
        fields: [
          { type: "vector", path: "embedding", numDimensions: env.EMBED_DIM, similarity: "cosine" },
          { type: "filter", path: "projectId" },
          { type: "filter", path: "sourceId" },
        ],
      },
    });
    console.log(`✔ vector index "${env.VECTOR_INDEX_NAME}" requested — Atlas builds it in ~1 minute`);
  }
} catch (err) {
  process.exitCode = 1;
  if (err.codeName === "SearchNotEnabled") {
    console.error("✖ This MongoDB has no Atlas Search. Point MONGODB_URI at Atlas (local dev/tests use VECTOR_SEARCH_MODE=memory).");
  } else {
    console.error(`✖ Could not create the vector index: ${err.message}`);
    console.error("  Create it in the Atlas UI instead — see docs/deployment.md (Vector Search index).");
  }
}
await mongoose.disconnect();
