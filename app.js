/**
 * Main Application Module
 * Handles photo capture, OCR processing, form population,
 * SMS link generation, and view management
 */

const App = (function() {
  'use strict';

  // Application state
  const state = {
    uploadedFiles: [],
    extractedData: null,
    debugLog: []
  };

  // Cached DOM element references
  const elements = {
    // Views
    views: {
      capture: null,
      processing: null,
      review: null
    },
    // Photo inputs
    photosFile: null,
    photosInput: null,
    previewsContainer: null,
    // Buttons
    extractBtn: null,
    sendSmsBtn: null,
    backBtn: null,
    // Form fields
    gallons: null,
    price: null,
    total: null,
    miles: null,
    // Confidence displays
    gallonsConfidence: null,
    priceConfidence: null,
    totalConfidence: null,
    milesConfidence: null,
    pumpConfidence: null,
    odometerConfidence: null,
    // Processing
    processingStatus: null,
    // Error
    errorBanner: null,
    errorMessage: null,
    dismissError: null
  };

  /**
   * Initialize the application
   */
  function init() {
    cacheElements();
    setupEventListeners();
    setupDebugDisplay();
  }

  /**
   * Set up debug display for troubleshooting
   */
  function setupDebugDisplay() {
    // Create debug container
    let debugContainer = document.getElementById('debug-output');
    if (!debugContainer) {
      debugContainer = document.createElement('div');
      debugContainer.id = 'debug-output';
      debugContainer.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.9); color: #0f0; font-family: monospace; font-size: 9px; padding: 6px; z-index: 100; border-top: 2px solid #0f0; word-break: break-word; pointer-events: none;';
      document.body.appendChild(debugContainer);
    }

    // Set up OCR debug callback
    OCR.setDebugCallback(function(message) {
      state.debugLog.push(message);
      debugContainer.innerHTML = state.debugLog.slice(-20).map(m => `<div style="margin: 1px 0;">${m}</div>`).join('');
      debugContainer.scrollTop = debugContainer.scrollHeight;
    });
  }

  /**
   * Cache all DOM element references
   */
  function cacheElements() {
    // Views
    elements.views.capture = document.getElementById('view-capture');
    elements.views.processing = document.getElementById('view-processing');
    elements.views.review = document.getElementById('view-review');

    // Photo inputs
    elements.photosFile = document.getElementById('photos-file');
    elements.photosInput = document.getElementById('photos-input');
    elements.previewsContainer = document.getElementById('previews');

    // Buttons
    elements.extractBtn = document.getElementById('extract-btn');
    elements.sendSmsBtn = document.getElementById('send-sms-btn');
    elements.backBtn = document.getElementById('back-btn');

    // Form fields
    elements.gallons = document.getElementById('gallons');
    elements.price = document.getElementById('price');
    elements.total = document.getElementById('total');
    elements.miles = document.getElementById('miles');

    // Confidence displays
    elements.gallonsConfidence = document.getElementById('gallons-confidence');
    elements.priceConfidence = document.getElementById('price-confidence');
    elements.totalConfidence = document.getElementById('total-confidence');
    elements.milesConfidence = document.getElementById('miles-confidence');
    elements.pumpConfidence = document.getElementById('pump-confidence');
    elements.odometerConfidence = document.getElementById('odometer-confidence');

    // Processing
    elements.processingStatus = document.getElementById('processing-status');

    // Error
    elements.errorBanner = document.getElementById('error-banner');
    elements.errorMessage = document.getElementById('error-message');
    elements.dismissError = document.getElementById('dismiss-error');
  }

  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    // Photo upload - file selection (label for="photos-file" handles click natively)
    elements.photosFile.addEventListener('change', handlePhotosUpload);
    elements.extractBtn.addEventListener('click', handleExtract);
    elements.sendSmsBtn.addEventListener('click', handleSendSms);
    elements.backBtn.addEventListener('click', handleBack);
    elements.dismissError.addEventListener('click', hideError);
  }

  /**
   * Handle photo uploads (up to 2 photos)
   */
  function handlePhotosUpload(e) {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    // Limit to 2 photos
    if (files.length > 2) {
      showError('Please upload only 1-2 photos');
      return;
    }

    // Validate all are images
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        showError('Please select only image files');
        return;
      }
    }

    state.uploadedFiles = files;

    // Read and display previews
    let loadedCount = 0;
    elements.previewsContainer.innerHTML = '';

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = function(event) {
        // Create preview element
        const previewDiv = document.createElement('div');
        previewDiv.style.cssText = 'position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; background: #2a2a3e;';

        const img = document.createElement('img');
        img.src = event.target.result;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        previewDiv.appendChild(img);

        // Add remove button
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 16px; cursor: pointer;';
        removeBtn.onclick = function() {
          removePhoto(index);
        };
        previewDiv.appendChild(removeBtn);

        elements.previewsContainer.appendChild(previewDiv);

        loadedCount++;
        if (loadedCount === files.length) {
          // All photos loaded, enable extract button
          elements.extractBtn.disabled = false;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Remove a specific photo by index
   */
  function removePhoto(index) {
    state.uploadedFiles = state.uploadedFiles.filter((_, i) => i !== index);

    // Rebuild previews
    elements.previewsContainer.innerHTML = '';
    if (state.uploadedFiles.length === 0) {
      elements.extractBtn.disabled = true;
      return;
    }

    // Re-render previews
    let loadedCount = 0;
    state.uploadedFiles.forEach((file, newIndex) => {
      const reader = new FileReader();
      reader.onload = function(event) {
        const previewDiv = document.createElement('div');
        previewDiv.style.cssText = 'position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; background: #2a2a3e;';

        const img = document.createElement('img');
        img.src = event.target.result;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        previewDiv.appendChild(img);

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 16px; cursor: pointer;';
        removeBtn.onclick = function() {
          removePhoto(newIndex);
        };
        previewDiv.appendChild(removeBtn);

        elements.previewsContainer.appendChild(previewDiv);

        loadedCount++;
        if (loadedCount === state.uploadedFiles.length) {
          elements.extractBtn.disabled = false;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Handle extract button click - process images with OCR
   * Automatically determines which photo is pump vs odometer
   */
  async function handleExtract() {
    hideError();
    state.debugLog = []; // Clear debug log

    if (state.uploadedFiles.length === 0) {
      showError('Please upload at least one photo');
      return;
    }

    // Show processing view
    showView('processing');
    elements.processingStatus.textContent = 'Analyzing images...';

    try {
      // Process all uploaded photos with Vision API
      const ocrResults = await Promise.all(
        state.uploadedFiles.map(file => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const result = await OCR.extractText(event.target.result, true);
              resolve(result);
            };
            reader.readAsDataURL(file);
          });
        })
      );

      debugLog('OCR results received:', ocrResults.length);

      // Auto-detect which photo is pump vs odometer
      const { pumpData, odometerData } = detectAndParseData(ocrResults);

      // Store extracted data
      state.extractedData = {
        pump: pumpData,
        odometer: odometerData
      };

      // Validate that we got required data
      if (!pumpData.gallons.value || !odometerData.miles.value) {
        showView('capture');
        showError('Could not extract all required data. Please try with clearer photos.');
        return;
      }

      // Populate and show review form
      populateReviewForm(pumpData, odometerData);
      showView('review');

    } catch (error) {
      console.error('OCR extraction error:', error);
      showView('capture');
      showError('Error: ' + error.message);
    }
  }

  /**
   * Detect which photo is pump vs odometer and parse data
   */
  function detectAndParseData(ocrResults) {
    let pumpData = { gallons: { value: null, confidence: 0 }, pricePerGallon: { value: null, confidence: 0 }, total: { value: null, confidence: 0 } };
    let odometerData = { miles: { value: null, confidence: 0 } };

    // Try each result and extract what we can
    for (let i = 0; i < ocrResults.length; i++) {
      const result = ocrResults[i];
      const text = result.text.toLowerCase();

      debugLog('Photo ' + (i + 1) + ' contains:', text.substring(0, 100));

      // Check for pump indicators
      const hasGallons = text.includes('gallon') || text.includes('gal');
      const hasSale = text.includes('sale') || text.includes('$') || text.includes('price');
      const hasOdometer = text.includes('odometer') || text.includes('odo') || /\b\d{5,6}\b/.test(text);

      debugLog('Photo ' + (i + 1) + ' - Gallons:', hasGallons, 'Sale:', hasSale, 'Odometer:', hasOdometer);

      if (hasGallons || hasSale) {
        // This is likely the pump
        const parsed = OCR.parsePumpData(result);
        if (parsed.gallons.value) {
          pumpData = parsed;
          debugLog('Photo ' + (i + 1) + ' identified as PUMP');
        }
      }

      if (hasOdometer) {
        // This is likely the odometer
        const parsed = OCR.parseOdometerData(result);
        if (parsed.miles.value) {
          odometerData = parsed;
          debugLog('Photo ' + (i + 1) + ' identified as ODOMETER');
        }
      }
    }

    // If detection failed, use fallback: assign first result as pump, second as odometer
    if (!pumpData.gallons.value && !odometerData.miles.value) {
      debugLog('Auto-detection failed, using fallback assignment');

      // Parse all results and see what we got
      const allPumpData = ocrResults.map(r => OCR.parsePumpData(r));
      const allOdometerData = ocrResults.map(r => OCR.parseOdometerData(r));

      // Find the best pump data (has gallons)
      for (const data of allPumpData) {
        if (data.gallons.value) {
          pumpData = data;
          break;
        }
      }

      // Find the best odometer data (has miles)
      for (const data of allOdometerData) {
        if (data.miles.value) {
          odometerData = data;
          break;
        }
      }
    }

    return { pumpData, odometerData };
  }

  /**
   * Populate the review form with extracted data
   */
  function populateReviewForm(pumpData, odometerData) {
    // Populate pump data fields (rounded to 3 decimals)
    elements.gallons.value = pumpData.gallons.value ? parseFloat(pumpData.gallons.value.toFixed(3)) : '';
    elements.price.value = pumpData.pricePerGallon.value ? parseFloat(pumpData.pricePerGallon.value.toFixed(3)) : '';
    elements.total.value = pumpData.total.value || '';

    // Populate odometer field
    elements.miles.value = odometerData.miles.value || '';

    // Update confidence displays for individual fields
    updateConfidenceDisplay(elements.gallonsConfidence, pumpData.gallons.confidence);
    updateConfidenceDisplay(elements.priceConfidence, pumpData.pricePerGallon.confidence);
    updateConfidenceDisplay(elements.totalConfidence, pumpData.total.confidence);
    updateConfidenceDisplay(elements.milesConfidence, odometerData.miles.confidence);

    // Update section confidence indicators
    updateSectionConfidence(elements.pumpConfidence, pumpData);
    updateSectionConfidence(elements.odometerConfidence, odometerData);
  }

  /**
   * Update individual confidence display element
   */
  function updateConfidenceDisplay(element, confidence) {
    // Remove existing confidence classes
    element.classList.remove('high', 'medium', 'low');

    if (confidence > 0) {
      const level = OCR.getConfidenceLevel(confidence);
      element.classList.add(level);
    }
  }

  /**
   * Update section confidence indicator with average and width
   */
  function updateSectionConfidence(element, data) {
    // Remove existing classes
    element.classList.remove('high', 'medium', 'low');

    // Calculate average confidence from all fields
    const confidences = Object.values(data).map(field => field.confidence || 0);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    if (avgConfidence > 0) {
      const level = OCR.getConfidenceLevel(avgConfidence);
      element.classList.add(level);

      // Set width as percentage
      element.style.setProperty('--confidence-width', avgConfidence + '%');
    }
  }

  /**
   * Handle send SMS button click
   */
  function handleSendSms() {
    // Get current values from form (user may have edited)
    const miles = elements.miles.value.trim();
    const price = elements.price.value.trim();
    const gallons = elements.gallons.value.trim();

    // Validate required fields
    if (!miles || !price || !gallons) {
      showError('Please fill in all required fields');
      return;
    }

    // Validate numeric values
    const milesNum = parseFloat(miles);
    const priceNum = parseFloat(price);
    const gallonsNum = parseFloat(gallons);

    if (isNaN(milesNum) || isNaN(priceNum) || isNaN(gallonsNum)) {
      showError('Please enter valid numeric values');
      return;
    }

    if (milesNum <= 0 || priceNum <= 0 || gallonsNum <= 0) {
      showError('Values must be greater than zero');
      return;
    }

    // Format SMS body: [miles] [price] [gallons] - round to 3 decimals
    const smsBody = `${miles} ${parseFloat(priceNum.toFixed(3))} ${parseFloat(gallonsNum.toFixed(3))}`;
    const smsUrl = `sms:503-512-9929&body=${encodeURIComponent(smsBody)}`;

    // Open SMS link
    window.location.href = smsUrl;
  }

  /**
   * Handle back button - return to capture view
   */
  function handleBack() {
    // Clear state
    state.uploadedFiles = [];
    state.extractedData = null;

    // Reset photo input
    elements.photosFile.value = '';
    elements.previewsContainer.innerHTML = '';
    elements.extractBtn.disabled = true;

    // Clear form fields
    elements.gallons.value = '';
    elements.price.value = '';
    elements.total.value = '';
    elements.miles.value = '';

    // Reset confidence displays
    elements.gallonsConfidence.classList.remove('high', 'medium', 'low');
    elements.priceConfidence.classList.remove('high', 'medium', 'low');
    elements.totalConfidence.classList.remove('high', 'medium', 'low');
    elements.milesConfidence.classList.remove('high', 'medium', 'low');
    elements.pumpConfidence.classList.remove('high', 'medium', 'low');
    elements.odometerConfidence.classList.remove('high', 'medium', 'low');

    // Hide any errors
    hideError();

    // Show capture view
    showView('capture');
  }

  /**
   * Switch between views
   */
  function showView(viewName) {
    // Hide all views
    Object.values(elements.views).forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });

    // Show requested view
    const targetView = elements.views[viewName];
    if (targetView) {
      targetView.classList.remove('hidden');
      targetView.classList.add('active');
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

  // Public API
  return {
    init
  };
})();

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
