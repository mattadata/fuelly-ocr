# Cloudflare Worker Proxy Design

## Overview

Add a Cloudflare Worker to proxy Google Vision API requests, allowing users to use the Fuelly OCR app without providing their own API key. The Worker holds the API key server-side and implements rate limiting to prevent abuse.

## Architecture

```
iPhone App → GitHub Pages (static HTML/JS)
              ↓
        Worker Proxy (adds API key, rate limits)
              ↓
        Google Vision API
              ↓
        Worker → Returns extracted text
              ↓
        iPhone → Parses and displays data
```

## Worker API

### Endpoint
`POST https://fuelly-ocr-proxy.workers.dev/ocr`

### Request
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

### Response
```json
{
  "text": "GALLONS\n9.811\nSALE $35.51",
  "lines": [
    {"text": "GALLONS", "confidence": 95},
    {"text": "9.811", "confidence": 90}
  ]
}
```

### Rate Limiting
- 100 requests per day per IP address
- Uses Cloudflare Workers KV store
- Returns `429 Too Many Requests` when exceeded
- Resets at midnight UTC

### Error Responses
- `400` — No image data provided
- `429` — Rate limit exceeded (includes `retry-after` header)
- `500` — Google Vision API failure

## Worker Implementation

### File Structure
```
worker/
├── wrangler.toml          # Cloudflare config
├── src/
│   ├── index.js           # Main handler
│   └── rate-limit.js      # KV rate limiting
└── package.json
```

### Core Logic
1. Check rate limit (KV store by client IP)
2. Validate request has image data
3. Extract base64 from data URL
4. Call Google Vision API with server-side API key
5. Return formatted results

### Environment Variables
- `GOOGLE_VISION_API_KEY` — Your Google Cloud Vision API key
- `RATE_LIMIT_MAX` — Max requests per day (default: 100)
- `RATE_LIMIT_KV` — KV namespace binding

## Frontend Changes

### Configuration
```javascript
const CONFIG = {
  workerUrl: 'https://fuelly-ocr-proxy.workers.dev',
  useWorker: true  // Route through Worker instead of direct API
};
```

### OCR Module Updates
- Add `workerMode` flag
- When enabled, send requests to Worker endpoint
- Remove API key prompt from user flow

## Testing

### Test Photo Naming Convention
- `pump_9.811_gallons_35.51_total.jpg`
- `odometer_168237_miles.jpg`

### Test Runner
```bash
npm run test              # Test against deployed Worker
npm run test:local       # Test with direct API key
```

### Test Output
```
Running tests...
✓ pump_9.811_gallons_35.51_total.jpg
  - Gallons: 9.811 (expected 9.811) ✓
  - Total: 35.51 (expected 35.51) ✓
✓ odometer_168237_miles.jpg
  - Miles: 168237 (expected 168237) ✓

2/2 tests passed
```

## Deployment

### Cloudflare Setup
1. Install Wrangler: `npm install -g wrangler`
2. Create Worker: `wrangler init fuelly-ocr-proxy`
3. Create KV namespace: `wrangler kv:namespace create "RATE_LIMIT"`
4. Configure environment variables in Cloudflare dashboard
5. Deploy: `wrangler deploy`

### Cost
- Cloudflare Workers: 100,000 requests/day free
- Google Vision API: 1,000 requests/month free
- Expected usage: well within free tiers

## File Changes

### New Files
- `worker/` — Cloudflare Worker code
- `tests/` — Test suite and test images
- `config.local.js` — Local config (gitignored)

### Modified Files
- `ocr.js` — Add Worker proxy mode
- `index.html` — Remove API key prompt
- `.gitignore` — Add config.local.js, tests/images/
