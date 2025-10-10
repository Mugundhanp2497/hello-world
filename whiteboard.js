"use strict";

(function () {
  const canvas = document.getElementById("boardCanvas");
  const sizeInput = document.getElementById("size");
  const sizeValue = document.getElementById("sizeValue");
  const colorPicker = document.getElementById("colorPicker");
  const clearBtn = document.getElementById("clearBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const toolButtons = Array.from(document.querySelectorAll(".tool-btn"));
  const colorSwatches = Array.from(document.querySelectorAll(".color-swatch"));

  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext("2d", { desynchronized: true });

  const state = {
    tool: "pen", // 'pen' | 'eraser-clear' | 'eraser-color'
    strokeColor: colorPicker.value,
    lineWidth: Number(sizeInput.value),
    isDrawing: false,
    devicePixelRatio: Math.max(1, window.devicePixelRatio || 1),
    lastPoint: null, // { x, y }
  };

  function setActiveTool(tool) {
    state.tool = tool;
    for (const btn of toolButtons) {
      const pressed = btn.dataset.tool === tool;
      btn.setAttribute("aria-pressed", String(pressed));
    }
  }

  // Initialize UI bindings
  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
  });

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color;
      colorPicker.value = color;
      state.strokeColor = color;
    });
  });

  colorPicker.addEventListener("input", (e) => {
    state.strokeColor = e.target.value;
  });

  sizeInput.addEventListener("input", () => {
    state.lineWidth = Number(sizeInput.value);
    sizeValue.textContent = `${state.lineWidth} px`;
  });

  clearBtn.addEventListener("click", clearCanvas);
  downloadBtn.addEventListener("click", downloadImage);

  function getCanvasCssSize() {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function resizeCanvasPreserveContent() {
    const { width: cssWidth, height: cssHeight } = getCanvasCssSize();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // If no size change, skip
    const targetWidth = Math.floor(cssWidth * dpr);
    const targetHeight = Math.floor(cssHeight * dpr);
    if (canvas.width === targetWidth && canvas.height === targetHeight) {
      return;
    }

    // Preserve existing content
    const prev = document.createElement("canvas");
    prev.width = canvas.width;
    prev.height = canvas.height;
    const prevCtx = prev.getContext("2d");
    prevCtx.drawImage(canvas, 0, 0);

    // Resize actual canvas
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Normalize transform and styles
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Scale for DPR so drawing uses CSS pixel coordinates
    ctx.scale(dpr, dpr);

    // Draw the preserved content scaled into the new size
    if (prev.width && prev.height) {
      ctx.save();
      ctx.scale(cssWidth / (prev.width / state.devicePixelRatio), cssHeight / (prev.height / state.devicePixelRatio));
      ctx.drawImage(prev, 0, 0);
      ctx.restore();
    }

    state.devicePixelRatio = dpr;
  }

  function toCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  }

  function beginStroke(point, pressure) {
    state.isDrawing = true;
    state.lastPoint = point;

    const computedLineWidth = computeWidth(pressure);

    if (state.tool === "eraser-clear") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = state.tool === "eraser-color" ? state.strokeColor : state.strokeColor;
    }

    ctx.lineWidth = computedLineWidth;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function drawStroke(point, pressure) {
    if (!state.isDrawing || !state.lastPoint) return;

    const computedLineWidth = computeWidth(pressure);
    ctx.lineWidth = computedLineWidth;

    // Simple smoothing with quadratic curve
    const midPointX = (state.lastPoint.x + point.x) / 2;
    const midPointY = (state.lastPoint.y + point.y) / 2;

    ctx.quadraticCurveTo(state.lastPoint.x, state.lastPoint.y, midPointX, midPointY);
    ctx.stroke();

    state.lastPoint = point;
  }

  function endStroke() {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    state.lastPoint = null;
    ctx.closePath();
    // reset to default compositing
    ctx.globalCompositeOperation = "source-over";
  }

  function computeWidth(pressure) {
    const base = state.lineWidth;
    const p = typeof pressure === "number" && pressure > 0 ? pressure : 0.5;
    // Keep within 60%..120% of base width when pressure is available
    return Math.max(1, base * (0.6 + 0.6 * p));
  }

  // Pointer events
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const pt = toCanvasPoint(e.clientX, e.clientY);
    beginStroke(pt, e.pressure);
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.isDrawing) return;
    const pt = toCanvasPoint(e.clientX, e.clientY);
    drawStroke(pt, e.pressure);
    e.preventDefault();
  });

  function cancelIfActive() {
    if (state.isDrawing) endStroke();
  }

  ["pointerup", "pointercancel", "pointerout", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, () => cancelIfActive());
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      clearCanvas();
      e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      downloadImage();
      e.preventDefault();
    } else if (e.key.toLowerCase() === "b") {
      setActiveTool("pen");
    } else if (e.key.toLowerCase() === "e") {
      setActiveTool("eraser-clear");
    } else if (e.key.toLowerCase() === "c") {
      setActiveTool("eraser-color");
    }
  });

  function clearCanvas() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function downloadImage() {
    // Render to an export canvas with white background for better PNG appearance
    const css = getCanvasCssSize();
    const exportCanvas = document.createElement("canvas");
    const expCtx = exportCanvas.getContext("2d");

    exportCanvas.width = Math.floor(css.width);
    exportCanvas.height = Math.floor(css.height);

    expCtx.fillStyle = "#ffffff";
    expCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    expCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

    const url = exportCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${Date.now()}.png`;
    a.click();
  }

  // Initial setup
  function init() {
    resizeCanvasPreserveContent();
    sizeValue.textContent = `${state.lineWidth} px`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  window.addEventListener("resize", resizeCanvasPreserveContent);
  init();
})();
