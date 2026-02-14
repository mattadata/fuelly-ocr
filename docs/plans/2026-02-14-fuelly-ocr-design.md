# Fuelly OCR Web App - Design Document

**Date:** 2026-02-14
**Status:** Approved
**Author:** Claude

## Overview

A Progressive Web App (PWA) for iPhone that extracts gasoline sales data from gas pump displays and odometer readings from photos, then sends the data to Fuelly via SMS.

## Problem Statement

When fueling up, users must manually:
1. Remember or write down pump data (gallons, price, total)
2. Remember or write down odometer reading
3. Manually format and send SMS to Fuelly

This app automates the extraction process using OCR.

## Architecture

### Technology Stack
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **OCR:** Tesseract.js (client-side)
- **Deployment:** Static hosting (no backend required)
- **Platform:** PWA for iOS Safari

### System Architecture

```
┌─────────────────────────────────────────┐
│  PWA Manifest + Service Worker          │
│  ┌─────────────────────────────────────┐ │
│  │  Main App (Vanilla JS + HTML)      │ │
│  │  ┌───────────────────────────────┐  │ │
│  │  │  Tesseract.js OCR Engine      │  │ │
│  │  │  - Image preprocessing        │  │ │
│  │  │  - Number extraction           │  │ │
│  │  │  - Confidence scoring         │  │ │
│  │  └───────────────────────────────┘  │ │
│  │                                     │ │
│  │  ┌───────────────────────────────┐  │ │
│  │  │  SMS Link Generator           │  │ │
│  │  │  Format: [miles] [price] [gal] │  │ │
│  │  └───────────────────────────────┘  │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Key Design Decisions:**
- **No backend:** Everything runs client-side for simplicity and privacy
- **Session-scoped:** No persistent storage of user data
- **Offline-capable:** Tesseract language pack cached locally after first load
- **SMS via link:** Uses `sms:` protocol to let user confirm and send

## User Flow

```
1. Launch App
   └─→ Permissions request (camera access)

2. Photo Capture Screen
   ├─→ [Gas Pump Photo] input/camera
   ├─→ [Odometer Photo] input/camera
   └─→ [Extract] button

3. Processing State
   └─→ Loading spinner with "Analyzing images..."
   └─→ Parallel OCR processing

4. Review & Confirm Screen
   ├─→ Gas Pump Data (with confidence scores)
   │   ├─→ Gallons: [editable]
   │   ├─→ Price/gal: [editable]
   │   └─→ Total: [editable]
   ├─→ Odometer Data (with confidence score)
   │   └─→ Miles: [editable]
   └─→ [Send SMS to Fuelly] button

5. SMS Launch
   └─→ Opens Messages app with pre-filled data
   └─→ User taps Send to complete
```

## Components & Layout

### Single-Page App Structure

Three views managed via CSS visibility:

**1. Photo Capture View**
- Two photo input areas (pump + odometer)
- Camera capture button
- File picker fallback
- Extract button

**2. Processing View**
- Loading spinner
- Status message

**3. Review & Confirm View**
- Extracted data display with confidence scores
- Editable input fields
- Send SMS button

### Layout Notes
- Portrait-locked layout
- Touch-friendly buttons (min 44px height)
- High contrast for readability
- Responsive to different iPhone screen sizes

## OCR Strategy

### Image Processing Pipeline

```
1. Image Input
   └─→ File/Blob from camera or gallery
   └─→ Base64 conversion for preview

2. Preprocessing (Tesseract.js)
   ├─→ Grayscale conversion
   ├─→ Contrast enhancement
   └─→ Resize to ~2000px width

3. Text Extraction
   ├─→ Gas Pump: Extract numbers + currency
   │   └─→ Pattern match: gallons (X.XX), price (X.XXX), total ($XX.XX)
   ├─→ Odometer: Extract 5-6 digit number
   └─→ Each result gets confidence score (0-100)

4. Validation & Fallback
   ├─→ If gallons missing but total + price exist → calculate gallons
   ├─→ If confidence < 60% → flag for user review
   └─→ If no numbers found → show error, allow retry

5. SMS Formatting
   └─→ Format: "{miles} {price} {gallons}"
   └─→ Remove commas from miles
   └─→ Example: "45230 3.599 12.45"
```

### Tesseract.js Configuration
- **Language:** English (`eng`)
- **Parameters:** `preserve_interword_spaces='1'`
- **Character whitelist:** Digits, decimal point, dollar sign, comma

## Data Model

### Extracted Data Structure
```javascript
{
  pump: {
    gallons: { value: 12.45, confidence: 87 },
    pricePerGallon: { value: 3.599, confidence: 92 },
    total: { value: 44.81, confidence: 95 }
  },
  odometer: {
    miles: { value: 45230, confidence: 89 }
  }
}
```

### SMS Format
- **Target:** 503-512-9929
- **Body:** `[miles] [price] [gallons]`
- **Example:** `45230 3.599 12.45`

## Error Handling

| Scenario | Handling |
|----------|----------|
| Camera permission denied | Message + file picker option |
| Photo too blurry/low quality | Warning banner, allow retry |
| No numbers found in pump photo | Error + manual entry option |
| No numbers found in odometer | Error + retry |
| Low confidence (<60%) | Yellow warning indicator |
| Missing pump values | Calculate if possible, otherwise flag |
| SMS link fails | Show formatted text to copy-paste |
| Tesseract load fails | Retry message |
| Network timeout (language pack) | Progress bar + one-time download message |

### Input Validation
- Gallons: 1-100 range
- Price/gal: $1.00-$10.00 range
- Miles: positive integer
- Total vs calculated: should match within 5%

## File Structure

```
fuelly-ocr/
├── index.html          # Main HTML, PWA manifest inline
├── styles.css          # All styling
├── app.js              # Main app logic
├── ocr.js              # Tesseract.js wrapper & image processing
├── sw.js               # Service worker for offline capability
├── manifest.json       # PWA manifest
└── icons/              # App icons (192x192, 512x512)
    ├── icon-192.png
    └── icon-512.png
```

## Testing Strategy

### 1. OCR Accuracy Testing
- Various pump display types (digital, LCD, LED)
- Different odometer styles (digital, analog)
- Edge cases: glare, shadows, angled photos, blur

### 2. User Flow Testing
- Camera vs. photo picker
- Permissions flow
- SMS link generation on iPhone
- Edit/override functionality

### 3. Cross-browser Testing
- Safari on iOS (primary)
- Chrome/Safari on desktop (debugging)
- PWA install flow

### 4. Integration Testing
- SMS format verification
- Actual fuel-up submission to Fuelly

### 5. Performance
- Tesseract initial load time
- OCR processing time
- Memory usage on iPhone

## Future Enhancements (Out of Scope)

- Backend API for direct Fuelly integration (no SMS)
- Multiple vehicle profiles
- Fuel-up history and statistics
- Cloud OCR fallback for better accuracy
- Android PWA support

## Success Criteria

- [ ] Successfully extracts pump data from test photos with >80% accuracy
- [ ] Successfully extracts odometer data from test photos with >90% accuracy
- [ ] SMS link opens Messages with correct format
- [ ] PWA installs to iPhone home screen
- [ ] App works offline after initial load
- [ ] User can edit extracted values before sending
