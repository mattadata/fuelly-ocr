// tests/test-worker.js
import { runTests } from './runner.js';

const workerUrl = process.env.FUELLY_WORKER_URL ||
                   'https://fuelly-ocr-proxy.workers.dev';

console.log(`Testing Worker: ${workerUrl}\n`);
await runTests(workerUrl);
