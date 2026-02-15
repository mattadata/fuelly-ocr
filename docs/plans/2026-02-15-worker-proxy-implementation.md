# Cloudflare Worker Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Cloudflare Worker to proxy Google Vision API requests, allowing users to use the Fuelly OCR app without providing their own API key.

**Architecture:** Cloudflare Worker receives base64 image data from the frontend, adds the Google Vision API key server-side, calls the Vision API, implements rate limiting via KV store, and returns OCR results to the app.

**Tech Stack:** Cloudflare Workers, Workers KV (rate limiting), Google Cloud Vision API, vanilla JavaScript frontend

---

## Task 1: Create Cloudflare Worker Project

**Files:**
- Create: `worker/wrangler.toml`
- Create: `worker/package.json`
- Create: `worker/src/index.js`

**Step 1: Create wrangler.toml configuration**

```toml
name = "fuelly-ocr-proxy"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
RATE_LIMIT_MAX = "100"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "YOUR_KV_NAMESPACE_ID"  # To be filled after deployment
```

**Step 2: Create package.json**

```json
{
  "name": "fuelly-ocr-proxy",
  "version": "1.0.0",
  "description": "Proxy for Google Vision API with rate limiting",
  "main": "src/index.js",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

**Step 3: Create basic Worker skeleton**

```javascript
// worker/src/index.js
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { image } = await request.json();

      if (!image) {
        return new Response(JSON.stringify({ error: 'Missing image data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // TODO: Implement rate limiting
      // TODO: Call Google Vision API
      // TODO: Return results

      return new Response(JSON.stringify({ text: '', lines: [] }), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
```

**Step 4: Commit**

```bash
git add worker/
git commit -m "feat: add Cloudflare Worker project skeleton"
```

---

## Task 2: Implement Rate Limiting

**Files:**
- Create: `worker/src/rate-limit.js`
- Modify: `worker/src/index.js`

**Step 1: Create rate limiting module**

```javascript
// worker/src/rate-limit.js

/**
 * Check if request is within rate limit
 * @param {string} ip - Client IP address
 * @param {object} env - Worker environment (contains KV binding)
 * @returns {Promise<{allowed: boolean, retryAfter?: number}>}
 */
export async function checkRateLimit(ip, env) {
  const MAX_REQUESTS = parseInt(env.RATE_LIMIT_MAX || '100');
  const now = Math.floor(Date.now() / 1000);
  const dayStart = Math.floor(now / 86400) * 86400;

  const key = `rate_limit:${ip}:${dayStart}`;

  // Get current count
  const record = await env.RATE_LIMIT.get(key, 'json');
  const count = record?.count || 0;

  if (count >= MAX_REQUESTS) {
    // Calculate seconds until reset
    const retryAfter = dayStart + 86400 - now;
    return { allowed: false, retryAfter };
  }

  // Increment count
  await env.RATE_LIMIT.put(key, JSON.stringify({ count: count + 1 }), {
    expirationTtl: 86400,
  });

  return { allowed: true };
}
```

**Step 2: Integrate rate limiting into main Worker**

Update the fetch handler in `worker/src/index.js`:

```javascript
import { checkRateLimit } from './rate-limit.js';

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get client IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Check rate limit
    const rateLimit = await checkRateLimit(ip, env);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Retry-After': rateLimit.retryAfter.toString(),
          },
        }
      );
    }

    try {
      const { image } = await request.json();

      if (!image) {
        return new Response(JSON.stringify({ error: 'Missing image data' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // TODO: Call Google Vision API
      return new Response(JSON.stringify({ text: '', lines: [] }), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
```

**Step 3: Commit**

```bash
git add worker/src/
git commit -m "feat: add KV-based rate limiting to Worker"
```

---

## Task 3: Implement Google Vision API Call

**Files:**
- Modify: `worker/src/index.js`

**Step 1: Add Vision API function**

```javascript
// Add this function to worker/src/index.js (before the export default)

/**
 * Call Google Cloud Vision API
 * @param {string} base64Image - Base64 encoded image data (with or without data URL prefix)
 * @param {string} apiKey - Google Vision API key
 * @returns {Promise<{text: string, lines: array}>}
 */
async function callVisionAPI(base64Image, apiKey) {
  // Extract base64 data if data URL prefix is present
  const base64Data = base64Image.includes(',')
    ? base64Image.split(',')[1]
    : base64Image;

  const requestBody = {
    requests: [{
      image: { content: base64Data },
      features: [{ type: 'TEXT_DETECTION', maxResults: 10 }]
    }]
  };

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Vision API request failed');
  }

  const data = await response.json();
  const annotations = data.responses[0]?.textAnnotations;

  if (!annotations || annotations.length === 0) {
    return { text: '', lines: [] };
  }

  // First annotation is full text, rest are individual words/lines
  const fullText = annotations[0].description || '';

  // Build lines array
  const lines = [];
  for (let i = 1; i < annotations.length; i++) {
    const annotation = annotations[i];
    lines.push({
      text: annotation.description,
      confidence: annotation.confidence || 85
    });
  }

  return { text: fullText, lines };
}
```

**Step 2: Update fetch handler to call Vision API**

Replace the TODO section in `worker/src/index.js`:

```javascript
      // Call Google Vision API
      const apiKey = env.GOOGLE_VISION_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'API key not configured' }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      const ocrResult = await callVisionAPI(image, apiKey);

      return new Response(JSON.stringify(ocrResult), {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });
```

**Step 3: Commit**

```bash
git add worker/src/index.js
git commit -m "feat: add Google Vision API integration"
```

---

## Task 4: Update Frontend to Use Worker

**Files:**
- Create: `config.local.js` (gitignored)
- Modify: `ocr.js`
- Modify: `index.html`
- Modify: `.gitignore`

**Step 1: Create config.local.js template**

```javascript
// config.local.js - Your local configuration (not committed to git)

const CONFIG = {
  // Cloudflare Worker URL (after deployment)
  workerUrl: 'https://fuelly-ocr-proxy.YOUR-SUBDOMAIN.workers.dev',

  // Set to true to use Worker proxy, false for direct API key (development)
  useWorker: true,

  // Optional: Your own API key for local testing (not used when useWorker=true)
  googleVisionApiKey: 'YOUR_KEY_HERE'
};
```

**Step 2: Update .gitignore**

```gitignore
# config.js contains your API key - never commit it
config.local.js
config.js
```

**Step 3: Modify ocr.js to support Worker mode**

Add new function in `ocr.js` (after `extractWithTesseract` function):

```javascript
  /**
   * Extract text using Worker proxy
   */
  async function extractWithWorker(imageData) {
    debugLog('Using Worker proxy for OCR');
    updateProgress('Processing via Worker...');

    const workerUrl = (typeof CONFIG !== 'undefined' && CONFIG.workerUrl) ||
                      localStorage.getItem('fuelly_worker_url');

    if (!workerUrl) {
      throw new Error('Worker URL not configured. Add it to config.local.js');
    }

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageData })
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Worker request failed');
    }

    const result = await response.json();
    debugLog('Worker OCR result:', result.text);

    return {
      text: result.text,
      confidence: 85,
      lines: result.lines || []
    };
  }
```

**Step 4: Update extractText function to use Worker**

Modify the `extractText` function in `ocr.js`:

```javascript
  async function extractText(imageData, useVisionAPI = false) {
    // Check if Worker mode is enabled
    const useWorker = (typeof CONFIG !== 'undefined' && CONFIG.useWorker) ||
                      localStorage.getItem('fuelly_use_worker') === 'true';

    if (useWorker) {
      return await extractWithWorker(imageData);
    }

    if (useVisionAPI) {
      return await extractWithVisionAPI(imageData);
    }

    // Use Tesseract for odometer
    return await extractWithTesseract(imageData);
  }
```

**Step 5: Update index.html to load config**

Update the script section in `index.html`:

```html
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
  <script src="config.local.js"></script>
  <script src="ocr.js"></script>
  <script src="app.js"></script>
```

**Step 6: Commit**

```bash
git add config.local.js ocr.js index.html .gitignore
git commit -m "feat: add Worker proxy mode to frontend"
```

---

## Task 5: Create Test Infrastructure

**Files:**
- Create: `tests/runner.js`
- Create: `tests/test-worker.js`
- Create: `tests/images/.gitkeep`

**Step 1: Create test runner**

```javascript
// tests/runner.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_DIR = path.join(__dirname, 'images');

/**
 * Parse expected values from filename
 * Examples:
 *   pump_9.811_gallons_35.51_total.jpg
 *   odometer_168237_miles.jpg
 */
function parseFilename(filename) {
  const name = path.basename(filename, path.extname(filename));
  const parts = name.split('_');

  const result = { filename };

  if (parts[0] === 'pump') {
    result.type = 'pump';
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'gallons' && i + 1 < parts.length) {
        result.gallons = parseFloat(parts[i + 1]);
      } else if (parts[i] === 'total' && i + 1 < parts.length) {
        result.total = parseFloat(parts[i + 1]);
      }
    }
  } else if (parts[0] === 'odometer') {
    result.type = 'odometer';
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'miles' && i + 1 < parts.length) {
        result.miles = parseInt(parts[i + 1]);
      }
    }
  }

  return result;
}

/**
 * Load test images from directory
 */
function loadTestImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('No test images directory found.');
    return [];
  }

  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png|heic)$/i.test(f));

  return files.map(parseFilename);
}

/**
 * Convert file to base64 data URL
 */
function fileToBase64(filepath) {
  const buffer = fs.readFileSync(filepath);
  const ext = path.extname(filepath).slice(1);
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Parse pump data from OCR text
 */
function parsePumpData(text) {
  // Match 3-decimal number for gallons
  const gallonsMatch = text.match(/\b(\d{1,2}\.\d{3})\b/);
  const gallons = gallonsMatch ? parseFloat(gallonsMatch[1]) : null;

  // Match 2-decimal number for total ($10-$500 range)
  const totalPattern = /\$?\s*(\d{1,3}\.\d{2})\b/g;
  let total = null;
  let match;
  while ((match = totalPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (value >= 10 && value <= 500) {
      total = value;
      break;
    }
  }

  return { gallons, total };
}

/**
 * Parse odometer data from OCR text
 */
function parseOdometerData(text) {
  // Match 5-6 digit number
  const matches = text.match(/\b(\d{5,6})\b/g);
  if (!matches) return { miles: null };

  // Return the highest number (odometer)
  const miles = Math.max(...matches.map(m => parseInt(m)));
  return { miles };
}

/**
 * Run tests
 */
async function runTests(workerUrl) {
  const tests = loadTestImages();

  if (tests.length === 0) {
    console.log('No tests to run. Add images to tests/images/');
    return;
  }

  console.log(`Running ${tests.length} tests...\n`);

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const filepath = path.join(IMAGES_DIR, test.filename);
    const imageData = fileToBase64(filepath);

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const text = result.text || '';

      console.log(`\n${test.filename}`);

      if (test.type === 'pump') {
        const { gallons, total } = parsePumpData(text);

        const gallonsMatch = test.gallons && gallons && Math.abs(gallons - test.gallons) < 0.01;
        const totalMatch = test.total && total && Math.abs(total - test.total) < 0.1;

        if (test.gallons) {
          console.log(`  - Gallons: ${gallons ?? 'NOT FOUND'} (expected ${test.gallons}) ${gallonsMatch ? '✓' : '✗'}`);
        }
        if (test.total) {
          console.log(`  - Total: ${total ?? 'NOT FOUND'} (expected ${test.total}) ${totalMatch ? '✓' : '✗'}`);
        }

        if (gallonsMatch && totalMatch) {
          console.log('  ✓ PASS');
          passed++;
        } else {
          console.log('  ✗ FAIL');
          failed++;
        }

      } else if (test.type === 'odometer') {
        const { miles } = parseOdometerData(text);
        const milesMatch = test.miles && miles && miles === test.miles;

        if (test.miles) {
          console.log(`  - Miles: ${miles ?? 'NOT FOUND'} (expected ${test.miles}) ${milesMatch ? '✓' : '✗'}`);
        }

        if (milesMatch) {
          console.log('  ✓ PASS');
          passed++;
        } else {
          console.log('  ✗ FAIL');
          failed++;
        }
      }

    } catch (error) {
      console.log(`\n${test.filename}`);
      console.log(`  ✗ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`${passed}/${tests.length} tests passed`);
  if (failed > 0) {
    console.log(`${failed} tests failed`);
    process.exit(1);
  }
}

// Get worker URL from argument or env
const workerUrl = process.argv[2] || process.env.FUELLY_WORKER_URL;

if (!workerUrl) {
  console.error('Please provide Worker URL:');
  console.error('  node tests/runner.js https://your-worker.workers.dev');
  process.exit(1);
}

runTests(workerUrl).catch(console.error);
```

**Step 2: Create .gitkeep for images directory**

```bash
# tests/images/.gitkeep - keeps empty directory in git
```

**Step 3: Create Worker test script**

```javascript
// tests/test-worker.js
import { runTests } from './runner.js';

const workerUrl = process.env.FUELLY_WORKER_URL ||
                   'https://fuelly-ocr-proxy.workers.dev';

console.log(`Testing Worker: ${workerUrl}\n`);
await runTests(workerUrl);
```

**Step 4: Update package.json**

Add to `worker/package.json`:

```json
{
  "scripts": {
    "test": "node ../tests/test-worker.js"
  }
}
```

**Step 5: Commit**

```bash
git add tests/
git commit -m "feat: add test infrastructure with filename-based expectations"
```

---

## Task 6: Deployment Setup

**Files:**
- Create: `worker/.env.example`
- Modify: `README.md`

**Step 1: Create .env.example**

```bash
# Google Cloud Vision API Key
# Get yours from: https://console.cloud.google.com/apis/credentials
GOOGLE_VISION_API_KEY=your-api-key-here

# Rate limit: requests per day per IP
RATE_LIMIT_MAX=100
```

**Step 2: Update README.md**

Add deployment section to `README.md`:

```markdown
## Deployment

### Cloudflare Worker Setup

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Create KV namespace:
   ```bash
   cd worker
   wrangler kv:namespace create "RATE_LIMIT"
   ```

4. Update `wrangler.toml` with the returned KV namespace ID

5. Set environment variables in Cloudflare dashboard:
   - Go to Workers > fuelly-ocr-proxy > Settings > Variables
   - Add: `GOOGLE_VISION_API_KEY = your-key-here`

6. Deploy:
   ```bash
   cd worker
   npm install
   wrangler deploy
   ```

7. Update `config.local.js` with your Worker URL
```

**Step 3: Commit**

```bash
git add worker/.env.example README.md
git commit -m "docs: add deployment instructions"
```

---

## Task 7: Final Integration and Testing

**Files:**
- Modify: `app.js`
- Test: Manual testing

**Step 1: Remove API key prompt from ocr.js**

Since we now use Worker proxy, the prompt is no longer needed. Update `extractWithVisionAPI` to only be used for local development:

```javascript
// In ocr.js, extractWithVisionAPI function - remove the prompt fallback:
async function extractWithVisionAPI(imageData) {
  let key = getApiKey();

  // No prompt - require config file
  if (!key) {
    throw new Error('Google Cloud Vision API key not configured. Add it to config.local.js or use Worker mode.');
  }
  // ... rest of function
}
```

**Step 2: Test locally**

```bash
# Start local server
python3 -m http.server 8080

# Open browser to http://localhost:8080
# Upload test photos and verify extraction works
```

**Step 3: Deploy Worker**

```bash
cd worker
wrangler deploy
```

**Step 4: Update config.local.js with deployed Worker URL**

```javascript
const CONFIG = {
  workerUrl: 'https://fuelly-ocr-proxy.YOUR-SUBDOMAIN.workers.dev',
  useWorker: true,
};
```

**Step 5: Test end-to-end on deployed site**

1. Open GitHub Pages URL
2. Upload test photos
3. Verify extraction works
4. Send SMS and confirm data is correct

**Step 6: Commit**

```bash
git add ocr.js config.local.js
git commit -m "feat: remove API key prompt, Worker proxy is primary mode"
```

---

## Summary

After completing all tasks:
- Cloudflare Worker proxies Vision API requests with rate limiting
- Frontend uses Worker by default (no user API key needed)
- Test suite validates OCR accuracy with real photos
- Deployed on GitHub Pages (frontend) + Cloudflare Workers (backend)
- All within free tiers
