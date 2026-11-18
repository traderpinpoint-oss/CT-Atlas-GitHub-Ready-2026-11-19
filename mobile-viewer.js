'use strict';

// Mobile uses the existing scan bounds and source coordinates. The source
// image and every annotation layer receive the SAME uniform transformation.
const mobileViewport = matchMedia('(max-width: 1040px)');
let mobileOverview = false;
let mobileGeometry = null;
const touchPoints = new Map();
let touchGesture = null;
let suppressTouchClickUntil = 0;

function mobileZoomLimit() { return mobileViewport.matches ? 6 : 3; }

function fitMobileView() {
 if (!mobileViewport.matches) { mobileGeometry = null; return false; }
 const r = $('viewer').getBoundingClientRect();
 if (!r.width || !r.height) return true;
 const abdomen = activeSeries.id === 'abdomen';
 const stageWidth = abdomen ? viewWidth : activeSeries.stageWidth || (activeSeries.id === 'cardiac' ? 1553 : 1562);
 const stageHeight = abdomen ? visibleHeight : activeSeries.stageHeight || (activeSeries.id === 'cardiac' ? 691 : 660);
 const [dx, dy] = headDisplayOffsets[views[index]?.id] || [0, 0];
 // Keep the same recorded UI clipping as desktop, never clip to scanBounds.
 const top = Math.max(0, -dy), left = Math.max(0, -dx);
 const right = Math.max(0, viewWidth - stageWidth + dx);
 const bottom = Math.max(viewHeight - visibleHeight, viewHeight - stageHeight + dy);
 const b = scanBounds();
 const area = mobileOverview
  ? {left, top, right: viewWidth - right, bottom: viewHeight - bottom}
  : {left: Math.max(left, b.left - 16), top: Math.max(top, b.top - 16),
     right: Math.min(viewWidth - right, b.right + 16), bottom: Math.min(viewHeight - bottom, b.bottom + 16)};
 // Reserve breathing room for scan edges and the small window readout.
 const padding = 8, readout = 30;
 const scale = Math.min(Math.max(1, r.width - 2 * padding) / (area.right - area.left),
                        Math.max(1, r.height - 2 * padding - readout) / (area.bottom - area.top));
 const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2;
 const center = {x: r.width / 2, y: (r.height - readout) / 2};
 mobileGeometry = {scale, center, width: r.width, height: r.height};
 Object.assign($('canvas').style, {
  width: viewWidth * scale + 'px', height: viewHeight * scale + 'px',
  left: center.x - cx * scale + 'px', top: center.y - cy * scale + 'px',
  clipPath: `inset(${top / viewHeight * 100}% ${right / viewWidth * 100}% ${bottom / viewHeight * 100}% ${left / viewWidth * 100}%)`,
  transformOrigin: `${cx * scale}px ${cy * scale}px`,
  transform: `translate(${panX}px,${panY}px) scale(${zoom})`
 });
 return true;
}

function updateMobileControls() {
 $('mobileSlice').max = views.length;
 $('mobileSlice').value = index + 1;
 $('mobileSlice').setAttribute('aria-valuetext', `View ${index + 1} of ${views.length}`);
 $('mobilePosition').textContent = `${index + 1} / ${views.length}`;
 $('previousView').disabled = index === 0;
 $('nextView').disabled = index === views.length - 1;
}

function resetMobileInteraction() {
 touchGesture = null;
 for (const id of touchPoints.keys()) {
  if ($('viewer').hasPointerCapture(id)) $('viewer').releasePointerCapture(id);
 }
 touchPoints.clear();
 $('canvas').classList.remove('dragging');
}

function resetMobileFit() {
 resetMobileInteraction();
 zoom = 1; panX = panY = 0; $('fit').textContent = 'Fit'; fit();
}

$('mobileOverview').onclick = () => {
 mobileOverview = !mobileOverview;
 $('mobileOverview').setAttribute('aria-pressed', String(mobileOverview));
 $('mobileOverview').textContent = mobileOverview ? 'Fit scan' : 'All labels';
 resetMobileFit();
};
$('mobileFit').onclick = resetMobileFit;
$('previousView').onclick = () => move(target - 1);
$('nextView').onclick = () => move(target + 1);
$('mobileSlice').oninput = e => move(Number(e.target.value) - 1);
$('fit').addEventListener('click', resetMobileInteraction);

function touchPosition(e) { return {x: e.clientX, y: e.clientY}; }
function beginTouchGesture() {
 const points = [...touchPoints.values()];
 if (points.length >= 2) {
  const [a, b] = points;
  touchGesture = {kind: 'pinch', distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
   x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, zoom, px: panX, py: panY};
  suppressTouchClickUntil = performance.now() + 800;
 } else if (points.length === 1) {
  touchGesture = {kind: contrastMode ? 'contrast' : zoom > 1 ? 'pan' : 'slice',
   ...points[0], px: panX, py: panY, contrast, brightness, moved: false};
 }
}

const touchViewer = $('viewer');
touchViewer.addEventListener('pointerdown', e => {
 if (e.pointerType !== 'touch' || placing) return;
 if (e.target.closest('#anchorDetails')) return;
 // Annotation buttons are part of the scan: let a tap select them, but allow
 // a swipe or pinch beginning on them without an accidental selection.
 if (e.target.closest('button') && !e.target.closest('.hotspot,.anchorPoint')) return;
 touchPoints.set(e.pointerId, touchPosition(e));
 beginTouchGesture();
});
touchViewer.addEventListener('pointermove', e => {
 if (e.pointerType !== 'touch' || !touchPoints.has(e.pointerId) || !touchGesture) return;
 touchPoints.set(e.pointerId, touchPosition(e));
 const g = touchGesture;
 const dx = e.clientX - g.x, dy = e.clientY - g.y;
 if (g.kind !== 'pinch' && !g.moved && Math.hypot(dx, dy) < 8) return;
 g.moved = true;
 suppressTouchClickUntil = performance.now() + 800;
 for (const id of touchPoints.keys()) if (!touchViewer.hasPointerCapture(id)) touchViewer.setPointerCapture(id);
 $('canvas').classList.add('dragging');
 if (g.kind === 'pinch') {
  const [a, b] = [...touchPoints.values()];
  const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
  const nextZoom = Math.max(1, Math.min(mobileZoomLimit(), g.zoom * Math.hypot(b.x - a.x, b.y - a.y) / g.distance));
  const rect = touchViewer.getBoundingClientRect();
  const origin = mobileGeometry?.center || {x: rect.width / 2, y: rect.height / 2};
  const ratio = nextZoom / g.zoom;
  panX = mid.x - rect.left - origin.x - (g.x - rect.left - origin.x - g.px) * ratio;
  panY = mid.y - rect.top - origin.y - (g.y - rect.top - origin.y - g.py) * ratio;
  zoom = nextZoom;
  if (zoom === 1) panX = panY = 0;
  $('fit').textContent = zoom === 1 ? 'Fit' : Math.round(zoom * 100) + '%';
  fit();
 } else if (g.kind === 'contrast') {
  contrast = g.contrast + dx * .6; brightness = g.brightness - dy * .3; applyContrast();
 } else if (g.kind === 'pan') {
  panX = g.px + dx; panY = g.py + dy; fit();
 }
}, {passive: true});

function finishTouch(e, cancelled = false) {
 if (e.pointerType !== 'touch' || !touchPoints.has(e.pointerId)) return;
 const g = touchGesture;
 const wasMultiTouch = touchPoints.size > 1;
 if (cancelled || wasMultiTouch || g?.moved) suppressTouchClickUntil = performance.now() + 800;
 touchPoints.delete(e.pointerId);
 if (touchViewer.hasPointerCapture(e.pointerId)) touchViewer.releasePointerCapture(e.pointerId);
 if (!cancelled && !wasMultiTouch && g?.kind === 'slice') {
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (Math.abs(dy) > 35 && Math.abs(dy) > Math.abs(dx) * 1.2) move(target + (dy < 0 ? 1 : -1));
 }
 // Do not turn the remaining finger after a pinch into an unintended slice swipe.
 touchGesture = null;
 if (touchPoints.size) {
  beginTouchGesture();
  if (touchGesture?.kind === 'slice') touchGesture.kind = 'pan';
 }
 if (!touchPoints.size) $('canvas').classList.remove('dragging');
}
touchViewer.addEventListener('pointerup', e => finishTouch(e));
touchViewer.addEventListener('pointercancel', e => finishTouch(e, true));
touchViewer.addEventListener('lostpointercapture', e => {
 if (!touchViewer.hasPointerCapture(e.pointerId)) finishTouch(e, true);
});
touchViewer.addEventListener('click', e => {
 if (performance.now() < suppressTouchClickUntil && e.detail !== 0) {
  e.preventDefault(); e.stopImmediatePropagation();
 }
}, true);
window.addEventListener('blur', resetMobileInteraction);

// Safari on iPhone may not support element fullscreen. A reversible in-page
// mode hides app chrome there; it does not claim to hide the browser chrome.
function syncMobileFullscreen() {
 const active = !!document.fullscreenElement || document.body.classList.contains('mobile-immersive');
 $('mobileFullscreen').textContent = active ? 'Exit fullscreen' : 'Fullscreen';
 $('mobileFullscreen').setAttribute('aria-pressed', String(active));
 if (mobileViewport.matches) resetMobileFit();
 else fit();
}
$('mobileFullscreen').onclick = async () => {
 if (document.fullscreenElement) {
  try { await document.exitFullscreen(); } catch { toast('Use your browser fullscreen exit control.'); }
 } else if (document.body.classList.contains('mobile-immersive')) {
  document.body.classList.remove('mobile-immersive');
 } else {
  try {
   if (!document.documentElement.requestFullscreen) throw new Error('unsupported');
   await document.documentElement.requestFullscreen();
  } catch {
   document.body.classList.add('mobile-immersive');
   toast('Expanded viewer. Browser fullscreen is unavailable on this device.');
  }
 }
 syncMobileFullscreen();
};
document.addEventListener('fullscreenchange', syncMobileFullscreen);
document.addEventListener('keydown', e => {
 if (e.key === 'Escape' && document.body.classList.contains('mobile-immersive')) {
  document.body.classList.remove('mobile-immersive'); syncMobileFullscreen();
 }
});

let lastViewportSize = '';
new ResizeObserver(() => {
 const r = touchViewer.getBoundingClientRect();
 const size = `${Math.round(r.width)}:${Math.round(r.height)}`;
 if (size !== lastViewportSize && mobileViewport.matches) resetMobileFit();
 lastViewportSize = size;
}).observe(touchViewer);
new ResizeObserver(() => {
 document.documentElement.style.setProperty('--mobile-toolbar-height', $('regionSelect').closest('.toolbar').offsetHeight + 'px');
}).observe(document.querySelector('.toolbar'));
mobileViewport.addEventListener('change', () => {
 document.body.classList.remove('mobile-immersive');
 resetMobileFit(); syncMobileFullscreen();
});
updateMobileControls(); fit();
