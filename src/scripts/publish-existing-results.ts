// src/scripts/publish-existing-results.ts
// One-off migration: results created before the `published` flag existed
// are marked as published so parents and students keep seeing them.
//
// Run once:  npx ts-node src/scripts/publish-existing-results.ts
import mongoose from 'mongoose';
import { env } from '../config/env';
import { Result } from '../models/Result';

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  const res = await Result.updateMany(
    { published: { $exists: false } },
    { $set: { published: true, publishedAt: new Date() } }
  );

  console.log(`Matched ${res.matchedCount}, published ${res.modifiedCount} existing results.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
