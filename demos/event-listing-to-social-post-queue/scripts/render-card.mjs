// Renders one square image card (1080 x 1080 JPEG) from a listing photo, the event name, date and place.
// Reads a JSON job on stdin: { photo_path, title, date, location, site, out }. Used by the demo helper; nothing is uploaded.
// JPEG, because Instagram's publishing API accepts JPEG only.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const job = JSON.parse(readFileSync(0, 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const photo = `data:image/jpeg;base64,${readFileSync(job.photo_path).toString('base64')}`;
const size = job.title.length > 34 ? 68 : 84;

const html = `<!doctype html><html><body style="margin:0">
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;background:#14213D">
  <img src="${photo}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,33,61,.05) 30%,rgba(20,33,61,.93) 78%)"></div>
  <div style="position:absolute;left:64px;top:64px;background:#FF6B5B;border-radius:999px;padding:16px 30px;font-size:34px;font-weight:700">${esc(job.date)}</div>
  <div style="position:absolute;left:64px;right:64px;bottom:72px">
    <div style="font-size:${size}px;font-weight:800;line-height:1.05;letter-spacing:-1px">${esc(job.title)}</div>
    <div style="font-size:38px;margin-top:22px;opacity:.92">${esc(job.location)}</div>
    <div style="font-size:28px;margin-top:30px;opacity:.7">${esc(job.site)}</div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: job.out, type: 'jpeg', quality: 88 });
} finally {
  await browser.close();
}
console.log(job.out);
