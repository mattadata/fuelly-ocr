# Fuelly OCR Web App

A Progressive Web App (PWA) for iPhone that extracts fuel pump data and odometer readings from photos using OCR, then sends the data to Fuelly via SMS.

## Features

- 📷 Capture or upload photos of gas pump display and odometer
- 🔍 Client-side OCR using Tesseract.js (no backend required)
- 📊 Confidence scores for extracted data
- ✏️ Edit extracted values before sending
- 📲 One-tap SMS to Fuelly (503-512-9929)
- 📲 Installable to iPhone home screen
- 🌐 Works offline after first load

## Installation

1. Open Safari on your iPhone
2. Navigate to the deployed URL
3. Tap the Share button
4. Scroll down and tap "Add to Home Screen"
5. Tap "Add"

## Usage

1. Tap the pump photo area and capture the gas pump display
2. Tap the odometer photo area and capture your odometer
3. Tap "Extract Data"
4. Review the extracted values (edit if needed)
5. Tap "Send SMS to Fuelly"
6. Verify and send the message

## SMS Format

The app formats data for Fuelly's SMS service:
```
[miles] [price] [gallons]
```

Example: `45230 3.599 12.45`

## Development

```bash
# Serve locally (requires HTTPS for PWA features)
npx serve . -l 8080 --ssl-cert ./cert.pem --ssl-key ./key.pem

# Or use any static file server
python3 -m http.server 8080
```

Note: PWA features (service worker, install prompt) require HTTPS. For local testing, use `localhost` which is exempt from the HTTPS requirement.

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

### Static Site Deployment

Deploy the web app to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront

Simply upload all files in the root directory.

## Tech Stack

- Vanilla JavaScript (no framework)
- Tesseract.js for OCR
- PWA (Service Worker + Manifest)
- HTML5 + CSS3

## License

MIT
