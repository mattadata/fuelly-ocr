/**
 * Cloudflare Worker for Fuelly OCR Proxy
 * Proxies requests to Google Vision API with rate limiting and CORS support
 */

import { Router } from 'itty-router';
import { checkRateLimit } from './rate-limit.js';

// Create router
const router = Router();

/**
 * CORS preflight handler
 * Responds to OPTIONS requests with appropriate CORS headers
 */
function handleCorsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Test-Bypass',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Validate image data from request
 * Checks for presence and valid format of image data
 */
async function validateImageData(request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      throw new Error('Request body must be a valid JSON object');
    }

    if (!body.image) {
      throw new Error('Missing required field: image');
    }

    // Check if image is base64 data URL format
    if (typeof body.image !== 'string') {
      throw new Error('Image must be a string (base64 or data URL)');
    }

    // Validate base64/data URL format
    const dataUrlPattern = /^data:image\/(jpeg|png|gif|webp|heic);base64,/i;
    const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

    if (!dataUrlPattern.test(body.image) && !base64Pattern.test(body.image)) {
      throw new Error('Image must be a valid base64 string or data URL');
    }

    // Check size limit (Cloudflare Workers: 128MB request body limit)
    // But we'll set a practical limit for base64 images
    const approximateSize = Math.floor(body.image.length * 0.75);
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (approximateSize > maxSize) {
      throw new Error(`Image size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    return body;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON in request body');
    }
    throw error;
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
router.options('*', (request, env) => handleCorsOptions());

/**
 * Handle POST requests to /ocr endpoint
 */
router.post('/ocr', async (request, env) => {
  try {
    // Get client IP from CF-Connecting-IP header
    const clientIp = request.headers.get('CF-Connecting-IP');

    // Check for test bypass header (allows skipping rate limit for testing)
    const testBypass = request.headers.get('X-Test-Bypass');
    const testBypassKey = env.TEST_BYPASS_KEY || 'fuelly-test-2024';

    // Check rate limit (skip if valid test bypass header provided)
    if (testBypass !== testBypassKey) {
      const rateLimitResult = await checkRateLimit(clientIp, env);
      if (!rateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Rate limit exceeded',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Retry-After': rateLimitResult.retryAfter.toString(),
            },
          }
        );
      }
    }

    // Validate image data
    const imageData = await validateImageData(request);

    // Check for API key configuration
    const apiKey = env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Google Vision API key not configured',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Call Vision API
    const result = await callVisionAPI(imageData.image, apiKey);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

/**
 * Catch-all route for unsupported methods/paths
 * Enforces POST-only for the main endpoint
 */
router.all('*', (request, env) => {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Method not allowed. Use POST /ocr',
    }),
    {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});

/**
 * Call Google Vision API for text detection
 * @param {string} base64Image - Base64 encoded image (with or without data URL prefix)
 * @param {string} apiKey - Google Cloud API key
 * @returns {Promise<{text: string, lines: array}>}
 */
async function callVisionAPI(base64Image, apiKey) {
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

  const fullText = annotations[0].description || '';

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

/**
 * Main fetch handler for Cloudflare Worker
 */
export default {
  fetch: (request, env, ctx) => {
    return router
      .handle(request, env)
      .then((response) => addCorsHeaders(response))
      .catch((error) => {
        // Global error handler with CORS headers
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Internal server error',
            message: error.message,
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      });
  },
};
