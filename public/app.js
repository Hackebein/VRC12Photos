const BASE_MASK_W = 2048;
const BASE_MASK_H = 1536;

const CANVAS_BG = "#f5f3ff";

const SLOTS = [
  { x: 242, y: 16, w: 288, h: 746 },
  { x: 542, y: 16, w: 288, h: 746 },
  { x: 842, y: 16, w: 288, h: 746 },
  { x: 1142, y: 16, w: 288, h: 746 },
  { x: 1442, y: 16, w: 288, h: 746 },
  { x: 1742, y: 16, w: 288, h: 746 },

  { x: 242, y: 772, w: 288, h: 746 },
  { x: 542, y: 772, w: 288, h: 746 },
  { x: 842, y: 772, w: 288, h: 746 },
  { x: 1142, y: 772, w: 288, h: 746 },
  { x: 1442, y: 772, w: 288, h: 746 },
  { x: 1742, y: 772, w: 288, h: 746 },
];

const viewCanvas = document.getElementById("view");
const downloadBtn = document.getElementById("download");
const fileInput = document.getElementById("file");

const viewCtx = viewCanvas.getContext("2d", { alpha: true });
viewCtx.imageSmoothingEnabled = true;
viewCtx.imageSmoothingQuality = "high";

const renderCanvas = document.createElement("canvas");
const renderCtx = renderCanvas.getContext("2d", { alpha: true });
renderCtx.imageSmoothingEnabled = true;
renderCtx.imageSmoothingQuality = "high";

let maskImg;
let renderW = 0;
let renderH = 0;
let scaledSlots = [];
let currentSlotIndex = -1;
const slotBitmaps = Array.from({ length: 12 }, () => null);
const slotOffsets = Array.from({ length: 12 }, () => ({ x: 0, y: 0 }));

let dragPointerId = null;
let dragSlotIndex = -1;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;
let dragMoved = false;
const DRAG_START_THRESHOLD_PX = 3;

function loadMask() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "mask.png";
  });
}

function computeScaledSlots() {
  const sx = renderW / BASE_MASK_W;
  const sy = renderH / BASE_MASK_H;
  scaledSlots = SLOTS.map((s) => ({
    x: s.x * sx,
    y: s.y * sy,
    w: s.w * sx,
    h: s.h * sy,
  }));
}

function resizeViewCanvas() {
  const controlsH = document.getElementById("controls").offsetHeight;
  const availW = window.innerWidth;
  const availH = Math.max(1, window.innerHeight - controlsH);

  const scale = Math.min(availW / renderW, availH / renderH);
  const cssW = Math.max(1, Math.floor(renderW * scale));
  const cssH = Math.max(1, Math.floor(renderH * scale));

  const dpr = window.devicePixelRatio || 1;
  viewCanvas.style.width = `${cssW}px`;
  viewCanvas.style.height = `${cssH}px`;
  viewCanvas.width = Math.max(1, Math.round(cssW * dpr));
  viewCanvas.height = Math.max(1, Math.round(cssH * dpr));

  viewCtx.imageSmoothingEnabled = true;
  viewCtx.imageSmoothingQuality = "high";
}

function findSlotAt(renderX, renderY) {
  for (let i = 0; i < scaledSlots.length; i++) {
    const s = scaledSlots[i];
    if (
      renderX >= s.x &&
      renderX <= s.x + s.w &&
      renderY >= s.y &&
      renderY <= s.y + s.h
    ) {
      return i;
    }
  }
  return -1;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function clampCoverOffset(img, slot, offset) {
  const scale = Math.max(slot.w / img.width, slot.h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx0 = slot.x + (slot.w - dw) / 2;
  const dy0 = slot.y + (slot.h - dh) / 2;

  const minX = slot.x + slot.w - dw - dx0;
  const maxX = slot.x - dx0;
  const minY = slot.y + slot.h - dh - dy0;
  const maxY = slot.y - dy0;

  return {
    x: clamp(offset.x, minX, maxX),
    y: clamp(offset.y, minY, maxY),
  };
}

function drawCover(ctx, img, slot, offset) {
  const scale = Math.max(slot.w / img.width, slot.h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx0 = slot.x + (slot.w - dw) / 2;
  const dy0 = slot.y + (slot.h - dh) / 2;
  const ox = offset ? offset.x : 0;
  const oy = offset ? offset.y : 0;
  const dx = dx0 + ox;
  const dy = dy0 + oy;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function render() {
  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
  renderCtx.clearRect(0, 0, renderW, renderH);
  renderCtx.fillStyle = CANVAS_BG;
  renderCtx.fillRect(0, 0, renderW, renderH);

  for (let i = 0; i < scaledSlots.length; i++) {
    const bmp = slotBitmaps[i];
    if (!bmp) continue;
    const slot = scaledSlots[i];

    renderCtx.save();
    renderCtx.beginPath();
    renderCtx.rect(slot.x, slot.y, slot.w, slot.h);
    renderCtx.clip();
    drawCover(renderCtx, bmp, slot, slotOffsets[i]);
    renderCtx.restore();
  }

  renderCtx.drawImage(maskImg, 0, 0, renderW, renderH);

  viewCtx.setTransform(1, 0, 0, 1, 0, 0);
  viewCtx.clearRect(0, 0, viewCanvas.width, viewCanvas.height);
  viewCtx.drawImage(renderCanvas, 0, 0, viewCanvas.width, viewCanvas.height);
}

function rerenderAll() {
  resizeViewCanvas();
  render();
}

viewCanvas.addEventListener("pointerdown", (e) => {
  if (!renderW || !renderH) return;
  const rect = viewCanvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * renderW;
  const y = ((e.clientY - rect.top) / rect.height) * renderH;
  const slotIdx = findSlotAt(x, y);
  if (slotIdx < 0) return;
  if (!slotBitmaps[slotIdx]) return;

  dragPointerId = e.pointerId;
  dragSlotIndex = slotIdx;
  dragStartClientX = e.clientX;
  dragStartClientY = e.clientY;
  dragStartOffsetX = slotOffsets[slotIdx].x;
  dragStartOffsetY = slotOffsets[slotIdx].y;
  dragMoved = false;

  try {
    viewCanvas.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }
});

viewCanvas.addEventListener("pointermove", (e) => {
  if (dragPointerId === null || e.pointerId !== dragPointerId) return;
  if (dragSlotIndex < 0 || dragSlotIndex >= slotBitmaps.length) return;

  const rect = viewCanvas.getBoundingClientRect();
  const dxClient = e.clientX - dragStartClientX;
  const dyClient = e.clientY - dragStartClientY;

  if (!dragMoved) {
    if (Math.hypot(dxClient, dyClient) < DRAG_START_THRESHOLD_PX) return;
    dragMoved = true;
  }

  const dxRender = (dxClient / rect.width) * renderW;
  const dyRender = (dyClient / rect.height) * renderH;

  const bmp = slotBitmaps[dragSlotIndex];
  const slot = scaledSlots[dragSlotIndex];
  if (!bmp || !slot) return;

  const desired = {
    x: dragStartOffsetX + dxRender,
    y: dragStartOffsetY + dyRender,
  };
  const clamped = clampCoverOffset(bmp, slot, desired);
  slotOffsets[dragSlotIndex] = clamped;
  render();
});

function endDrag(e) {
  if (dragPointerId === null || e.pointerId !== dragPointerId) return;

  try {
    viewCanvas.releasePointerCapture(e.pointerId);
  } catch {
    // ignore
  }

  dragPointerId = null;
  dragSlotIndex = -1;
  dragMoved = false;
}

viewCanvas.addEventListener("pointerup", endDrag);
viewCanvas.addEventListener("pointercancel", endDrag);
viewCanvas.addEventListener("lostpointercapture", endDrag);

viewCanvas.addEventListener("dblclick", (e) => {
  if (!renderW || !renderH) return;
  const rect = viewCanvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * renderW;
  const y = ((e.clientY - rect.top) / rect.height) * renderH;
  const slotIdx = findSlotAt(x, y);
  if (slotIdx < 0) return;
  currentSlotIndex = slotIdx;
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (currentSlotIndex < 0 || currentSlotIndex >= slotBitmaps.length) return;

  const prev = slotBitmaps[currentSlotIndex];
  if (prev && typeof prev.close === "function") prev.close();

  const bmp = await createImageBitmap(file);
  slotBitmaps[currentSlotIndex] = bmp;
  slotOffsets[currentSlotIndex] = { x: 0, y: 0 };
  render();
});

downloadBtn.addEventListener("click", async () => {
  const blob = await new Promise((resolve) =>
    renderCanvas.toBlob(resolve, "image/png")
  );
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vrc12photos.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

window.addEventListener("resize", () => {
  if (!renderW || !renderH) return;
  rerenderAll();
});

(async function main() {
  maskImg = await loadMask();
  renderW = BASE_MASK_W;
  renderH = BASE_MASK_H;

  renderCanvas.width = renderW;
  renderCanvas.height = renderH;
  renderCtx.imageSmoothingEnabled = true;
  renderCtx.imageSmoothingQuality = "high";

  computeScaledSlots();
  rerenderAll();

  downloadBtn.disabled = false;
})();


