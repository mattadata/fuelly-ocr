/**
 * Main Application Module
 * Handles photo capture, OCR processing, form population,
 * SMS link generation, and view management
 */

const App = (function() {
  'use strict';

  // Application state
  const state = {
    pumpImage: null,
    odometerImage: null,
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
    pumpFile: null,
    odometerFile: null,
    pumpPreview: null,
    odometerPreview: null,
    pumpPhotoInput: null,
    odometerPhotoInput: null,
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
    // Debug display removed for production
    // setupDebugDisplay();
  }

  /**
   * Set up debug display for OCR output (development only)
   */
  function setupDebugDisplay() {
    // Debug disabled for production
    return;

    // Create settings container
    let settingsContainer = document.getElementById('settings-panel');
    if (!settingsContainer) {
      settingsContainer = document.createElement('div');
      settingsContainer.id = 'settings-panel';
      settingsContainer.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 10000;';
      settingsContainer.innerHTML = `
        <button id="settings-btn" style="background: #1a1a2e; color: white; border: 1px solid #444; padding: 8px 12px; border-radius: 4px; cursor: pointer;">⚙️ API Key</button>
        <div id="api-key-panel" class="hidden" style="background: rgba(26,26,46,0.95); color: white; padding: 15px; border-radius: 8px; margin-top: 5px; min-width: 300px; border: 1px solid #444;">
          <h3 style="margin: 0 0 10px 0; font-size: 14px;">Google Cloud Vision API</h3>
          <p style="margin: 0 0 10px 0; font-size: 11px; opacity: 0.8;">Required for reading pump LCD displays. Get key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: #4CAF50;">Google Cloud Console</a></p>
          <input type="text" id="api-key-input" placeholder="Paste API key here..." style="width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #444; background: #2a2a3e; color: white; box-sizing: border-box;">
          <button id="save-key-btn" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; width: 100%;">Save Key</button>
        </div>
      `;
      document.body.appendChild(settingsContainer);

      // Toggle panel
      document.getElementById('settings-btn').addEventListener('click', function() {
        const panel = document.getElementById('api-key-panel');
        panel.classList.toggle('hidden');
      });

      // Save key
      document.getElementById('save-key-btn').addEventListener('click', function() {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
          OCR.setApiKey(key);
          document.getElementById('api-key-panel').classList.add('hidden');
          state.debugLog.push('API key saved!');
        }
      });

      // Load existing key
      const existingKey = OCR.getApiKey();
      if (existingKey) {
        document.getElementById('api-key-input').value = existingKey;
      }
    }

    // Create debug container
    let debugContainer = document.getElementById('debug-output');
    if (!debugContainer) {
      debugContainer = document.createElement('div');
      debugContainer.id = 'debug-output';
      debugContainer.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.9); color: #0f0; font-family: monospace; font-size: 11px; padding: 10px; z-index: 9999; border-top: 2px solid #0f0;';
      document.body.appendChild(debugContainer);
    }

    // Set up OCR debug callback
    OCR.setDebugCallback(function(message) {
      state.debugLog.push(message);
      debugContainer.innerHTML = state.debugLog.map(m => `<div>${m}</div>`).join('');
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
    elements.pumpFile = document.getElementById('pump-file');
    elements.odometerFile = document.getElementById('odometer-file');
    elements.pumpPreview = document.getElementById('pump-preview');
    elements.odometerPreview = document.getElementById('odometer-preview');
    elements.pumpPhotoInput = document.getElementById('pump-photo-input');
    elements.odometerPhotoInput = document.getElementById('odometer-photo-input');

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
    elements.pumpFile.addEventListener('change', handlePumpPhoto);
    elements.odometerFile.addEventListener('change', handleOdometerPhoto);
    elements.extractBtn.addEventListener('click', handleExtract);
    elements.sendSmsBtn.addEventListener('click', handleSendSms);
    elements.backBtn.addEventListener('click', handleBack);
    elements.dismissError.addEventListener('click', hideError);
  }

  /**
   * Handle pump photo file selection
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

      // Show preview
      elements.pumpPreview.src = state.pumpImage;
      elements.pumpPreview.classList.remove('hidden');
      elements.pumpPhotoInput.classList.add('has-image');

      updateExtractButton();
    };
    reader.onerror = function() {
      showError('Failed to read pump photo');
    };
    reader.readAsDataURL(file);
  }

  /**
   * Handle odometer photo file selection
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

      // Show preview
      elements.odometerPreview.src = state.odometerImage;
      elements.odometerPreview.classList.remove('hidden');
      elements.odometerPhotoInput.classList.add('has-image');

      updateExtractButton();
    };
    reader.onerror = function() {
      showError('Failed to read odometer photo');
    };
    reader.readAsDataURL(file);
  }

  /**
   * Update extract button state (enabled only when both photos present)
   */
  function updateExtractButton() {
    elements.extractBtn.disabled = !(state.pumpImage && state.odometerImage);
  }

  /**
   * Handle extract button click - process images with OCR
   */
  async function handleExtract() {
    hideError();
    state.debugLog = []; // Clear debug log

    // Show processing view
    showView('processing');
    elements.processingStatus.textContent = 'Analyzing images...';

    try {
      // Use Vision API for pump (LCD display), Tesseract for odometer
      const [pumpOcr, odometerOcr] = await Promise.all([
        OCR.extractText(state.pumpImage, true),   // true = use Vision API (pump)
        OCR.extractText(state.odometerImage, false) // false = use Tesseract (odometer)
      ]);

      // Parse extracted data
      const pumpData = OCR.parsePumpData(pumpOcr);
      const odometerData = OCR.parseOdometerData(odometerOcr);

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
      showError('Failed to analyze images: ' + error.message);
    }
  }

  /**
   * Populate the review form with extracted data
   */
  function populateReviewForm(pumpData, odometerData) {
    // Populate pump data fields
    elements.gallons.value = pumpData.gallons.value || '';
    elements.price.value = pumpData.pricePerGallon.value || '';
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

    // Format SMS body: [miles] [price] [gallons]
    const smsBody = `${miles} ${price} ${gallons}`;
    const smsUrl = `sms:503-512-9929&body=${encodeURIComponent(smsBody)}`;

    // Open SMS link
    window.location.href = smsUrl;
  }

  /**
   * Handle back button - return to capture view
   */
  function handleBack() {
    // Clear state
    state.pumpImage = null;
    state.odometerImage = null;
    state.extractedData = null;

    // Reset photo inputs
    elements.pumpFile.value = '';
    elements.odometerFile.value = '';
    elements.pumpPreview.src = '';
    elements.odometerPreview.src = '';
    elements.pumpPreview.classList.add('hidden');
    elements.odometerPreview.classList.add('hidden');
    elements.pumpPhotoInput.classList.remove('has-image');
    elements.odometerPhotoInput.classList.remove('has-image');

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

    // Disable extract button
    elements.extractBtn.disabled = true;

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
