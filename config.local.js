const CONFIG = {
  // Deploy the Worker from /worker directory with: wrangler deploy
  // Then update this URL with your deployed Worker URL
  workerUrl: 'https://fuelly-ocr-proxy.mattadata-fuelly.workers.dev/ocr',

  // Set to true to use Worker proxy mode (recommended - no API key needed)
  useWorker: true,

  // Alternative: Direct API key (not recommended - exposes key in client)
  googleVisionApiKey: 'YOUR_KEY_HERE'
};
