import 'dotenv/config';
import { search } from './rag/service.js';

const projectId = process.argv[2];
const query = process.argv.slice(3).join(' ');

if (!projectId || !query) {
  console.error('Usage: npx tsx src/server/rag-cli.ts <projectId> "<query>"');
  process.exit(1);
}

search(projectId, query)
  .then(results => {
    if (results.length === 0) {
      console.log('No relevant documents found.');
      return;
    }
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`[${i + 1}] From "${r.file_name}" (${(r.similarity * 100).toFixed(1)}% match):`);
      console.log(r.content);
      console.log();
    }
  })
  .catch(err => {
    console.error('Search failed:', err.message);
    process.exit(1);
  });
