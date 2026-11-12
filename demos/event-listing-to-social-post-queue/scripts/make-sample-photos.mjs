// Draws the made-up listing photos in sample-data/photos/ (abstract road scenes, no real places or people).
// Run once: node demos/event-listing-to-social-post-queue/scripts/make-sample-photos.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-data', 'photos');
const scenes = [
  ['coastal-run', '#f7b267', '#f25c54', '#274060', '#1b2845'],
  ['moorland-loop', '#a8dadc', '#457b9d', '#3a5a40', '#1d3557'],
  ['classic-show', '#ffd6a5', '#ff9770', '#6d597a', '#355070'],
  ['night-ride', '#3c096c', '#10002b', '#240046', '#0b090a'],
  ['track-day', '#caf0f8', '#48cae4', '#495057', '#212529'],
  ['charity-ride', '#ffe5b4', '#f4978e', '#588157', '#344e41'],
  ['autojumble', '#e9edc9', '#ccd5ae', '#a98467', '#6c584c'],
  ['skills-morning', '#bde0fe', '#a2d2ff', '#52796f', '#2f3e46'],
  ['coffee-meet', '#fec89a', '#f8961e', '#7f5539', '#3c2a21'],
  ['trail-taster', '#d8f3dc', '#95d5b2', '#40916c', '#1b4332'],
];
const svg = ([, sky1, sky2, hill, ground], i) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
  <rect width="1200" height="900" fill="url(#s)"/>
  <circle cx="${250 + i * 70}" cy="${220 + (i % 3) * 40}" r="90" fill="#fff" opacity=".55"/>
  <path d="M0 ${520 - (i % 4) * 20} Q 300 ${380 + i * 6} 600 ${500 - i * 5} T 1200 ${470 + (i % 3) * 20} V900 H0Z" fill="${hill}" opacity=".85"/>
  <path d="M0 620 Q 400 ${540 + (i % 5) * 12} 800 610 T 1200 600 V900 H0Z" fill="${ground}"/>
  <path d="M${520 + (i % 3) * 40} 600 L 80 900 H 1120 L ${640 + (i % 3) * 40} 600Z" fill="#2b2d33"/>
  <path d="M${580 + (i % 3) * 40} 610 L ${590 + (i % 3) * 20} 900" stroke="#f5f1e6" stroke-width="10" stroke-dasharray="46 40" fill="none"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
for (const [i, scene] of scenes.entries()) {
  await page.setContent(`<body style="margin:0">${svg(scene, i)}</body>`);
  await page.screenshot({ path: path.join(out, `${scene[0]}.jpg`), type: 'jpeg', quality: 82 });
}
await browser.close();
console.log(`Drew ${scenes.length} sample photos in ${out}`);
