/**
 * OCR Module for extracting fuel data from images
 * - Pump images (LCD displays): Google Cloud Vision API
 * - Odometer images: Tesseract.js (local)
 */

const OCR = (function() {
  let worker = null;
  let initPromise = null;
  let debugCallback = null;
  let apiKey = null;

  /**
   * Set Google Cloud Vision API key
   */
  function setApiKey(key) {
    apiKey = key;
    // Save to localStorage as backup (for deployed version without config.js)
    try {
      localStorage.setItem('fuelly_google_vision_key', key);
    } catch (e) {
      // localStorage might not be available
    }
  }

  /**
   * Get Worker URL (with default)
   */
  function getWorkerUrl() {
    // From config file
    if (typeof CONFIG !== 'undefined' && CONFIG.workerUrl) {
      return CONFIG.workerUrl;
    }
    // From localStorage
    const stored = localStorage.getItem('fuelly_worker_url');
    if (stored) return stored;
    // Default for GitHub Pages deployment
    return 'https://fuelly-ocr-proxy.mattadata-fuelly.workers.dev/ocr';
  }

  /**
   * Get stored API key
   */
  function getApiKey() {
    if (!apiKey) {
      // Try to load from config.js first, then localStorage
      apiKey = (typeof CONFIG !== 'undefined' && CONFIG.googleVisionApiKey) ||
                localStorage.getItem('fuelly_google_vision_key');
    }
    return apiKey;
  }

  /**
   * Set debug callback to display output on page
   */
  function setDebugCallback(callback) {
    debugCallback = callback;
  }

  /**
   * Log to console and debug display (enabled for debugging)
   */
  function debugLog(message, data) {
    console.log(message, data);
    if (debugCallback) {
      debugCallback(message + (data ? ' ' + JSON.stringify(data) : ''));
    }
  }

  /**
   * Update progress message
   */
  function updateProgress(message) {
    const statusEl = document.getElementById('processing-status');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  /**
   * Extract text from image
   * @param {string} imageData - Base64 image data
   * @param {boolean} useVisionAPI - True for pump displays (use Google Vision)
   */
  async function extractText(imageData, useVisionAPI = false) {
    const useWorker = (typeof CONFIG !== 'undefined' && CONFIG.useWorker) ||
                      localStorage.getItem('fuelly_use_worker') === 'true';

    if (useWorker) {
      return await extractWithWorker(imageData);
    }

    if (useVisionAPI) {
      return await extractWithVisionAPI(imageData);
    }

    return await extractWithTesseract(imageData);
  }

  /**
   * Extract text using Google Cloud Vision API
   * Excellent for LCD/digital displays
   */
  async function extractWithVisionAPI(imageData) {
    let key = getApiKey();

    if (!key) {
      throw new Error('Google Cloud Vision API key not configured. Add it to config.local.js or use Worker mode.');
    }

    debugLog('Using Google Vision API for digital display');
    updateProgress('Reading digital display with Vision API...');

    // Get base64 data (already the format we need for Vision API)
    const base64Data = imageData.split(',')[1];
    debugLog('Base64 data length:', base64Data.length);

    const requestBody = {
      requests: [{
        image: {
          content: base64Data
        },
        features: [
          { type: 'TEXT_DETECTION', maxResults: 10 }
        ]
      }]
    };

    debugLog('Sending request to Vision API...');

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    debugLog('Vision API response status:', response.status);

    if (!response.ok) {
      const error = await response.json();
      debugLog('Vision API error:', error);
      if (response.status === 403) {
        throw new Error('API key invalid or Vision API not enabled. Check Google Cloud Console.');
      }
      throw new Error(error.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    debugLog('Vision API raw response keys:', Object.keys(data));

    const annotations = data.responses[0].textAnnotations;
    debugLog('Vision API annotations count:', annotations?.length || 0);

    if (!annotations || annotations.length === 0) {
      debugLog('Vision API: No text detected!');
      return { text: '', confidence: 0, lines: [] };
    }

    // First annotation is the full text, rest are individual words/lines
    const fullText = annotations[0].description || '';

    // Build lines array from annotations
    const lines = [];
    for (let i = 1; i < annotations.length; i++) {
      const annotation = annotations[i];
      lines.push({
        text: annotation.description,
        confidence: annotation.confidence || 85
      });
    }

    debugLog('Vision API result:', fullText);

    return {
      text: fullText,
      confidence: 85,
      lines: lines
    };
  }

  /**
   * Preprocess image for better OCR accuracy
   * - Upscales small images
   * - Enhances contrast
   * - Sharpens text
   */
  function preprocessForOCR(imageData) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Upscale to at least 2000px width for better OCR
        const minWidth = 2000;
        let width = img.width;
        let height = img.height;
        const scale = width < minWidth ? minWidth / width : 1;

        width = Math.round(width * scale);
        height = Math.round(height * scale);

        canvas.width = width;
        canvas.height = height;

        // Enable image smoothing for better upscaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Get image data for processing
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Convert to grayscale and enhance contrast
        for (let i = 0; i < data.length; i += 4) {
          // Grayscale
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

          // High contrast enhancement - make dark darker, light lighter
          // This helps decimal points and LCD segments stand out
          const contrast = 1.5;
          const enhanced = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
          const clamped = Math.min(255, Math.max(0, enhanced));

          data[i] = data[i + 1] = data[i + 2] = clamped;
        }

        ctx.putImageData(imgData, 0, 0);

        // Apply sharpening using a convolution
        const sharpenCanvas = document.createElement('canvas');
        sharpenCanvas.width = width;
        sharpenCanvas.height = height;
        const sharpenCtx = sharpenCanvas.getContext('2d');

        // Copy the contrast-enhanced image
        sharpenCtx.drawImage(canvas, 0, 0);
        const sharpenData = sharpenCtx.getImageData(0, 0, width, height);
        const sd = sharpenData.data;
        const origData = ctx.getImageData(0, 0, width, height);
        const od = origData.data;

        // Unsharp mask: subtract blurred version
        const amount = 0.5;
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;

            // Simple box blur kernel
            const blur = (
              od[idx - width * 4] + od[idx + width * 4] +
              od[idx - 4] + od[idx + 4] +
              od[idx]
            ) / 5;

            // Sharpen
            const sharpened = od[idx] + (od[idx] - blur) * amount;
            sd[idx] = sd[idx + 1] = sd[idx + 2] = Math.min(255, Math.max(0, sharpened));
          }
        }

        resolve(sharpenCanvas.toDataURL('image/jpeg', 0.95));
      };
      img.src = imageData;
    });
  }

  /**
   * Extract text using Worker proxy with retry logic
   */
  async function extractWithWorker(imageData) {
    debugLog('Using Worker proxy for OCR');
    updateProgress('Processing via Worker...');

    const workerUrl = getWorkerUrl();
    debugLog('Worker URL:', workerUrl);

    if (!workerUrl) {
      throw new Error('Worker URL not configured. Add it to config.local.js');
    }

    // Preprocess image for better OCR accuracy
    updateProgress('Enhancing image...');
    const preprocessedImage = await preprocessForOCR(imageData);
    debugLog('Image preprocessed');

    // Retry logic with exponential backoff
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        if (attempt > 0) {
          const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s
          debugLog(`Retry attempt ${attempt + 1}, waiting ${delay}ms...`);
          updateProgress(`Rate limited, retrying in ${Math.round(delay/1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
        }

        const response = await fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: preprocessedImage }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        debugLog('Worker response status:', response.status);

        if (response.status === 429) {
          if (attempt < maxRetries - 1) {
            debugLog('Rate limited, will retry...');
            continue; // Retry
          }
          throw new Error('Rate limit exceeded after retries. Please wait a minute and try again.');
        }

        if (!response.ok) {
          const text = await response.text();
          debugLog('Worker error response:', text);
          throw new Error('Worker request failed: ' + text);
        }

        const result = await response.json();

        // Worker returns {success: true, data: {text, lines}}
        const data = result.data || result;
        debugLog('Worker OCR result:', data.text?.substring(0, 100) || '(empty)');

        return {
          text: data.text || '',
          confidence: 85,
          lines: data.lines || []
        };
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout after 30 seconds');
        }
        if (attempt === maxRetries - 1) {
          throw error; // Re-throw on last attempt
        }
        // Continue to retry for other errors
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Extract text using Tesseract (for odometer)
   */
  async function extractWithTesseract(imageData) {
    if (!worker) {
      await initWorker();
    }

    const preprocessed = await preprocessImage(imageData);
    const result = await worker.recognize(preprocessed);

    debugLog('Tesseract result:', result.data.text);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      lines: result.data.lines
    };
  }

  /**
   * Initialize Tesseract worker
   */
  async function initWorker() {
    if (worker) return;
    if (initPromise) return initPromise;

    initPromise = (async function() {
      try {
        worker = await Tesseract.createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              updateProgress(`Analyzing... ${progress}%`);
            }
          }
        });

        await worker.setParameters({
          preserve_interword_spaces: '1',
        });

        return worker;
      } catch (error) {
        initPromise = null;
        throw error;
      }
    })();

    return initPromise;
  }

  /**
   * Preprocess image for Tesseract
   */
  function preprocessImage(imageData) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxWidth = 2000;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Grayscale with contrast
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const enhanced = gray < 128 ? gray * 0.8 : gray * 1.2;
          data[i] = data[i + 1] = data[i + 2] = Math.min(255, Math.max(0, enhanced));
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = imageData;
    });
  }

  /**
   * Parse pump data from OCR text
   */
  function parsePumpData(ocrResult) {
    let text = ocrResult.text;
    debugLog('Parsing pump data from text:', text);

    let gallons = null;
    let gallonsConfidence = 0;
    let gallonsDigits = null;  // Track digits used for gallons
    let pricePerGallon = null;
    let priceConfidence = 0;
    let total = null;
    let totalConfidence = 0;

    // Clean up common OCR artifacts from LCD displays
    // The pump shows "9.811" but Vision reads it as "9.8 | 1" or "9.81 1"
    // The | represents an LCD segment that should be "1"

    // First, handle the gallons display specifically (context-aware)
    text = text.replace(/GALLONS\s*\n\s*(\d)\.(\d)\s*\|\s*(\d)/g, function(match, whole, decimal, last) {
      // "9.8 | 1" -> the | means there's a 1 in the middle, so result is 9.811
      return 'GALLONS\n' + whole + '.' + decimal + '1' + last;
    });

    // General patterns for other cases
    text = text
      // Fix OCR artifacts with spaces in decimals: "10. 19" -> "10.19"
      .replace(/(\d+)\.\s+(\d{2})\b/g, '$1.$2')
      // "9.81 | 1" -> "9.811"
      .replace(/(\d)\.(\d{2})\s*\|\s*(\d)/g, '$1.$2$3')
      // "9.81|1" -> "9.811"
      .replace(/(\d)\.(\d{2})\|(\d)/g, '$1.$2$3')
      // "9.81 1" -> "9.811" (but only if followed by non-digit, to avoid breaking other numbers)
      .replace(/(\d)\.(\d{2})\s+1(?!\d)/g, '$1.$21')
      // "35.5 1" -> "35.51"
      .replace(/(\d)\.(\d)\s+1(?!\d)/g, '$1.$2' + '1')
      // Replace remaining | with 1
      .replace(/\|/g, '1');

    debugLog('Cleaned pump text:', text);

    // Gallons: 3 decimals (e.g., 9.811)
    const gallonsPattern = /\b(\d{1,2}\.\d{3})\b/;
    let gallonsMatch = text.match(gallonsPattern);

    // HEURISTIC: If no gallons found with decimal, try to find 5-digit number
    // that could be gallons without detected decimal (e.g., "14997" -> 14.997)
    if (!gallonsMatch) {
      // Look for 4-5 digit numbers that could be gallons (1-25 gallons range)
      const noDecimalPattern = /\b(\d{4,5})\b/g;
      const candidates = [...text.matchAll(noDecimalPattern)];
      debugLog('Gallons heuristic candidates:', candidates.map(m => m[1]));

      for (const match of candidates) {
        const digits = match[1];
        // Try inserting decimal after 1-2 digits for gallons
        for (let decimalPos = 1; decimalPos <= 2; decimalPos++) {
          const withDecimal = parseFloat(
            digits.slice(0, decimalPos) + '.' + digits.slice(decimalPos)
          );
          // Valid gallons range: 1-25, with 3 decimal places means 4-5 digits
          if (withDecimal >= 1 && withDecimal <= 25 && digits.length === decimalPos + 3) {
            gallons = withDecimal;
            gallonsMatch = match;
            gallonsDigits = digits;
            debugLog('Gallons heuristic applied:', digits, '->', withDecimal);
            break;
          }
        }
        if (gallons) break;
      }
    }

    if (gallonsMatch && !gallons) {
      gallons = parseFloat(gallonsMatch[1]);
    }

    if (gallons) {
      for (const line of ocrResult.lines) {
        if (line.text && (line.text.includes(gallonsMatch[1]) || line.text.includes(gallons.toString()))) {
          gallonsConfidence = line.confidence || 70;
          break;
        }
      }
    }

    // Total: 2 decimals, $10-$500 range
    const totalPattern = /\$?\s*(\d{1,3}\.\d{2})\b/g;
    let totalMatches = [...text.matchAll(totalPattern)];

    // HEURISTIC: If no total found with decimal, try 4-digit numbers
    // that could be total without detected decimal (e.g., "5948" -> 59.48)
    if (totalMatches.length === 0) {
      const noDecimalPattern = /\b(\d{4})\b/g;
      const candidates = [...text.matchAll(noDecimalPattern)];
      debugLog('Total heuristic candidates:', candidates.map(m => m[1]));

      for (const match of candidates) {
        const digits = match[1];
        // Skip if these digits were already used for gallons
        if (gallonsDigits && digits === gallonsDigits) {
          debugLog('Skipping total candidate (used for gallons):', digits);
          continue;
        }

        // Try inserting decimal after 2 digits for total (e.g., 5948 -> 59.48)
        for (let decimalPos = 2; decimalPos <= 3; decimalPos++) {
          const withDecimal = parseFloat(
            digits.slice(0, decimalPos) + '.' + digits.slice(decimalPos)
          );
          // Valid total range: $10-$500
          if (withDecimal >= 10 && withDecimal <= 500) {
            total = withDecimal;
            totalMatches = [match];
            debugLog('Total heuristic applied:', digits, '->', withDecimal);
            break;
          }
        }
        if (total) break;
      }
    }

    if (!total && totalMatches.length > 0) {
      for (const match of totalMatches) {
        const value = parseFloat(match[1]);
        if (value >= 10 && value <= 500) {
          total = value;
          for (const line of ocrResult.lines) {
            if (line.text && line.text.includes(match[1])) {
              totalConfidence = line.confidence || 70;
              break;
            }
          }
          break;
        }
      }
    }

    if (total) {
      for (const line of ocrResult.lines) {
        if (line.text && line.text.includes(total.toString())) {
          totalConfidence = line.confidence || 70;
          break;
        }
      }
    }

    // Calculate price per gallon from total and gallons
    if (total && gallons && !pricePerGallon) {
      pricePerGallon = total / gallons;
      priceConfidence = Math.min(totalConfidence, gallonsConfidence);
    }

    debugLog('Pump data parsed:', { gallons, pricePerGallon, total });

    return {
      gallons: { value: gallons, confidence: gallonsConfidence },
      pricePerGallon: { value: pricePerGallon, confidence: priceConfidence },
      total: { value: total, confidence: totalConfidence }
    };
  }

  /**
   * Parse odometer data from OCR text
   */
  function parseOdometerData(ocrResult) {
    const text = ocrResult.text;
    debugLog('Parsing odometer data from text:', text);

    // 5-6 digit numbers
    const odometerPattern = /\b(\d{5,6})\b(?!\.\d)/g;
    const matches = [...text.matchAll(odometerPattern)];

    let miles = null;
    let confidence = 0;

    if (matches.length > 0) {
      const match = matches.reduce((a, b) =>
        parseInt(a[1]) > parseInt(b[1]) ? a : b
      );
      miles = parseInt(match[1]);

      for (const line of ocrResult.lines) {
        if (line.text && line.text.includes(match[1])) {
          confidence = line.confidence || 70;
          break;
        }
      }
    }

    debugLog('Odometer data parsed:', { miles });

    return {
      miles: { value: miles, confidence }
    };
  }

  /**
   * Get confidence level label
   */
  function getConfidenceLevel(confidence) {
    if (confidence >= 80) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
  }

  /**
   * Get confidence percentage display
   */
  function getConfidencePercent(confidence) {
    return Math.round(confidence) + '%';
  }

  /**
   * Terminate workers (cleanup)
   */
  async function terminate() {
    if (worker) {
      await worker.terminate();
      worker = null;
      initPromise = null;
    }
  }

  return {
    extractText,
    parsePumpData,
    parseOdometerData,
    getConfidenceLevel,
    getConfidencePercent,
    terminate,
    setDebugCallback,
    setApiKey,
    getApiKey
  };
})();
