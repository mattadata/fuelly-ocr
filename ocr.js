/**
 * OCR Module for extracting fuel data from images
 * Uses Tesseract.js for client-side text recognition
 */

const OCR = (function() {
  let worker = null;
  let initPromise = null;

  /**
   * Initialize Tesseract worker (lazy load)
   */
  async function initWorker() {
    if (worker) return worker;
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

        // Set parameters for better number recognition
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
   * Update progress message
   */
  function updateProgress(message) {
    const statusEl = document.getElementById('processing-status');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  /**
   * Preprocess image for better OCR
   */
  function preprocessImage(imageData) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate dimensions (max width 2000px)
        const maxWidth = 2000;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and apply grayscale
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Convert to grayscale with contrast enhancement
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          // Enhance contrast
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
   * Extract text from image
   */
  async function extractText(imageData) {
    await initWorker();

    const preprocessed = await preprocessImage(imageData);
    const result = await worker.recognize(preprocessed);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      lines: result.data.lines
    };
  }

  /**
   * Parse pump data from OCR text
   */
  function parsePumpData(ocrResult) {
    const text = ocrResult.text;

    let gallons = null;
    let gallonsConfidence = 0;
    let pricePerGallon = null;
    let priceConfidence = 0;
    let total = null;
    let totalConfidence = 0;

    // Extract values using patterns
    // Gallons: typically 1-100 with 2 decimals
    const gallonsPattern = /\b(\d{1,2}\.\d{2})\s*(?:gal|gallons?)?\b/i;
    const gallonsMatch = text.match(gallonsPattern);
    if (gallonsMatch) {
      gallons = parseFloat(gallonsMatch[1]);
      // Find confidence for this match
      for (const line of ocrResult.lines) {
        if (line.text.includes(gallonsMatch[1])) {
          gallonsConfidence = line.confidence;
          break;
        }
      }
    }

    // Price per gallon: typically 1-10 with 3 decimals
    const pricePattern = /\b(\d\.\d{3})\s*(?:\/\s*gal|per\s*gal)?\b/i;
    const priceMatch = text.match(pricePattern);
    if (priceMatch) {
      pricePerGallon = parseFloat(priceMatch[1]);
      for (const line of ocrResult.lines) {
        if (line.text.includes(priceMatch[1])) {
          priceConfidence = line.confidence;
          break;
        }
      }
    }

    // Total: has $ or larger number (10-500)
    const totalPattern = /\$?\s*(\d{2,3}\.\d{2})\b(?!\s*\/)/;
    const totalMatch = text.match(totalPattern);
    if (totalMatch) {
      const value = parseFloat(totalMatch[1]);
      // Filter out values that look like price/gallon or odometer
      if (value >= 10 && value <= 500 && value !== pricePerGallon) {
        total = value;
        for (const line of ocrResult.lines) {
          if (line.text.includes(totalMatch[1])) {
            totalConfidence = line.confidence;
            break;
          }
        }
      }
    }

    // Calculate missing values if possible
    if (gallons && pricePerGallon && !total) {
      total = gallons * pricePerGallon;
      totalConfidence = Math.min(gallonsConfidence, priceConfidence);
    }

    if (total && pricePerGallon && !gallons) {
      gallons = total / pricePerGallon;
      gallonsConfidence = Math.min(totalConfidence, priceConfidence);
    }

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

    // Look for 5-6 digit numbers (odometer readings)
    // Exclude price-like numbers (with 3 decimals)
    const odometerPattern = /\b(\d{5,6})\b(?!\.\d)/g;
    const matches = [...text.matchAll(odometerPattern)];

    let miles = null;
    let confidence = 0;

    if (matches.length > 0) {
      // Take the largest number (most likely the odometer)
      const match = matches.reduce((a, b) =>
        parseInt(a[1]) > parseInt(b[1]) ? a : b
      );
      miles = parseInt(match[1]);

      // Find confidence for the line containing this number
      for (const line of ocrResult.lines) {
        if (line.text.includes(match[1])) {
          confidence = line.confidence;
          break;
        }
      }
    }

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
   * Terminate worker (cleanup)
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
    terminate
  };
})();
