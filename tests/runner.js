// tests/runner.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_DIR = path.join(__dirname, 'images-converted');

/**
 * Parse expected values from filename
 * Examples:
 *   pump_9.811_gallons_35.51_total.jpg
 *   odometer_168237_miles.jpg
 */
function parseFilename(filename) {
  const name = path.basename(filename, path.extname(filename));
  const parts = name.split('_');

  const result = { filename };

  if (parts[0] === 'pump') {
    result.type = 'pump';
    // Format: pump_<gallons>_gallons_<total>_total
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'gallons' && i > 1) {
        result.gallons = parseFloat(parts[i - 1]);
      } else if (parts[i] === 'total' && i > 1) {
        result.total = parseFloat(parts[i - 1]);
      }
    }
  } else if (parts[0] === 'odometer') {
    result.type = 'odometer';
    // Format: odometer_<miles> or odometer_<miles>_miles
    for (let i = 1; i < parts.length; i++) {
      const num = parseInt(parts[i]);
      if (!isNaN(num) && num > 10000) {
        result.miles = num;
        break;
      }
    }
  }

  return result;
}

/**
 * Load test images from directory
 */
function loadTestImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('No test images directory found.');
    return [];
  }

  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png|heic)$/i.test(f));

  return files.map(parseFilename);
}

/**
 * Convert file to base64 data URL
 */
function fileToBase64(filepath) {
  const buffer = fs.readFileSync(filepath);
  const ext = path.extname(filepath).slice(1);
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Preprocess image for better OCR accuracy
 * - Upscales to at least 2000px
 * - Enhances contrast
 * - Applies sharpening
 */
async function preprocessImage(filepath) {
  const image = sharp(filepath);
  const metadata = await image.metadata();

  // Calculate upscale factor if needed
  const minWidth = 2000;
  const scale = metadata.width < minWidth ? minWidth / metadata.width : 1;

  // Process: resize, grayscale, enhance contrast, sharpen
  const processed = await image
    .resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), {
      kernel: sharp.kernel.lanczos3
    })
    .grayscale()
    .linear(1.5, -(0.5 * 255)) // Contrast enhancement: a=1.5, b=-0.5*255
    .sharpen({
      sigma: 1,
      m1: 0,
      m2: 3,
      x1: 2,
      y2: 10
    })
    .jpeg({ quality: 95 })
    .toBuffer();

  return `data:image/jpeg;base64,${processed.toString('base64')}`;
}

/**
 * Parse pump data from OCR text
 */
function parsePumpData(text) {
  let gallons = null;
  let gallonsDigits = null;  // Track which digits were used for gallons

  // Pre-clean: handle OCR artifacts like "10. 19" -> "10.19"
  let cleanedText = text.replace(/(\d+)\.\s+(\d{2})\b/g, '$1.$2');

  // Match 3-decimal number for gallons
  const gallonsMatch = cleanedText.match(/\b(\d{1,2}\.\d{3})\b/);
  gallons = gallonsMatch ? parseFloat(gallonsMatch[1]) : null;

  // HEURISTIC: If no gallons found with decimal, try 5-digit number
  if (!gallons) {
    const noDecimalPattern = /\b(\d{4,5})\b/g;
    const candidates = [...cleanedText.matchAll(noDecimalPattern)];

    for (const match of candidates) {
      const digits = match[1];
      // Try inserting decimal after 1-2 digits for gallons
      for (let decimalPos = 1; decimalPos <= 2; decimalPos++) {
        const withDecimal = parseFloat(
          digits.slice(0, decimalPos) + '.' + digits.slice(decimalPos)
        );
        // Valid gallons range: 1-25, with 3 decimal places
        if (withDecimal >= 1 && withDecimal <= 25 && digits.length === decimalPos + 3) {
          gallons = withDecimal;
          gallonsDigits = digits;
          break;
        }
      }
      if (gallons) break;
    }
  }

  // Match 2-decimal number for total ($10-$500 range)
  let total = null;
  const totalPattern = /\$?\s*(\d{1,3}\.\d{2})\b/g;
  let match;
  while ((match = totalPattern.exec(cleanedText)) !== null) {
    const value = parseFloat(match[1]);
    if (value >= 10 && value <= 500) {
      total = value;
      break;
    }
  }

  // HEURISTIC: If no total found with decimal, try 4-digit number
  if (!total) {
    const noDecimalPattern = /\b(\d{4})\b/g;
    const candidates = [...cleanedText.matchAll(noDecimalPattern)];

    for (const match of candidates) {
      const digits = match[1];
      // Skip if these digits were already used for gallons
      if (gallonsDigits && digits === gallonsDigits) continue;

      // Try inserting decimal after 2-3 digits for total
      for (let decimalPos = 2; decimalPos <= 3; decimalPos++) {
        const withDecimal = parseFloat(
          digits.slice(0, decimalPos) + '.' + digits.slice(decimalPos)
        );
        // Valid total range: $10-$500
        if (withDecimal >= 10 && withDecimal <= 500) {
          total = withDecimal;
          break;
        }
      }
      if (total) break;
    }
  }

  return { gallons, total };
}

/**
 * Parse odometer data from OCR text
 */
function parseOdometerData(text) {
  // Match 5-6 digit number
  const matches = text.match(/\b(\d{5,6})\b/g);
  if (!matches) return { miles: null };

  // Return the highest number (odometer)
  const miles = Math.max(...matches.map(m => parseInt(m)));
  return { miles };
}

/**
 * Run tests
 */
async function runTests(workerUrl) {
  const tests = loadTestImages();

  if (tests.length === 0) {
    console.log('No tests to run. Add images to tests/images/');
    return;
  }

  console.log(`Running ${tests.length} tests...\n`);

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const filepath = path.join(IMAGES_DIR, test.filename);

    try {
      // Preprocess image for better OCR
      const imageData = await preprocessImage(filepath);

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Bypass': 'fuelly-test-2024'
        },
        body: JSON.stringify({ image: imageData })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      // Worker returns {success: true, data: {text, lines}}
      const text = result.data?.text || result.text || '';

      console.log(`\n${test.filename}`);
      console.log(`  RAW OCR: "${text.slice(0, 200)}${text.length > 200 ? '...' : ''}"`);

      if (test.type === 'pump') {
        const { gallons, total } = parsePumpData(text);

        const gallonsMatch = test.gallons && gallons && Math.abs(gallons - test.gallons) < 0.01;
        const totalMatch = test.total && total && Math.abs(total - test.total) < 0.1;

        if (test.gallons) {
          console.log(`  - Gallons: ${gallons ?? 'NOT FOUND'} (expected ${test.gallons}) ${gallonsMatch ? '✓' : '✗'}`);
        }
        if (test.total) {
          console.log(`  - Total: ${total ?? 'NOT FOUND'} (expected ${test.total}) ${totalMatch ? '✓' : '✗'}`);
        }

        if (gallonsMatch && totalMatch) {
          console.log('  ✓ PASS');
          passed++;
        } else {
          console.log('  ✗ FAIL');
          failed++;
        }

      } else if (test.type === 'odometer') {
        const { miles } = parseOdometerData(text);
        const milesMatch = test.miles && miles && miles === test.miles;

        if (test.miles) {
          console.log(`  - Miles: ${miles ?? 'NOT FOUND'} (expected ${test.miles}) ${milesMatch ? '✓' : '✗'}`);
        }

        if (milesMatch) {
          console.log('  ✓ PASS');
          passed++;
        } else {
          console.log('  ✗ FAIL');
          failed++;
        }
      }

    } catch (error) {
      console.log(`\n${test.filename}`);
      console.log(`  ✗ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`${passed}/${tests.length} tests passed`);
  if (failed > 0) {
    console.log(`${failed} tests failed`);
    process.exit(1);
  }
}

// Get worker URL from argument or env
const workerUrl = process.argv[2] || process.env.FUELLY_WORKER_URL;

if (!workerUrl) {
  console.error('Please provide Worker URL:');
  console.error('  node tests/runner.js https://your-worker.workers.dev');
  process.exit(1);
}

runTests(workerUrl).catch(console.error);
