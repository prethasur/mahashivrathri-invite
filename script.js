// script.js — Mahashivratri invite generator (client-side only)
// - Upload photo + crop (drag + pinch/slider)
// - Click Generate to render:
//   1) Photo inside the round frame (fits inside rim)
//   2) Text centered inside the speech bubble (larger + optically centered)
// - Download PNG
//
// Tuned for the NEW background (4:5) and output canvas 1080×1350.

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

// Hide any leftover "Use crop" button if present (no extra step)
const maybeUseCropBtn = document.getElementById("useCropBtn");
if (maybeUseCropBtn) maybeUseCropBtn.style.display = "none";

// Background (must be named exactly background.png in repo root)
const bg = new Image();
bg.src = "background.png";

// -------------------- State --------------------
let srcImg = null;

// Crop transform state
let scale = parseFloat(zoomSlider?.value || "1.6");
let offsetX = 0;
let offsetY = 0;

// Drag state
let isDragging = false;
let lastX = 0;
let lastY = 0;

// Touch state (pinch)
let touchMode = null;
let startDist = 0;
let startScale = 1;

// -------------------- Helpers --------------------
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function loadUserImage(file) {
  // Handles iOS EXIF orientation in most modern browsers
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
    } catch (_) {
      // fall through
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCropPreview() {
  if (!srcImg) return;

  const cw = cropCanvas.width;
  const ch = cropCanvas.height;
  cropCtx.clearRect(0, 0, cw, ch);

  const iw = srcImg.width;
  const ih = srcImg.height;

  // cover-fit with user zoom + pan
  const base = Math.max(cw / iw, ch / ih);
  const s = base * scale;

  const dw = iw * s;
  const dh = ih * s;

  const x = (cw - dw) / 2 + offsetX;
  const y = (ch - dh) / 2 + offsetY;

  cropCtx.drawImage(srcImg, x, y, dw, dh);

  // Dark overlay with circular window
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
  cropCtx.strokeStyle = "rgba(255,255,255,0.92)";
  cropCtx.lineWidth = 4;
  cropCtx.beginPath();
  cropCtx.arc(cw / 2, ch / 2, r, 0, Math.PI * 2);
  cropCtx.stroke();
}

function makeCroppedSquare() {
  const cw = cropCanvas.width;
  const ch = cropCanvas.height;

  const sq = document.createElement("canvas");
  sq.width = cw;
  sq.height = ch;
  const sqCtx = sq.getContext("2d");

  const iw = srcImg.width;
  const ih = srcImg.height;

  const base = Math.max(cw / iw, ch / ih);
  const s = base * scale;

  const dw = iw * s;
  const dh = ih * s;

  const x = (cw - dw) / 2 + offsetX;
  const y = (ch - dh) / 2 + offsetY;

  sqCtx.drawImage(srcImg, x, y, dw, dh);
  return sq;
}

// Draw the cropped square into a circle on the output canvas.
// zoom kept close to 1 so it fits inside the rim.
function drawCircularFromSquare(ctx, squareCanvas, cx, cy, r, zoom = 1.06) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const zr = r * zoom;
  ctx.drawImage(squareCanvas, cx - zr, cy - zr, zr * 2, zr * 2);

  ctx.restore();
}

function updateGenerateEnabled() {
  const hasName = nameInput.value.trim().length > 0;
  const hasPhoto = !!srcImg;
  generateBtn.disabled = !(hasName && hasPhoto);
  downloadBtn.disabled = true;
}

// -------------------- Events --------------------
nameInput.addEventListener("input", updateGenerateEnabled);

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  srcImg = await loadUserImage(file);

  // reset crop transform
  scale = parseFloat(zoomSlider?.value || "1.6");
  offsetX = 0;
  offsetY = 0;

  cropWrap.style.display = "block";
  drawCropPreview();
  updateGenerateEnabled();
});

zoomSlider.addEventListener("input", () => {
  scale = parseFloat(zoomSlider.value || "1.6");
  drawCropPreview();
});

// Mouse drag
cropCanvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener("mouseup", () => (isDragging = false));
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  offsetX += e.clientX - lastX;
  offsetY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  drawCropPreview();
});

// Touch drag + pinch
cropCanvas.addEventListener(
  "touchstart",
  (e) => {
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
  },
  { passive: true }
);

cropCanvas.addEventListener(
  "touchmove",
  (e) => {
    if (!srcImg) return;

    if (touchMode === "drag" && e.touches.length === 1) {
      offsetX += e.touches[0].clientX - lastX;
      offsetY += e.touches[0].clientY - lastY;
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
  },
  { passive: true }
);

cropCanvas.addEventListener(
  "touchend",
  () => {
    touchMode = null;
  },
  { passive: true }
);

// -------------------- Generate --------------------
generateBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name || !srcImg) {
    alert("Please enter your name and upload a photo.");
    return;
  }

  // Ensure background is loaded
  if (!bg.complete) {
    await new Promise((res) => (bg.onload = res));
  }

  // Use current crop state directly
  const croppedSquare = makeCroppedSquare();

  // Draw background
  outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(bg, 0, 0, outCanvas.width, outCanvas.height);

  // ===== Measured placements for THIS background in 1080×1350 =====

  // Face circle (inside rim)
  const faceCx = 202;
  const faceCy = 1097;
  const faceR = 172; // slightly smaller than before to avoid covering rim
  drawCircularFromSquare(outCtx, croppedSquare, faceCx, faceCy, faceR, 1.05);

  // Speech bubble bbox (white area) — measured and scaled
  const bubbleX = 108;
  const bubbleY = 580;
  const bubbleW = 394;
  const bubbleH = 211;

  // Text settings: larger + optically centered
  const inviteText = `${name} invites you to join Mahashivratri Celebrations in Kolkata`;

  const pad = 18; // smaller pad => more room
  const innerX = bubbleX + pad;
  const innerY = bubbleY + pad;
  const innerW = bubbleW - pad * 2;
  const innerH = bubbleH - pad * 2;

  outCtx.save();

  // Clip to the inner bubble box so text never spills
  outCtx.beginPath();
  outCtx.rect(innerX, innerY, innerW, innerH);
  outCtx.clip();

  // Darker royal blue + clearer weight
  outCtx.fillStyle = "#1E3A8A"; // deep royal blue
  outCtx.textAlign = "center";
  outCtx.textBaseline = "alphabetic";

  // crisp but readable
  outCtx.shadowColor = "rgba(0,0,0,0.12)";
  outCtx.shadowBlur = 1;

  // Make text larger: start high, shrink only if needed
  let fontSize = 44;
  outCtx.font = `900 ${fontSize}px Georgia, serif`;

  const maxTextWidth = innerW;

  // Keep to <= 5 lines (bubble is small). Shrink until fit.
  let lines = wrapTextLines(outCtx, inviteText, maxTextWidth);
  while (lines.length > 5 && fontSize > 30) {
    fontSize -= 2;
    outCtx.font = `900 ${fontSize}px Georgia, serif`;
    lines = wrapTextLines(outCtx, inviteText, maxTextWidth);
  }

  // If lines still 4 but too tall, shrink a bit more
  const lineHeightFor = (fs) => Math.round(fs * 1.22);

  let lineHeight = lineHeightFor(fontSize);
  let totalH = lines.length * lineHeight;
  while (totalH > innerH && fontSize > 28) {
    fontSize -= 2;
    outCtx.font = `900 ${fontSize}px Georgia, serif`;
    lines = wrapTextLines(outCtx, inviteText, maxTextWidth);
    lineHeight = lineHeightFor(fontSize);
    totalH = lines.length * lineHeight;
  }

  // TRUE centering using baselines:
  // draw each line at baseline = top + (remaining space)/2 + ascent-adjust
  const metrics = outCtx.measureText("Mg");
  const ascent = metrics.actualBoundingBoxAscent || Math.round(fontSize * 0.8);

  // Optical centering: small downward bias to feel centered in bubble
  const top = innerY + (innerH - totalH) / 2 + 2;

  let y = top + ascent; // first baseline
  const cx = innerX + innerW / 2;

  for (const ln of lines) {
    outCtx.fillText(ln, cx, y);
    y += lineHeight;
  }

  outCtx.restore();

  downloadBtn.disabled = false;
});

// -------------------- Download --------------------
downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "Mahashivratri_Invite.png";
  link.href = outCanvas.toDataURL("image/png");
  link.click();
});

// Init
updateGenerateEnabled();
