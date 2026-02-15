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
    uploadLabelText: null,
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
    // Create debug container (hidden by default)
    let debugContainer = document.getElementById('debug-output');
    if (!debugContainer) {
      debugContainer = document.createElement('div');
      debugContainer.id = 'debug-output';
      debugContainer.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 400px; max-height: 50vh; overflow-y: auto; background: rgba(0,0,0,0.95); color: #0f0; font-family: monospace; font-size: 12px; padding: 12px; z-index: 9999; border: 2px solid #0f0; border-radius: 8px; word-break: break-word;';
      document.body.appendChild(debugContainer);
    }

    // Set up OCR debug callback
    OCR.setDebugCallback(function(message) {
      state.debugLog.push(message);
      debugContainer.innerHTML = '<div style="position: sticky; top: 0; background: rgba(0,0,0,0.95); padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #0f0;"><strong>DEBUG LOG (tap to dismiss)</strong></div>' + state.debugLog.slice(-30).map(m => `<div style="margin: 2px 0; line-height: 1.4;">${m}</div>`).join('');
      debugContainer.scrollTop = debugContainer.scrollHeight;
    });

    // Tap to dismiss
    debugContainer.addEventListener('click', function() {
      debugContainer.style.display = 'none';
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
    elements.uploadLabelText = document.getElementById('upload-label-text');
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
    console.log('handlePhotosUpload called, files:', e.target.files);
    const newFiles = Array.from(e.target.files);

    if (newFiles.length === 0) return;

    // Validate all are images
    for (const file of newFiles) {
      if (!file.type.startsWith('image/')) {
        showError('Please select only image files');
        return;
      }
    }

    // Check total limit (2 photos max)
    if (state.uploadedFiles.length + newFiles.length > 2) {
      showError('Maximum 2 photos allowed. Remove some first.');
      return;
    }

    // Append new files to existing
    const startIndex = state.uploadedFiles.length;
    state.uploadedFiles = [...state.uploadedFiles, ...newFiles];
    console.log('Total files now:', state.uploadedFiles.length);

    // Update upload label immediately
    updateUploadLabel();

    // Read and display previews for new files
    let loadedCount = 0;

    newFiles.forEach((file, i) => {
      const actualIndex = startIndex + i;
      console.log('Reading file', i, file.name, file.type, file.size);

      const reader = new FileReader();

      reader.onload = function(event) {
        console.log('File loaded:', file.name, 'data length:', event.target.result?.length);

        try {
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
          removeBtn.type = 'button';
          removeBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 16px; cursor: pointer;';
          removeBtn.onclick = function() {
            removePhoto(actualIndex);
          };
          previewDiv.appendChild(removeBtn);

          elements.previewsContainer.appendChild(previewDiv);
          console.log('Preview appended, container children:', elements.previewsContainer.children.length);

          loadedCount++;
          if (loadedCount === newFiles.length) {
            // All new photos loaded, enable extract button
            elements.extractBtn.disabled = false;
            console.log('All photos loaded, extract button enabled');
          }
        } catch (err) {
          console.error('Error creating preview:', err);
          showError('Error creating preview: ' + err.message);
        }
      };

      reader.onerror = function(err) {
        console.error('FileReader error:', err);
        showError('Error reading file: ' + file.name);
      };

      reader.readAsDataURL(file);
    });

    // Clear file input so same files can be selected again if needed
    elements.photosFile.value = '';
  }

  /**
   * Update the upload button label based on how many photos are selected
   */
  function updateUploadLabel() {
    const count = state.uploadedFiles.length;
    if (count === 0) {
      elements.uploadLabelText.textContent = 'Tap to select photos';
    } else if (count === 1) {
      elements.uploadLabelText.textContent = '1/2 photos • Tap to add another';
    } else {
      elements.uploadLabelText.textContent = '2/2 photos selected';
    }
  }

  /**
   * Remove a specific photo by index
   */
  function removePhoto(index) {
    state.uploadedFiles = state.uploadedFiles.filter((_, i) => i !== index);

    // Clear file input
    elements.photosFile.value = '';

    // Rebuild previews
    elements.previewsContainer.innerHTML = '';
    if (state.uploadedFiles.length === 0) {
      elements.extractBtn.disabled = true;
      updateUploadLabel();
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
          updateUploadLabel();
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
    let debugContainer = document.getElementById('debug-output');

    if (state.uploadedFiles.length === 0) {
      showError('Please upload at least one photo');
      return;
    }

    // Show processing view
    showView('processing');
    elements.processingStatus.textContent = 'Analyzing images...';

    try {
      // Process photos sequentially to avoid rate limiting
      const ocrResults = [];
      for (let i = 0; i < state.uploadedFiles.length; i++) {
        const file = state.uploadedFiles[i];
        elements.processingStatus.textContent = `Processing photo ${i + 1} of ${state.uploadedFiles.length}...`;

        const result = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const ocrResult = await OCR.extractText(event.target.result, true);
            resolve(ocrResult);
          };
          reader.readAsDataURL(file);
        });
        ocrResults.push(result);

        // Small delay between requests to avoid rate limiting
        if (i < state.uploadedFiles.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      console.log('OCR results received:', ocrResults.length);

      // Auto-detect which photo is pump vs odometer
      const { pumpData, odometerData } = detectAndParseData(ocrResults);

      // Store extracted data
      state.extractedData = {
        pump: pumpData,
        odometer: odometerData
      };

      console.log('Extracted data:', pumpData, odometerData);

      // Validate that we got at least some data
      if (!pumpData.gallons.value && !odometerData.miles.value) {
        console.log('No data extracted at all');
        showView('capture');
        showError('Could not extract any data. Please try with clearer photos.');
        return;
      }

      console.log('Showing review view');

      // Log summary to console
      console.log('=== EXTRACTION SUMMARY ===');
      console.log('Gallons:', pumpData.gallons.value || 'NOT FOUND');
      console.log('Price:', pumpData.pricePerGallon.value?.toFixed(3) || 'NOT FOUND');
      console.log('Total:', pumpData.total.value || 'NOT FOUND');
      console.log('Miles:', odometerData.miles.value || 'NOT FOUND');
      console.log('=========================');

      // Add to debug log and update display
      state.debugLog.push('=== SUMMARY ===');
      state.debugLog.push('Gallons: ' + (pumpData.gallons.value || 'NOT FOUND'));
      state.debugLog.push('Price: ' + (pumpData.pricePerGallon.value?.toFixed(3) || 'NOT FOUND'));
      state.debugLog.push('Total: ' + (pumpData.total.value || 'NOT FOUND'));
      state.debugLog.push('Miles: ' + (odometerData.miles.value || 'NOT FOUND'));
      state.debugLog.push('================');

      if (debugContainer) {
        debugContainer.innerHTML = '<div style="position: sticky; top: 0; background: rgba(0,0,0,0.95); padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #0f0;"><strong>DEBUG LOG (tap to dismiss)</strong></div>' + state.debugLog.slice(-30).map(m => `<div style="margin: 2px 0; line-height: 1.4;">${m}</div>`).join('');
      }

      // Populate and show review form (even if partial data - user can fill in missing)
      populateReviewForm(pumpData, odometerData);

      showView('review');

    } catch (error) {
      console.error('OCR extraction error:', error);
      state.debugLog.push('ERROR: ' + error.message);
      if (debugContainer) {
        debugContainer.innerHTML = '<div style="position: sticky; top: 0; background: rgba(0,0,0,0.95); padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #0f0;"><strong>DEBUG LOG (tap to dismiss)</strong></div>' + state.debugLog.slice(-30).map(m => `<div style="margin: 2px 0; line-height: 1.4;">${m}</div>`).join('');
      }
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

      console.log('Photo ' + (i + 1) + ' contains:', text.substring(0, 100));

      // Check for pump indicators
      const hasGallons = text.includes('gallon') || text.includes('gal');
      const hasSale = text.includes('sale') || text.includes('$') || text.includes('price');
      const hasOdometer = text.includes('odometer') || text.includes('odo') || /\b\d{5,6}\b/.test(text);

      console.log('Photo ' + (i + 1) + ' - Gallons:', hasGallons, 'Sale:', hasSale, 'Odometer:', hasOdometer);

      if (hasGallons || hasSale) {
        // This is likely the pump
        const parsed = OCR.parsePumpData(result);
        if (parsed.gallons.value) {
          pumpData = parsed;
          console.log('Photo ' + (i + 1) + ' identified as PUMP');
        }
      }

      if (hasOdometer) {
        // This is likely the odometer
        const parsed = OCR.parseOdometerData(result);
        if (parsed.miles.value) {
          odometerData = parsed;
          console.log('Photo ' + (i + 1) + ' identified as ODOMETER');
        }
      }
    }

    // If detection failed, use fallback: assign first result as pump, second as odometer
    if (!pumpData.gallons.value && !odometerData.miles.value) {
      console.log('Auto-detection failed, using fallback assignment');

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

    // Reset upload label
    updateUploadLabel();

    // Hide any errors
    hideError();

    // Show capture view
    showView('capture');
  }

  /**
   * Switch between views
   */
  function showView(viewName) {
    console.log('showView called with:', viewName);
    // Hide all views
    Object.values(elements.views).forEach(view => {
      view.classList.remove('active');
      view.classList.add('hidden');
    });

    // Show requested view
    const targetView = elements.views[viewName];
    console.log('Target view element:', targetView);
    if (targetView) {
      targetView.classList.remove('hidden');
      targetView.classList.add('active');
      console.log('View switched to:', viewName);
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
