// ====== Elements ======
const nameInput = document.getElementById("nameInput");
const photoInput = document.getElementById("photoInput");

const cropWrap = document.getElementById("cropWrap");
const cropCanvas = document.getElementById("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const zoomSlider = document.getElementById("zoomSlider");

const outCanvas = document.getElementById("outCanvas");
const outCtx = outCanvas.getContext("2d");

const generateBtn = document.getElementById("generateBtn");
const downloadBtn = document.getElementById("downloadBtn");
const useCropBtn = document.getElementById("useCropBtn");

// ====== Background ======
const bg = new Image();
bg.src = "background.png";

// ====== State ======
let srcImg = null;         // original uploaded photo as Image
let croppedSquare = null;  // square canvas result from crop step

// Crop transform
let scale = parseFloat(zoomSlider.value); // zoom
let offsetX = 0; // pan
let offsetY = 0;
let isDragging = false;
let lastX = 0, lastY = 0;

// ====== Helpers ======
async function loadUserImage(file) {
  // Better iOS orientation handling where supported
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const off = document.createElement("canvas");
      off.width = bmp.width;
      off.height = bmp.height;
      off.getContext("2d").drawImage(bmp, 0, 0);
      const img = new Image();
      img.src = off.toDataURL("image/png");
      await img.decode();
      return img;
    } catch (e) {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Draw crop preview: image + dark overlay + crop circle guide
function drawCropPreview() {
  if (!srcImg) return;

  const cw = cropCanvas.width, ch = cropCanvas.height;
  cropCtx.clearRect(0, 0, cw, ch);

  // "Cover" fit to canvas with user-controlled scale + pan
  const iw = srcImg.width, ih = srcImg.height;
  const base = Math.max(cw / iw, ch / ih); // cover
  const s = base * scale;

  const dw = iw * s;
  const dh = ih * s;

  const x = (cw - dw) / 2 + offsetX;
  const y = (ch - dh) / 2 + offsetY;

  cropCtx.drawImage(srcImg, x, y, dw, dh);

  // Overlay crop guide (circle)
  const r = cw * 0.36;
  cropCtx.save();
  cropCtx.fillStyle = "rgba(0,0,0,0.45)";
  cropCtx.fillRect(0, 0, cw, ch);

  cropCtx.globalCompositeOperation = "destination-out";
  cropCtx.beginPath();
  cropCtx.arc(cw / 2, ch / 2, r, 0, Math.PI * 2);
  cropCtx.fill();
  cropCtx.restore();

  // Circle outline
  cropCtx.strokeStyle = "rgba(255,255,255,0.9)";
  cropCtx.lineWidth = 4;
  cropCtx.beginPath();
  cropCtx.arc(cw / 2, ch / 2, r, 0, Math.PI * 2);
  cropCtx.stroke();
}

// Extract a square crop from current transform (we’ll later place it into circle)
function makeCroppedSquare() {
  const cw = cropCanvas.width, ch = cropCanvas.height;

  // Make a square canvas (same size as cropCanvas)
  const sq = document.createElement("canvas");
  sq.width = cw;
  sq.height = ch;
  const sqCtx = sq.getContext("2d");

  // Draw exactly what user sees (without overlay)
  const iw = srcImg.width, ih = srcImg.height;
  const base = Math.max(cw / iw, ch / ih);
  const s = base * scale;

  const dw = iw * s;
  const dh = ih * s;
  const x = (cw - dw) / 2 + offsetX;
  const y = (ch - dh) / 2 + offsetY;

  sqCtx.drawImage(srcImg, x, y, dw, dh);
  return sq;
}

// Wrap text into lines
function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? (line + " " + w) : w;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Draw circular image from a square source
function drawCircularFromSquare(ctx, squareCanvas, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(squareCanvas, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// ====== Event handlers ======
photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  srcImg = await loadUserImage(file);

  // Reset crop transform for new photo
  scale = parseFloat(zoomSlider.value);
  offsetX = 0;
  offsetY = 0;

  cropWrap.style.display = "block";
  drawCropPreview();

  generateBtn.disabled = true;
  downloadBtn.disabled = true;
});

zoomSlider.addEventListener("input", () => {
  scale = parseFloat(zoomSlider.value);
  drawCropPreview();
});

// Mouse drag
cropCanvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener("mouseup", () => isDragging = false);
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  offsetX += (e.clientX - lastX);
  offsetY += (e.clientY - lastY);
  lastX = e.clientX; lastY = e.clientY;
  drawCropPreview();
});

// Touch drag + pinch
let touchMode = null;
let startDist = 0;
let startScale = 1;

cropCanvas.addEventListener("touchstart", (e) => {
  if (!srcImg) return;
  if (e.touches.length === 1) {
    touchMode = "drag";
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    touchMode = "pinch";
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    startDist = Math.hypot(dx, dy);
    startScale = scale;
  }
}, { passive: true });

cropCanvas.addEventListener("touchmove", (e) => {
  if (!srcImg) return;

  if (touchMode === "drag" && e.touches.length === 1) {
    offsetX += (e.touches[0].clientX - lastX);
    offsetY += (e.touches[0].clientY - lastY);
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    drawCropPreview();
  }

  if (touchMode === "pinch" && e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / startDist;

    scale = clamp(startScale * ratio, 1, 4);
    zoomSlider.value = String(scale);
    drawCropPreview();
  }
}, { passive: true });

cropCanvas.addEventListener("touchend", () => {
  touchMode = null;
}, { passive: true });

useCropBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Please enter your name first.");
    return;
  }
  if (!srcImg) return;

  croppedSquare = makeCroppedSquare(); // store crop result
  generateBtn.disabled = false;
  alert("Crop saved. Now tap “Generate Invitation”.");
});

generateBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name || !croppedSquare) {
    alert("Please enter your name and crop your photo first.");
    return;
  }

  if (!bg.complete) await new Promise((res) => (bg.onload = res));

  // Draw background
  outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(bg, 0, 0, outCanvas.width, outCanvas.height);

  // ===== Corrected placement for your background =====
  // FACE circle
  const faceCx = 256;
  const faceCy = 585;
  const faceR  = 86;
  drawCircularFromSquare(outCtx, croppedSquare, faceCx, faceCy, faceR);

  // BOARD text area
  const boardCx = 295;
  const boardCy = 833;
  const boardW  = 372;
  const boardH  = 246;
  const angleDeg = -10.4;
  const angle = angleDeg * Math.PI / 180;

  const inviteText = `${name} invites you to join Mahashivratri Celebrations in Kolkata`;

  outCtx.save();
  outCtx.translate(boardCx, boardCy);
  outCtx.rotate(angle);

  // clip inside board
  const pad = 22;
  outCtx.beginPath();
  outCtx.rect(-boardW/2 + pad, -boardH/2 + pad, boardW - pad*2, boardH - pad*2);
  outCtx.clip();

  // readable text
  outCtx.fillStyle = "#ffffff";
  outCtx.textAlign = "center";
  outCtx.textBaseline = "middle";
  outCtx.shadowColor = "rgba(0,0,0,0.55)";
  outCtx.shadowBlur = 10;

  // dynamic font sizing
  let fontSize = 38;
  outCtx.font = `800 ${fontSize}px Georgia, serif`;

  const maxTextWidth = boardW - pad*2 - 10;

  // Wrap + shrink if needed
  let lines = wrapTextLines(outCtx, inviteText, maxTextWidth);
  while (lines.length > 4 && fontSize > 26) {
    fontSize -= 2;
    outCtx.font = `800 ${fontSize}px Georgia, serif`;
    lines = wrapTextLines(outCtx, inviteText, maxTextWidth);
  }

  const lineHeight = Math.round(fontSize * 1.2);
  const totalH = lines.length * lineHeight;
  let y = (-totalH / 2 + lineHeight / 2) + 6; // slight downward bias

  for (const ln of lines) {
    outCtx.fillText(ln, 0, y);
    y += lineHeight;
  }

  outCtx.restore();

  downloadBtn.disabled = false;
});

downloadBtn.addEventListener("click", download);

function download() {
  const link = document.createElement("a");
  link.download = "Mahashivratri_Invite.png";
  link.href = outCanvas.toDataURL("image/png");
  link.click();
}