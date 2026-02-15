// tests/runner.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_DIR = path.join(__dirname, 'images');

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
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === 'miles' && i + 1 < parts.length) {
        result.miles = parseInt(parts[i + 1]);
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
 * Parse pump data from OCR text
 */
function parsePumpData(text) {
  // Match 3-decimal number for gallons
  const gallonsMatch = text.match(/\b(\d{1,2}\.\d{3})\b/);
  const gallons = gallonsMatch ? parseFloat(gallonsMatch[1]) : null;

  // Match 2-decimal number for total ($10-$500 range)
  const totalPattern = /\$?\s*(\d{1,3}\.\d{2})\b/g;
  let total = null;
  let match;
  while ((match = totalPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (value >= 10 && value <= 500) {
      total = value;
      break;
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
    const imageData = fileToBase64(filepath);

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      // Worker returns {success: true, data: {text, lines}}
      const text = result.data?.text || result.text || '';

      console.log(`\n${test.filename}`);

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
