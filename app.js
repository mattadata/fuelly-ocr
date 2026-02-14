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
    extractedData: null
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

    // Show processing view
    showView('processing');
    elements.processingStatus.textContent = 'Analyzing images...';

    try {
      // Parallel OCR processing for both images
      const [pumpOcr, odometerOcr] = await Promise.all([
        OCR.extractText(state.pumpImage),
        OCR.extractText(state.odometerImage)
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
      if (!pumpData.gallons.value || !pumpData.pricePerGallon.value || !odometerData.miles.value) {
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
