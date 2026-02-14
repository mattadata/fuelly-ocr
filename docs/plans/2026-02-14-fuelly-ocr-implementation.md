# Fuelly OCR Web App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Progressive Web App for iPhone that uses Tesseract.js OCR to extract fuel pump data and odometer readings from photos, then generates an SMS link to send data to Fuelly.

**Architecture:** Single-page vanilla JavaScript app with client-side OCR using Tesseract.js. No backend required. Data flows from camera/file input → image preprocessing → Tesseract OCR extraction → confidence scoring → editable preview → SMS link generation.

**Tech Stack:** Vanilla JavaScript, HTML5, CSS3, Tesseract.js CDN, PWA (Service Worker + Manifest)

---

## Prerequisites

**Tools needed:**
- iOS Safari or desktop Chrome for testing
- A web server for PWA testing (https required for service workers)

**Tesseract.js CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
```

---

## Task 1: Create HTML Structure

**Files:**
- Create: `index.html`

**Step 1: Create the base HTML structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Fuelly">
  <meta name="theme-color" content="#1a1a2e">
  <title>Fuelly OCR</title>
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-container">
    <header>
      <h1>Fuelly Fuel Up</h1>
    </header>

    <!-- View 1: Photo Capture -->
    <div id="view-capture" class="view active">
      <div class="photo-section">
        <label>Gas Pump Photo</label>
        <div class="photo-input" id="pump-photo-input">
          <input type="file" id="pump-file" accept="image/*" capture="environment">
          <div class="photo-placeholder">
            <span class="icon">📷</span>
            <span>Tap to capture pump display</span>
          </div>
          <img id="pump-preview" class="preview hidden" alt="Pump display preview">
        </div>
      </div>

      <div class="photo-section">
        <label>Odometer Photo</label>
        <div class="photo-input" id="odometer-photo-input">
          <input type="file" id="odometer-file" accept="image/*" capture="environment">
          <div class="photo-placeholder">
            <span class="icon">📷</span>
            <span>Tap to capture odometer</span>
          </div>
          <img id="odometer-preview" class="preview hidden" alt="Odometer preview">
        </div>
      </div>

      <button id="extract-btn" class="btn btn-primary" disabled>Extract Data</button>
    </div>

    <!-- View 2: Processing -->
    <div id="view-processing" class="view hidden">
      <div class="spinner"></div>
      <p id="processing-status">Analyzing images...</p>
    </div>

    <!-- View 3: Review & Confirm -->
    <div id="view-review" class="view hidden">
      <div class="data-section">
        <h2>Gas Pump Data</h2>
        <div class="confidence-indicator" id="pump-confidence"></div>

        <div class="field-group">
          <label for="gallons">Gallons</label>
          <input type="number" id="gallons" step="0.01" min="0" max="100">
          <span class="confidence" id="gallons-confidence"></span>
        </div>

        <div class="field-group">
          <label for="price">Price per Gallon ($)</label>
          <input type="number" id="price" step="0.001" min="0" max="10">
          <span class="confidence" id="price-confidence"></span>
        </div>

        <div class="field-group">
          <label for="total">Total ($)</label>
          <input type="number" id="total" step="0.01" min="0" max="500">
          <span class="confidence" id="total-confidence"></span>
        </div>
      </div>

      <div class="data-section">
        <h2>Odometer Data</h2>
        <div class="confidence-indicator" id="odometer-confidence"></div>

        <div class="field-group">
          <label for="miles">Miles</label>
          <input type="number" id="miles" step="1" min="0">
          <span class="confidence" id="miles-confidence"></span>
        </div>
      </div>

      <button id="send-sms-btn" class="btn btn-primary">Send SMS to Fuelly</button>
      <button id="back-btn" class="btn btn-secondary">Start Over</button>
    </div>

    <!-- Error Banner -->
    <div id="error-banner" class="error-banner hidden">
      <span id="error-message"></span>
      <button id="dismiss-error" class="close-btn">×</button>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
  <script src="ocr.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add HTML structure for Fuelly OCR app

Three views: photo capture, processing, and review/confirm.
Includes Tesseract.js CDN and placeholder elements.
"
```

---

## Task 2: Create CSS Styles

**Files:**
- Create: `styles.css`

**Step 1: Create base styles and responsive layout**

```css
/* Reset and Base */
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-input: #0f3460;
  --text-primary: #eaeaea;
  --text-secondary: #a0a0a0;
  --accent: #e94560;
  --accent-hover: #ff6b6b;
  --success: #4ade80;
  --warning: #fbbf24;
  --error: #ef4444;
  --border-radius: 12px;
  --spacing: 1rem;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  min-height: 100dvh; /* Dynamic viewport height for mobile */
}

.app-container {
  max-width: 480px;
  margin: 0 auto;
  padding: var(--spacing);
  padding-bottom: calc(var(--spacing) * 3);
}

/* Header */
header {
  text-align: center;
  padding: calc(var(--spacing) * 1.5) 0;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

h2 {
  font-size: 1.1rem;
  font-weight: 500;
  margin-bottom: var(--spacing);
}

/* Views */
.view {
  display: none;
}

.view.active {
  display: block;
}

.view.hidden {
  display: none;
}

/* Photo Section */
.photo-section {
  margin-bottom: calc(var(--spacing) * 1.5);
}

.photo-section label {
  display: block;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.photo-input {
  position: relative;
  border-radius: var(--border-radius);
  overflow: hidden;
  background: var(--bg-secondary);
  border: 2px solid var(--bg-input);
  cursor: pointer;
  transition: border-color 0.2s;
}

.photo-input:has(input:focus) {
  border-color: var(--accent);
}

.photo-input input[type="file"] {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}

.photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  gap: 0.5rem;
}

.photo-placeholder .icon {
  font-size: 2.5rem;
}

.photo-placeholder span:last-child {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.preview {
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
}

.preview.hidden {
  display: none;
}

/* Buttons */
.btn {
  width: 100%;
  padding: 1rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

.btn:active {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  color: white;
  margin-top: var(--spacing);
}

.btn-primary:not(:disabled):hover {
  background: var(--accent-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  margin-top: 0.75rem;
}

/* Processing View */
#view-processing {
  text-align: center;
  padding: 4rem 1rem;
}

.spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 1.5rem;
  border: 4px solid var(--bg-input);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

#processing-status {
  color: var(--text-secondary);
}

/* Data Section */
.data-section {
  background: var(--bg-secondary);
  padding: var(--spacing);
  border-radius: var(--border-radius);
  margin-bottom: var(--spacing);
}

.confidence-indicator {
  font-size: 0.85rem;
  margin-bottom: var(--spacing);
  padding: 0.5rem;
  border-radius: 8px;
  background: var(--bg-input);
}

.confidence-indicator.high {
  border-left: 3px solid var(--success);
}

.confidence-indicator.medium {
  border-left: 3px solid var(--warning);
}

.confidence-indicator.low {
  border-left: 3px solid var(--error);
}

/* Field Group */
.field-group {
  margin-bottom: 1rem;
  position: relative;
}

.field-group label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.35rem;
}

.field-group input {
  width: 100%;
  padding: 0.85rem;
  font-size: 1.1rem;
  background: var(--bg-input);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-primary);
}

.field-group input:focus {
  outline: none;
  border-color: var(--accent);
}

.confidence {
  position: absolute;
  right: 0.85rem;
  top: 2.4rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: var(--bg-primary);
}

.confidence.high {
  color: var(--success);
}

.confidence.medium {
  color: var(--warning);
}

.confidence.low {
  color: var(--error);
}

/* Error Banner */
.error-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--error);
  color: white;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  z-index: 100;
}

.error-banner.hidden {
  display: none;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

/* Safe area insets for iPhone */
@supports (padding: max(0px)) {
  .app-container {
    padding-left: max(var(--spacing), env(safe-area-inset-left));
    padding-right: max(var(--spacing), env(safe-area-inset-right));
  }

  .error-banner {
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }
}
```

**Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: add responsive CSS styles

Mobile-first design with dark theme, confidence indicators,
and iPhone safe area support."
```

---

## Task 3: Create OCR Module

**Files:**
- Create: `ocr.js`

**Step 1: Create the OCR module with Tesseract wrapper**

```javascript
/**
 * OCR Module for extracting fuel data from images
 * Uses Tesseract.js for client-side text recognition
 */

const OCR = (function() {
  let worker = null;
  let isInitializing = false;
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
    const lines = ocrResult.lines.map(l => l.text).join(' ');

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
```

**Step 2: Commit**

```bash
git add ocr.js
git commit -m "feat: add OCR module with Tesseract.js wrapper

Handles image preprocessing, text extraction, and parsing of
pump data (gallons, price, total) and odometer readings.
"
```

---

## Task 4: Create Main App Logic

**Files:**
- Create: `app.js`

**Step 1: Create the main application logic**

```javascript
/**
 * Main App Logic for Fuelly OCR
 */

const App = (function() {
  // State
  const state = {
    pumpImage: null,
    odometerImage: null,
    extractedData: null
  };

  // DOM Elements
  const elements = {
    // Views
    viewCapture: document.getElementById('view-capture'),
    viewProcessing: document.getElementById('view-processing'),
    viewReview: document.getElementById('view-review'),

    // Photo inputs
    pumpFile: document.getElementById('pump-file'),
    odometerFile: document.getElementById('odometer-file'),
    pumpPreview: document.getElementById('pump-preview'),
    odometerPreview: document.getElementById('odometer-preview'),

    // Buttons
    extractBtn: document.getElementById('extract-btn'),
    sendSmsBtn: document.getElementById('send-sms-btn'),
    backBtn: document.getElementById('back-btn'),

    // Review fields
    gallons: document.getElementById('gallons'),
    price: document.getElementById('price'),
    total: document.getElementById('total'),
    miles: document.getElementById('miles'),

    // Confidence displays
    gallonsConfidence: document.getElementById('gallons-confidence'),
    priceConfidence: document.getElementById('price-confidence'),
    totalConfidence: document.getElementById('total-confidence'),
    milesConfidence: document.getElementById('miles-confidence'),
    pumpConfidence: document.getElementById('pump-confidence'),
    odometerConfidence: document.getElementById('odometer-confidence'),

    // Processing
    processingStatus: document.getElementById('processing-status'),

    // Error
    errorBanner: document.getElementById('error-banner'),
    errorMessage: document.getElementById('error-message'),
    dismissError: document.getElementById('dismiss-error')
  };

  /**
   * Initialize app
   */
  function init() {
    setupEventListeners();
  }

  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    // Photo inputs
    elements.pumpFile.addEventListener('change', handlePumpPhoto);
    elements.odometerFile.addEventListener('change', handleOdometerPhoto);

    // Buttons
    elements.extractBtn.addEventListener('click', handleExtract);
    elements.sendSmsBtn.addEventListener('click', handleSendSms);
    elements.backBtn.addEventListener('click', handleBack);
    elements.dismissError.addEventListener('click', hideError);
  }

  /**
   * Handle pump photo selection
   */
  function handlePumpPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      state.pumpImage = event.target.result;
      elements.pumpPreview.src = state.pumpImage;
      elements.pumpPreview.classList.remove('hidden');
      updateExtractButton();
    };
    reader.readAsDataURL(file);
  }

  /**
   * Handle odometer photo selection
   */
  function handleOdometerPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      state.odometerImage = event.target.result;
      elements.odometerPreview.src = state.odometerImage;
      elements.odometerPreview.classList.remove('hidden');
      updateExtractButton();
    };
    reader.readAsDataURL(file);
  }

  /**
   * Update extract button state
   */
  function updateExtractButton() {
    elements.extractBtn.disabled = !(state.pumpImage && state.odometerImage);
  }

  /**
   * Handle extract button click
   */
  async function handleExtract() {
    if (!state.pumpImage || !state.odometerImage) return;

    showView('processing');

    try {
      // Extract text from both images in parallel
      const [pumpResult, odometerResult] = await Promise.all([
        OCR.extractText(state.pumpImage),
        OCR.extractText(state.odometerImage)
      ]);

      // Parse the results
      const pumpData = OCR.parsePumpData(pumpResult);
      const odometerData = OCR.parseOdometerData(odometerResult);

      state.extractedData = {
        pump: pumpData,
        odometer: odometerData
      };

      // Validate we got usable data
      if (!pumpData.gallons.value && !pumpData.pricePerGallon.value && !pumpData.total.value) {
        throw new Error('Could not extract pump data. Please retake the photo or enter data manually.');
      }

      if (!odometerData.miles.value) {
        throw new Error('Could not extract odometer reading. Please retake the photo or enter manually.');
      }

      // Populate the review form
      populateReviewForm(pumpData, odometerData);
      showView('review');

    } catch (error) {
      showError(error.message);
      showView('capture');
    }
  }

  /**
   * Populate the review form with extracted data
   */
  function populateReviewForm(pumpData, odometerData) {
    // Pump data
    elements.gallons.value = pumpData.gallons.value || '';
    elements.price.value = pumpData.pricePerGallon.value || '';
    elements.total.value = pumpData.total.value || '';

    // Odometer data
    elements.miles.value = odometerData.miles.value || '';

    // Confidence indicators
    updateConfidenceDisplay(elements.gallonsConfidence, pumpData.gallons.confidence);
    updateConfidenceDisplay(elements.priceConfidence, pumpData.pricePerGallon.confidence);
    updateConfidenceDisplay(elements.totalConfidence, pumpData.total.confidence);
    updateConfidenceDisplay(elements.milesConfidence, odometerData.miles.confidence);

    // Overall section indicators
    updateSectionConfidence(elements.pumpConfidence, pumpData);
    updateSectionConfidence(elements.odometerConfidence, odometerData);
  }

  /**
   * Update confidence display for a single field
   */
  function updateConfidenceDisplay(element, confidence) {
    const level = OCR.getConfidenceLevel(confidence);
    const percent = OCR.getConfidencePercent(confidence);
    element.textContent = percent;
    element.className = 'confidence ' + level;
  }

  /**
   * Update section-level confidence indicator
   */
  function updateSectionConfidence(element, data) {
    const values = Object.values(data).filter(v => v.value !== null);
    if (values.length === 0) return;

    const avgConfidence = values.reduce((sum, v) => sum + v.confidence, 0) / values.length;
    const level = OCR.getConfidenceLevel(avgConfidence);
    const percent = OCR.getConfidencePercent(avgConfidence);

    element.textContent = `Average confidence: ${percent}`;
    element.className = 'confidence-indicator ' + level;
  }

  /**
   * Handle send SMS button
   */
  function handleSendSms() {
    const miles = parseInt(elements.miles.value);
    const price = parseFloat(elements.price.value);
    const gallons = parseFloat(elements.gallons.value);

    // Validate inputs
    if (!miles || !price || !gallons) {
      showError('Please fill in all fields');
      return;
    }

    // Format for Fuelly SMS: [miles] [price] [gallons]
    // Remove commas from miles
    const milesStr = miles.toString().replace(/,/g, '');
    const smsBody = `${milesStr} ${price.toFixed(3)} ${gallons.toFixed(2)}`;

    // Create SMS link
    const smsUrl = `sms:503-512-9929&body=${encodeURIComponent(smsBody)}`;

    // Open Messages app
    window.location.href = smsUrl;
  }

  /**
   * Handle back button (start over)
   */
  function handleBack() {
    // Clear state
    state.pumpImage = null;
    state.odometerImage = null;
    state.extractedData = null;

    // Clear form
    elements.pumpFile.value = '';
    elements.odometerFile.value = '';
    elements.pumpPreview.src = '';
    elements.odometerPreview.src = '';
    elements.pumpPreview.classList.add('hidden');
    elements.odometerPreview.classList.add('hidden');

    // Reset inputs
    elements.gallons.value = '';
    elements.price.value = '';
    elements.total.value = '';
    elements.miles.value = '';

    updateExtractButton();
    showView('capture');
  }

  /**
   * Show a specific view
   */
  function showView(viewName) {
    elements.viewCapture.classList.remove('active');
    elements.viewProcessing.classList.remove('active');
    elements.viewReview.classList.remove('active');

    elements.viewCapture.classList.add('hidden');
    elements.viewProcessing.classList.add('hidden');
    elements.viewReview.classList.add('hidden');

    switch (viewName) {
      case 'capture':
        elements.viewCapture.classList.add('active');
        elements.viewCapture.classList.remove('hidden');
        break;
      case 'processing':
        elements.viewProcessing.classList.add('active');
        elements.viewProcessing.classList.remove('hidden');
        break;
      case 'review':
        elements.viewReview.classList.add('active');
        elements.viewReview.classList.remove('hidden');
        break;
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorBanner.classList.remove('hidden');
  }

  /**
   * Hide error message
   */
  function hideError() {
    elements.errorBanner.classList.add('hidden');
  }

  return { init };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
```

**Step 2: Commit**

```bash
git add app.js
git commit -m "feat: add main app logic

Handles photo capture, OCR processing, form population,
SMS link generation, and view management.
"
```

---

## Task 5: Create PWA Manifest

**Files:**
- Create: `manifest.json`

**Step 1: Create the PWA manifest**

```json
{
  "name": "Fuelly OCR",
  "short_name": "Fuelly",
  "description": "Extract fuel data from photos and send to Fuelly",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add manifest.json
git commit -m "feat: add PWA manifest

Configures the app for install on iPhone home screen.
"
```

---

## Task 6: Create Service Worker

**Files:**
- Create: `sw.js`

**Step 1: Create service worker for offline capability**

```javascript
/**
 * Service Worker for Fuelly OCR PWA
 * Enables offline capability after first load
 */

const CACHE_NAME = 'fuelly-ocr-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/ocr.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// Install event - cache assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(function(response) {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

**Step 2: Register service worker in index.html**

Add before the closing `</body>` tag (after the existing scripts):

```html
<script>
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function(registration) {
      console.log('ServiceWorker registered:', registration);
    }).catch(function(error) {
      console.log('ServiceWorker registration failed:', error);
    });
  }
</script>
```

**Step 3: Commit**

```bash
git add sw.js index.html
git commit -m "feat: add service worker for offline capability

Caches app assets and Tesseract.js for offline use.
"
```

---

## Task 7: Create App Icons

**Files:**
- Create: `icons/icon-192.png`
- Create: `icons/icon-512.png`

**Step 1: Create icons directory**

```bash
mkdir -p icons
```

**Step 2: Create placeholder icons**

For testing, you can create simple colored PNG icons. In production, create proper icons with a fuel pump or "F" logo:

```bash
# Create simple placeholder icons using ImageMagick (if available)
# Or use any image editor to create 192x192 and 512x512 PNG icons
# with a dark blue background (#1a1a2e) and a white fuel pump icon or "F"

# The icons should be:
# - icon-192.png: 192x192 pixels
# - icon-512.png: 512x512 pixels
# - Both should have transparent or square corners
# - Center a simple icon: fuel pump or letter "F"
```

**Step 3: Commit**

```bash
git add icons/
git commit -m "feat: add PWA icons

192x192 and 512x512 icons for home screen installation.
"
```

---

## Task 8: Add README and Deploy Instructions

**Files:**
- Create: `README.md`

**Step 1: Create README**

```markdown
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

Deploy to any static hosting service:
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage and deployment instructions"
```

---

## Task 9: Final Testing Checklist

**Files:**
- Test: All components

**Step 1: Test photo capture flow**

1. Open app in browser
2. Test camera capture for pump photo
3. Test file picker for pump photo
4. Test camera capture for odometer photo
5. Verify preview images display
6. Verify "Extract Data" button enables only when both photos selected

**Step 2: Test OCR processing**

1. Upload test pump photo (with gallons, price, total visible)
2. Upload test odometer photo
3. Verify processing view shows
4. Verify review view populates with extracted data
5. Verify confidence scores display

**Step 3: Test editing flow**

1. Edit extracted values
2. Tap "Send SMS to Fuelly"
3. Verify Messages app opens with pre-filled data
4. Verify format: `[miles] [price] [gallons]`

**Step 4: Test error cases**

1. Upload non-image file → verify error shows
2. Upload blurry photo → verify confidence is low
3. Upload photo with no numbers → verify error message

**Step 5: Test PWA features (on iPhone)**

1. Open in Safari
2. Tap Share → Add to Home Screen
3. Launch from home screen
4. Verify it opens in standalone mode (no Safari UI)
5. Test offline functionality

**Step 6: Commit final touches**

```bash
# After testing is complete
git add .
git commit -m "test: complete initial testing

Verified OCR accuracy, SMS format, and PWA functionality.
"
```

---

## Task 10: Deploy to Static Hosting

**Files:**
- Deploy: All files

**Step 1: Choose deployment platform**

For GitHub Pages:
```bash
# Create gh-pages branch
git checkout --orphan gh-pages
git commit -m "Initial deploy"
git push origin gh-pages
```

For Netlify:
```bash
# Drag and drop the folder to netlify-drop.com
# Or use CLI
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

**Step 2: Verify deployment**

1. Open deployed URL in Safari on iPhone
2. Test full user flow
3. Verify SMS sends to correct number: 503-512-9929
4. Verify Fuelly accepts the format

**Step 3: Tag release**

```bash
git tag -a v1.0.0 -m "Initial release: Fuelly OCR PWA"
git push origin v1.0.0
```

---

## Summary of Implementation

**Total files created:**
1. `index.html` - Main HTML structure
2. `styles.css` - Responsive CSS with dark theme
3. `ocr.js` - Tesseract.js wrapper and data parsing
4. `app.js` - Main application logic
5. `manifest.json` - PWA manifest
6. `sw.js` - Service worker for offline capability
7. `icons/icon-192.png` - 192x192 app icon
8. `icons/icon-512.png` - 512x512 app icon
9. `README.md` - Documentation

**Total estimated time:** 3-4 hours for initial implementation

**Testing photos needed:**
- Gas pump display showing gallons, price/gallon, total
- Odometer showing 5-6 digit reading
- Various lighting conditions
- Different display types (LCD, LED, digital)
