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

    // Prompt for API key if not set
    if (!key) {
      key = prompt('Enter your Google Cloud Vision API key:');
      if (key) {
        setApiKey(key);
        localStorage.setItem('fuelly_google_vision_key', key);
      }
    }

    if (!key) {
      throw new Error('Google Cloud Vision API key required. Get one from https://console.cloud.google.com/apis/credentials');
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
    const gallonsMatch = text.match(gallonsPattern);
    if (gallonsMatch) {
      gallons = parseFloat(gallonsMatch[1]);
      for (const line of ocrResult.lines) {
        if (line.text && line.text.includes(gallonsMatch[1])) {
          gallonsConfidence = line.confidence || 70;
          break;
        }
      }
    }

    // Total: 2 decimals, $10-$500 range
    const totalPattern = /\$?\s*(\d{1,3}\.\d{2})\b/g;
    const totalMatches = [...text.matchAll(totalPattern)];
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
