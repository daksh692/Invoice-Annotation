/* Invoice Annotator - Vanilla, Offline (v1.2)
 * New in v1.2:
 * - Client-side OCR with Tesseract.js (reads text inside boxes)
 * - On create/refresh OCR: set annotation.value, then write into invoiceData at label path
 * - Sidebar shows all fields (even if null) to allow annotating empty fields
 * - Buttons: Re-OCR selection, OCR all boxes, Export Updated Invoice JSON
 * - Keeps existing exports (labels JSON, COCO) and validation
 */

/** ------------------------------
 * Types via JSDoc (unchanged)
 * ------------------------------ */
/* ... (all typedefs from v1.1 stay the same) ... */

const COLORS = {
  buyer: "#2563EB",
  seller: "#EF4444",
  meta: "#10B981",
  line: "#F59E0B",
  totals: "#8B5CF6",
};

const DISPLAY_TITLES = {
  "buyer.company_name": "Buyer Name",
  "buyer.address": "Buyer Address",
  "buyer.gstin": "Buyer GSTIN",
  "seller.company_name": "Seller Name",
  "seller.address": "Seller Address",
  "seller.gstin": "Seller GSTIN",
  "invoice.bill_no": "Bill No",
  "invoice.date": "Date",
  "invoice.line_items[i].product_name": "Product Name",
  "invoice.line_items[i].unit": "Unit",
  "invoice.line_items[i].quantity": "Qty",
  "invoice.line_items[i].unit_price": "Unit Price",
  "invoice.line_items[i].line_total_printed": "Line Total",
  "invoice.subtotal_printed": "Subtotal",
  "invoice.gst_breakdown.cgst_percent": "CGST %",
  "invoice.gst_breakdown.cgst_amount": "CGST Amt",
  "invoice.gst_breakdown.sgst_percent": "SGST %",
  "invoice.gst_breakdown.sgst_amount": "SGST Amt",
  "invoice.gst_breakdown.other_gst_label": "Other GST Label",
  "invoice.gst_breakdown.other_gst_percent": "Other GST %",
  "invoice.gst_breakdown.other_gst_amount": "Other GST Amt",
  "invoice.round_off": "Round Off",
  "invoice.grand_total_printed": "Grand Total",
};

const GROUPS = [
  {
    id: "buyer",
    title: "Buyer",
    color: COLORS.buyer,
    fields: ["buyer.company_name", "buyer.address", "buyer.gstin"],
  },
  {
    id: "seller",
    title: "Seller",
    color: COLORS.seller,
    fields: ["seller.company_name", "seller.address", "seller.gstin"],
  },
  {
    id: "meta",
    title: "Invoice Meta",
    color: COLORS.meta,
    fields: ["invoice.bill_no", "invoice.date"],
  },
  {
    id: "line",
    title: "Line Items",
    color: COLORS.line,
    fields: [
      "invoice.line_items[i].product_name",
      "invoice.line_items[i].unit",
      "invoice.line_items[i].quantity",
      "invoice.line_items[i].unit_price",
      "invoice.line_items[i].line_total_printed",
    ],
  },
  {
    id: "totals",
    title: "Totals / GST",
    color: COLORS.totals,
    fields: [
      "invoice.subtotal_printed",
      "invoice.gst_breakdown.cgst_percent",
      "invoice.gst_breakdown.cgst_amount",
      "invoice.gst_breakdown.sgst_percent",
      "invoice.gst_breakdown.sgst_amount",
      "invoice.gst_breakdown.other_gst_label",
      "invoice.gst_breakdown.other_gst_percent",
      "invoice.gst_breakdown.other_gst_amount",
      "invoice.round_off",
      "invoice.grand_total_printed",
    ],
  },
];

// Master class list used in exports/validation
const CLASSES = [
  "buyer.company_name",
  "buyer.address",
  "buyer.gstin",
  "seller.company_name",
  "seller.address",
  "seller.gstin",
  "invoice.bill_no",
  "invoice.date",
  "invoice.line_items[i].product_name",
  "invoice.line_items[i].unit",
  "invoice.line_items[i].quantity",
  "invoice.line_items[i].unit_price",
  "invoice.line_items[i].line_total_printed",
  "invoice.subtotal_printed",
  "invoice.gst_breakdown.cgst_percent",
  "invoice.gst_breakdown.cgst_amount",
  "invoice.gst_breakdown.sgst_percent",
  "invoice.gst_breakdown.sgst_amount",
  "invoice.gst_breakdown.other_gst_label",
  "invoice.gst_breakdown.other_gst_percent",
  "invoice.gst_breakdown.other_gst_amount",
  "invoice.round_off",
  "invoice.grand_total_printed",
];

/** @type {InvoiceJSON|null} */
let invoiceData = null;

let imageEl = new Image();
let imageFilename = "sample-invoice.png";
let imageLoaded = false;
let imageW = 1200,
  imageH = 900;

/** Canvas & view state */
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d", { alpha: false });
let zoom = 1;
let panX = 0,
  panY = 0;
let showLabels = true,
  showBorders = true,
  showFills = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let mouseDown = false;

/** Drawing state */
let armedLabel = null; // full path label, e.g. invoice.line_items[0].product_name
let armedGroup = null;
let armedColor = "#ffffff";
let armedIsLineItem = false;
let armedLIIndex = 0;

/** Boxes */
let annotations = /** @type {Annotation[]} */ ([]);
let selectedId = null;

/** Create/resize drag */
const HANDLE_SIZE = 6;
let currentAction = null;
let creationStart = null;
let resizeHandle = null;

/** History (undo/redo) */
let history = [];
let future = [];

/** UI refs */
const groupsContainer = document.getElementById("groupsContainer");
const armedFieldEl = document.getElementById("armedField");
const selectionInfo = document.getElementById("selectionInfo");
const validationOutput = document.getElementById("validationOutput");
const btnDelete = document.getElementById("btnDelete");
const lineItemPicker = document.getElementById("lineItemPicker");
const liIndexInput = document.getElementById("liIndex");
const zoomPct = document.getElementById("zoomPct");

/** New buttons (v1.2) */
const btnOCRAll = document.getElementById("btnOCRAll");
const btnReOCR = document.getElementById("btnReOCR");
const btnExportUpdatedJSON = document.getElementById("btnExportUpdatedJSON");

/** ------------------------------
 * Helpers
 * ------------------------------ */
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toImageSpace(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - panX) / zoom;
  const y = (clientY - rect.top - panY) / zoom;
  return { x, y };
}
function rectNormalize(x, y, w, h) {
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
}
function withinImage([x, y, w, h]) {
  x = clamp(x, 0, imageW);
  y = clamp(y, 0, imageH);
  w = clamp(w, 0, imageW - x);
  h = clamp(h, 0, imageH - y);
  return [x, y, w, h];
}
function groupOf(label) {
  if (label.startsWith("buyer.")) return "buyer";
  if (label.startsWith("seller.")) return "seller";
  if (label.startsWith("invoice.line_items[")) return "line";
  if (label.startsWith("invoice.")) {
    if (
      label.includes("gst_breakdown") ||
      label.includes("subtotal") ||
      label.includes("grand_total") ||
      label.includes("round_off")
    )
      return "totals";
    return "meta";
  }
  return "meta";
}
function colorOf(label) {
  return COLORS[groupOf(label)] || "#ffffff";
}
function displayTitle(key) {
  return DISPLAY_TITLES[key] || key;
}

function valueForLabel(label) {
  if (!invoiceData) return "";
  try {
    if (label.startsWith("invoice.line_items[")) {
      const m = label.match(/invoice\.line_items\[(\d+)\]\.(.+)$/);
      if (!m) return "";
      const idx = parseInt(m[1], 10);
      const key = m[2];
      const li = invoiceData.invoice?.line_items?.[idx];
      return li ? li[key] ?? "" : "";
    }
    const parts = label.split(".");
    let cur = /** @type {any} */ (invoiceData);
    for (const p of parts) {
      if (p.includes("[")) return "";
      cur = cur?.[p];
    }
    return cur ?? "";
  } catch {
    return "";
  }
}
function setAtPath(obj, path, rawValue) {
  // Write string values back into invoiceData based on label path.
  // We keep raw OCR text. (You can add numeric normalization later if you want.)
  const liMatch = path.match(/^invoice\.line_items\[(\d+)\]\.(.+)$/);
  if (liMatch) {
    const idx = parseInt(liMatch[1], 10);
    const key = liMatch[2];
    obj.invoice = obj.invoice || {};
    obj.invoice.line_items = Array.isArray(obj.invoice.line_items)
      ? obj.invoice.line_items
      : [];
    while (obj.invoice.line_items.length <= idx) {
      obj.invoice.line_items.push({
        product_name: null,
        unit: null,
        quantity: null,
        unit_price: null,
        line_total_printed: null,
      });
    }
    obj.invoice.line_items[idx][key] = rawValue ?? null;
    return;
  }
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === parts.length - 1) {
      cur[p] = rawValue ?? null;
    } else {
      cur[p] = cur[p] ?? {};
      cur = cur[p];
    }
  }
}
function countByField() {
  const map = {};
  for (const c of CLASSES) map[c] = 0;
  for (const a of annotations) {
    const key = a.label.replace(/\[\d+\]/, "[i]");
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}
function nextLineItemIndexForTemplate(templateKey) {
  // templateKey looks like "invoice.line_items[i].product_name"
  // We want to find the max index currently used for this template
  // and return max + 1. If none, return 0.
  const basePattern = templateKey.replace("[i]", "\\[(\\d+)\\]");
  const re = new RegExp("^" + basePattern + "$");
  let maxIdx = -1;

  for (const a of annotations) {
    const m = a.label.match(re);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (!Number.isNaN(idx) && idx > maxIdx) maxIdx = idx;
    }
  }
  return maxIdx + 1; // 0 if none used yet
}

function lineItemCount() {
  const arr = invoiceData?.invoice?.line_items;
  return Array.isArray(arr) ? arr.length : 0;
}
function highlightButtonForLabel(label) {
  const tpl = label.replace(/\[\d+\]/, "[i]");
  document.querySelectorAll(".field-btn").forEach((btn) => {
    const key = btn.getAttribute("data-key");
    btn.classList.toggle("active", key === tpl);
  });
}
function pushHistory() {
  history.push(JSON.stringify(annotations));
  if (history.length > 100) history.shift();
  future = [];
}
function undo() {
  if (history.length) {
    future.push(JSON.stringify(annotations));
    annotations = JSON.parse(history.pop());
    selectedId = null;
  }
}
function redo() {
  if (future.length) {
    history.push(JSON.stringify(annotations));
    annotations = JSON.parse(future.pop());
    selectedId = null;
  }
}

/** ------------------------------
 * OCR (Tesseract.js)
 * ------------------------------ */
async function ocrAnnotation(ann) {
  if (!imageLoaded) return;
  const [x, y, w, h] = ann.bbox.map(Math.round);
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, w);
  crop.height = Math.max(1, h);
  const cctx = crop.getContext("2d");
  cctx.drawImage(imageEl, x, y, w, h, 0, 0, w, h);
  // You can set a language here if needed, e.g. { lang: 'eng' }
  const { data } = await Tesseract.recognize(crop, "eng", {
    tessedit_char_whitelist: undefined,
  });
  const text = (data && data.text ? data.text : "").trim().replace(/\s+/g, " ");
  ann.value = text;
  // write into JSON
  if (invoiceData) setAtPath(invoiceData, ann.label, text || null);
  updateSelectionUI();
  validateAndShow();
}
async function ocrAllAnnotations() {
  for (const ann of annotations) {
    await ocrAnnotation(ann);
  }
  alert("OCR complete for all boxes.");
}

/** ------------------------------
 * Building sidebar (v1.2 shows ALL fields)
 * ------------------------------ */
function buildSidebar() {
  groupsContainer.innerHTML = "";
  if (!invoiceData) {
    groupsContainer.innerHTML = `<div class="muted">Load JSON to see fields</div>`;
    return;
  }
  const makeBtn = (templateKey, groupColor) => {
    const btn = document.createElement("button");
    btn.className = "field-btn";
    btn.textContent = displayTitle(templateKey);
    btn.setAttribute("data-key", templateKey);
    btn.style.borderColor = groupColor;

    btn.addEventListener("click", () => {
      if (templateKey.includes("[i]")) {
        // LINE-ITEM FIELD: auto-advance index based on how many of this field already exist
        armedIsLineItem = true;

        // Next free index for this specific field (product_name, unit, etc.)
        const nextIdx = nextLineItemIndexForTemplate(templateKey);
        armedLIIndex = nextIdx; // e.g. 0, then 1, then 2...
        liIndexInput.value = String(nextIdx); // update UI

        armedLabel = templateKey.replace("[i]", `[${armedLIIndex}]`);
      } else {
        // SCALAR FIELD
        armedIsLineItem = false;
        armedLabel = templateKey;
      }

      armedGroup = groupOf(armedLabel);
      armedColor = colorOf(armedLabel);
      armedFieldEl.textContent = armedLabel;
      lineItemPicker.hidden = !templateKey.includes("[i]");
      highlightButtonForLabel(armedLabel);
    });

    return btn;
  };

  for (const g of GROUPS) {
    const wrapper = document.createElement("div");
    wrapper.className = "group";
    wrapper.innerHTML = `
      <div class="group-title">
        <span>${g.title}</span>
        <span class="badge ${g.id}"></span>
      </div>
      <div class="fields"></div>
    `;
    const fieldsEl = wrapper.querySelector(".fields");

    // v1.2: ALWAYS render all field buttons (even when current JSON value is null)
    if (g.id === "line") {
      // show line buttons if there is at least one line item OR allow annotator to create from index box
      for (const f of g.fields) {
        fieldsEl.appendChild(makeBtn(f, COLORS[g.id]));
      }
    } else {
      for (const f of g.fields) {
        fieldsEl.appendChild(makeBtn(f, COLORS[g.id]));
      }
    }

    groupsContainer.appendChild(wrapper);
  }
  updateCountsUI();
}

/** ------------------------------
 * Rendering (unchanged from v1.1)
 * ------------------------------ */
function clearCanvas() {
  ctx.fillStyle = "#0a0f1f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function render() {
  clearCanvas();
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);
  if (imageLoaded) {
    ctx.drawImage(imageEl, 0, 0);
  } else {
    ctx.fillStyle = "#0d1225";
    ctx.fillRect(0, 0, imageW, imageH);
    ctx.strokeStyle = "#1e2a55";
    ctx.strokeRect(0.5, 0.5, imageW - 1, imageH - 1);
  }
  for (const ann of annotations) {
    const [x, y, w, h] = ann.bbox;
    if (showFills) {
      ctx.fillStyle = hexToRgba(ann.group_color, 0.12);
      ctx.fillRect(x, y, w, h);
    }
    if (showBorders) {
      ctx.lineWidth = (ann.id === selectedId ? 2 : 1) / zoom;
      ctx.strokeStyle = ann.group_color;
      ctx.strokeRect(x + 0.5 / zoom, y + 0.5 / zoom, w, h);
    }
    if (showLabels) {
      drawLabelPill(ann.label, x, y - 12, ann.group_color);
    }
    if (ann.id === selectedId && showBorders) {
      drawHandles(x, y, w, h);
    }
  }
  ctx.restore();
}
function drawLabelPill(text, x, y, color) {
  const padX = 6;
  ctx.save();
  ctx.font = `${
    12 / zoom
  }px ui-monospace, SFMono-Regular, Consolas, Menlo, monospace`;
  const w = ctx.measureText(text).width + (padX * 2) / zoom;
  const h = 16 / zoom;
  ctx.fillStyle = "#0a0f1f";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / zoom;
  roundRect(ctx, x, y, w, h, 8 / zoom, true, true);
  ctx.fillStyle = color;
  ctx.fillText(text, x + padX / zoom, y + 12 / zoom);
  ctx.restore();
}
function drawHandles(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  const hs = HANDLE_SIZE / zoom;
  const pts = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x + w, y + h / 2],
    [x + w, y + h],
    [x + w / 2, y + h],
    [x, y + h],
    [x, y + h / 2],
  ];
  for (const [hx, hy] of pts) {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.strokeRect(hx - hs / 2 + 0.5 / zoom, hy - hs / 2 + 0.5 / zoom, hs, hs);
  }
  ctx.restore();
}

function cursorForHandle(h) {
  // Map handle → CSS cursor
  if (h === "n" || h === "s") return "ns-resize";
  if (h === "e" || h === "w") return "ew-resize";
  if (h === "ne" || h === "sw") return "nesw-resize";
  if (h === "nw" || h === "se") return "nwse-resize";
  return "default";
}

function hitTestHandle(sel, x, y) {
  // Returns one of: "nw","n","ne","e","se","s","sw","w" or null
  // Uses a threshold that shrinks as you zoom in (so it feels consistent).
  const [bx, by, bw, bh] = sel.bbox;
  const x2 = bx + bw,
    y2 = by + bh;

  const handles = [
    { name: "nw", px: bx, py: by },
    { name: "n", px: bx + bw / 2, py: by },
    { name: "ne", px: x2, py: by },
    { name: "e", px: x2, py: by + bh / 2 },
    { name: "se", px: x2, py: y2 },
    { name: "s", px: bx + bw / 2, py: y2 },
    { name: "sw", px: bx, py: y2 },
    { name: "w", px: bx, py: by + bh / 2 },
  ];

  // HANDLE_SIZE is defined above; zoom is global. Add a tiny fudge so it’s easy to grab.
  const t = (HANDLE_SIZE + 2) / (zoom || 1);

  for (const h of handles) {
    if (Math.abs(x - h.px) <= t && Math.abs(y - h.py) <= t) {
      return h.name;
    }
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
function hexToRgba(hex, a) {
  const c = hex.replace("#", "");
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** ------------------------------
 * Mouse / keyboard (add OCR on create)
 * ------------------------------ */
canvas.addEventListener("mousedown", (e) => {
  const { x, y } = toImageSpace(e.clientX, e.clientY);
  if (e.button === 0) {
    if (isPanning) return;
    const sel = annotations.find((a) => a.id === selectedId);
    if (sel) {
      const h = hitTestHandle(sel, x, y);
      if (h) {
        currentAction = "resizing";
        resizeHandle = h;
        mouseDown = true;
        pushHistory();
        return;
      }
    }
    const hit = hitTestBox(x, y);
    if (hit) {
      if (hit.id !== selectedId) {
        selectedId = hit.id;
        updateSelectionUI();
        highlightButtonForLabel(hit.label);
        render();
      } else {
        currentAction = "moving";
        mouseDown = true;
        pushHistory();
      }
      return;
    }
    if (!armedLabel) return;
    currentAction = "creating";
    creationStart = { x, y };
    mouseDown = true;
    pushHistory();
  } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    panStart = { x: e.clientX - panX, y: e.clientY - panY };
  }
});
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = toImageSpace(e.clientX, e.clientY);
  if (isPanning) {
    panX = e.clientX - canvas.getBoundingClientRect().left - panStart.x;
    panY = e.clientY - canvas.getBoundingClientRect().top - panStart.y;
    render();
    return;
  }
  const sel = annotations.find((a) => a.id === selectedId);
  if (sel) {
    const h = hitTestHandle(sel, x, y);
    canvas.style.cursor = h
      ? cursorForHandle(h)
      : isPanning
      ? "grabbing"
      : "default";
  }
  if (!mouseDown) return;
  if (currentAction === "creating" && creationStart) {
    const [rx, ry, rw, rh] = rectNormalize(
      creationStart.x,
      creationStart.y,
      x - creationStart.x,
      y - creationStart.y
    );
    render();
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    if (showBorders) {
      ctx.strokeStyle = armedColor;
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(rx + 0.5 / zoom, ry + 0.5 / zoom, rw, rh);
    }
    if (showLabels) {
      drawLabelPill(armedLabel, rx, ry - 12, armedColor);
    }
    if (showFills) {
      ctx.fillStyle = hexToRgba(armedColor, 0.12);
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.restore();
  } else if (currentAction === "moving" && sel) {
    const prev = sel._movePrev || { x, y };
    const dx = x - prev.x,
      dy = y - prev.y;
    let [bx, by, bw, bh] = sel.bbox;
    bx = clamp(bx + dx, 0, imageW);
    by = clamp(by + dy, 0, imageH);
    bx = Math.min(bx, imageW - bw);
    by = Math.min(by, imageH - bh);
    sel.bbox = [Math.round(bx), Math.round(by), bw, bh];
    sel._movePrev = { x, y };
    render();
  } else if (currentAction === "resizing" && sel && resizeHandle) {
    let [bx, by, bw, bh] = sel.bbox;
    let nx = bx,
      ny = by,
      nw = bw,
      nh = bh;
    const rx = x,
      ry = y;
    const x2 = bx + bw,
      y2 = by + bh;
    if (resizeHandle.includes("n")) ny = Math.min(ry, y2 - 1);
    if (resizeHandle.includes("w")) nx = Math.min(rx, x2 - 1);
    if (resizeHandle.includes("s")) nh = Math.max(1, ry - ny);
    if (resizeHandle.includes("e")) nw = Math.max(1, rx - nx);
    if (resizeHandle === "n") nh = Math.max(1, y2 - ny);
    if (resizeHandle === "w") nw = Math.max(1, x2 - nx);
    if (resizeHandle.includes("n")) nh = y2 - ny;
    if (resizeHandle.includes("w")) nw = x2 - nx;
    nx = clamp(nx, 0, imageW);
    ny = clamp(ny, 0, imageH);
    nw = clamp(nw, 1, imageW - nx);
    nh = clamp(nh, 1, imageH - ny);
    sel.bbox = [Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh)];
    render();
  }
});
canvas.addEventListener("mouseup", async (e) => {
  mouseDown = false;
  isPanning = false;
  if (currentAction === "creating" && creationStart) {
    const { x, y } = toImageSpace(e.clientX, e.clientY);
    let [rx, ry, rw, rh] = rectNormalize(
      creationStart.x,
      creationStart.y,
      x - creationStart.x,
      y - creationStart.y
    );
    [rx, ry, rw, rh] = withinImage([rx, ry, rw, rh]);
    if (rw >= 2 && rh >= 2 && armedLabel) {
      const ann = /** @type {Annotation} */ ({
        id: uuid(),
        label: armedLabel,
        value: "", // will be filled by OCR
        bbox: [rx, ry, rw, rh],
        page: 0,
        group_color: armedColor,
        confidence: "exact",
      });
      annotations.push(ann);
      selectedId = ann.id;
      updateSelectionUI();
      highlightButtonForLabel(ann.label);
      updateCountsUI();
      render();

      // If this was a line-item field, prepare NEXT index automatically
      if (armedIsLineItem && armedLabel) {
        // derive base template: invoice.line_items[i].product_name -> with [i]
        const base = armedLabel.replace(/\[\d+\]/, "[i]");
        // compute next free index for that template
        const nextIdx = nextLineItemIndexForTemplate(base);
        armedLIIndex = nextIdx;
        liIndexInput.value = String(nextIdx);
        armedLabel = base.replace("[i]", `[${nextIdx}]`);
        armedFieldEl.textContent = armedLabel;
      }

      // NEW: auto-OCR on create
      try {
        await ocrAnnotation(ann);
      } catch {
        /* ignore OCR errors for now */
      }
    }
  } else if (currentAction === "moving") {
    const sel = annotations.find((a) => a.id === selectedId);
    if (sel) delete sel._movePrev;
  }
  currentAction = null;
  creationStart = null;
  resizeHandle = null;
  render();
});
canvas.addEventListener("mouseleave", () => {
  mouseDown = false;
  isPanning = false;
  currentAction = null;
  creationStart = null;
  resizeHandle = null;
});

canvas.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const scale = Math.exp(-e.deltaY * 0.0015);
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left - panX) / zoom;
      const cy = (e.clientY - rect.top - panY) / zoom;
      zoom = clamp(zoom * scale, 0.2, 6);
      panX = e.clientX - rect.left - cx * zoom;
      panY = e.clientY - rect.top - cy * zoom;
      updateZoomUI();
      render();
    }
  },
  { passive: false }
);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    isPanning = true;
    canvas.style.cursor = "grabbing";
  }
  if (e.key === "Escape") {
    if (currentAction === "creating") {
      currentAction = null;
      creationStart = null;
      render();
    }
    armedLabel = null;
    armedGroup = null;
    armedFieldEl.textContent = "None";
    lineItemPicker.hidden = true;
    highlightButtonForLabel("__none__");
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    updateSelectionUI();
    updateCountsUI();
    render();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
    updateSelectionUI();
    updateCountsUI();
    render();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedId) {
      pushHistory();
      const idx = annotations.findIndex((a) => a.id === selectedId);
      if (idx >= 0) annotations.splice(idx, 1);
      selectedId = null;
      updateSelectionUI();
      updateCountsUI();
      render();
    }
  }
  if (e.key.toLowerCase() === "h") {
    const c = document.getElementById("chkShowLabels");
    c.checked = !c.checked;
    showLabels = c.checked;
    render();
  }
  if (e.key.toLowerCase() === "b") {
    const c = document.getElementById("chkShowBorders");
    c.checked = !c.checked;
    showBorders = c.checked;
    render();
  }
  if (e.key.toLowerCase() === "f") {
    const c = document.getElementById("chkShowFills");
    c.checked = !c.checked;
    showFills = c.checked;
    render();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    isPanning = false;
    canvas.style.cursor = "crosshair";
  }
});

function hitTestBox(x, y) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const [bx, by, bw, bh] = annotations[i].bbox;
    if (x >= bx && y >= by && x <= bx + bw && y <= by + bh)
      return annotations[i];
  }
  return null;
}

/** ------------------------------
 * UI hooks
 * ------------------------------ */
document
  .getElementById("btnLoadImage")
  .addEventListener("click", () =>
    document.getElementById("fileImage").click()
  );
document.getElementById("fileImage").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  imageFilename = file.name;
  const fr = new FileReader();
  fr.onload = () => {
    const url = fr.result;
    imageEl = new Image();
    imageEl.onload = () => {
      imageW = imageEl.naturalWidth;
      imageH = imageEl.naturalHeight;
      imageLoaded = true;
      fitImageToCanvas();
      render();
    };
    imageEl.src = url;
  };
  fr.readAsDataURL(file);
});

// Load Labels JSON (re-use the old btnLoadJSON / fileJSON IDs)
document
  .getElementById("btnLoadJSON")
  .addEventListener("click", () => document.getElementById("fileJSON").click());

document.getElementById("fileJSON").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const fr = new FileReader();
  fr.onload = () => {
    try {
      const payload = JSON.parse(fr.result);

      if (!payload || !Array.isArray(payload.annotations)) {
        alert("Invalid labels JSON: missing annotations array.");
        return;
      }

      // Restore annotations from labels JSON
      annotations = payload.annotations.map((a) => {
        const bbox =
          Array.isArray(a.bbox) && a.bbox.length === 4 ? a.bbox : [0, 0, 1, 1];

        return {
          id: a.id || uuid(),
          label: a.label,
          value: a.value || "",
          bbox: withinImage(bbox),
          page: a.page ?? 0,
          group_color: a.group_color || colorOf(a.label),
          confidence: a.confidence || "exact",
        };
      });

      // Clear selection & history
      selectedId = null;
      history = [];
      future = [];

      // If labels JSON has image metadata, use it
      if (payload.image) {
        if (payload.image.filename) {
          imageFilename = payload.image.filename;
        }
        if (payload.image.width && payload.image.height) {
          imageW = payload.image.width;
          imageH = payload.image.height;
        }
      }

      // If an invoice JSON is already loaded, sync values back into it
      if (invoiceData) {
        for (const ann of annotations) {
          if (ann.value) {
            setAtPath(invoiceData, ann.label, ann.value);
          }
        }
      }

      updateCountsUI();
      updateSelectionUI();
      validateAndShow();
      fitImageToCanvas();
      render();
    } catch (err) {
      alert("Invalid labels JSON: " + err);
    }
  };

  fr.readAsText(file, "utf-8");
});

document.getElementById("btnReset").addEventListener("click", () => {
  if (!confirm("Reset canvas, annotations, and selection?")) return;
  armedLabel = null;
  armedGroup = null;
  armedFieldEl.textContent = "None";
  document
    .querySelectorAll(".field-btn")
    .forEach((b) => b.classList.remove("active"));
  annotations = [];
  selectedId = null;
  history = [];
  future = [];
  showLabels = document.getElementById("chkShowLabels").checked = true;
  showBorders = document.getElementById("chkShowBorders").checked = true;
  showFills = document.getElementById("chkShowFills").checked = false;
  fitImageToCanvas();
  updateSelectionUI();
  updateCountsUI();
  render();
});

document.getElementById("chkShowLabels").addEventListener("change", (e) => {
  showLabels = e.target.checked;
  render();
});
document.getElementById("chkShowBorders").addEventListener("change", (e) => {
  showBorders = e.target.checked;
  render();
});
document.getElementById("chkShowFills").addEventListener("change", (e) => {
  showFills = e.target.checked;
  render();
});
liIndexInput.addEventListener("change", () => {
  if (!armedIsLineItem) return;
  const i = Math.max(0, parseInt(liIndexInput.value || "0", 10) || 0);
  armedLIIndex = i;
  if (armedLabel) {
    const base = armedLabel.replace(/\[\d+\]/, "[i]");
    armedLabel = base.replace("[i]", `[${i}]`);
    armedFieldEl.textContent = armedLabel;
    highlightButtonForLabel(armedLabel);
  }
});

btnDelete.addEventListener("click", () => {
  if (!selectedId) return;
  pushHistory();
  const idx = annotations.findIndex((a) => a.id === selectedId);
  if (idx >= 0) annotations.splice(idx, 1);
  selectedId = null;
  updateSelectionUI();
  updateCountsUI();
  render();
});

/** v1.2 new buttons */
btnOCRAll.addEventListener("click", async () => {
  if (!annotations.length) return alert("No boxes to OCR.");
  await ocrAllAnnotations();
});
btnReOCR.addEventListener("click", async () => {
  const sel = annotations.find((a) => a.id === selectedId);
  if (!sel) return alert("Select a box first.");
  await ocrAnnotation(sel);
});
btnExportUpdatedJSON.addEventListener("click", () => {
  if (!invoiceData) return alert("Load a JSON first.");
  // Optionally deep copy and export. Here we export current in-memory invoiceData (already updated).
  const blob = new Blob([JSON.stringify(invoiceData, null, 2)], {
    type: "application/json",
  });
  const base = (imageFilename || "image").replace(/\.(png|jpg|jpeg)$/i, "");
  triggerDownload(URL.createObjectURL(blob), `${base}-invoice-updated.json`);
});

document
  .getElementById("btnExportPNG")
  .addEventListener("click", exportAnnotatedPNG);
document
  .getElementById("btnExportLabels")
  .addEventListener("click", exportLabelsJSON);
document.getElementById("btnExportCOCO").addEventListener("click", exportCOCO);

document.getElementById("toggleLeft").addEventListener("click", () => {
  document.getElementById("sidebarLeft").classList.toggle("closed");
});
document.getElementById("toggleRight").addEventListener("click", () => {
  document.getElementById("sidebarRight").classList.toggle("closed");
});

function updateSelectionUI() {
  const sel = annotations.find((a) => a.id === selectedId);
  if (!sel) {
    selectionInfo.textContent = "No selection";
    btnDelete.disabled = true;
    return;
  }
  const [x, y, w, h] = sel.bbox;
  selectionInfo.innerHTML = `
    <div><strong>Label:</strong> ${sel.label}</div>
    <div><strong>Value:</strong> ${escapeHTML(sel.value || "")}</div>
    <div><strong>BBox:</strong> [${x}, ${y}, ${w}, ${h}]</div>
  `;
  btnDelete.disabled = false;
}
function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}
function updateZoomUI() {
  zoomPct.textContent = Math.round(zoom * 100) + "%";
}

/** ------------------------------
 * Validation (same as v1.1)
 * ------------------------------ */
function validate() {
  /** @type {string[]} */ const warnings = [];
  /** @type {string[]} */ const omitted = [];
  for (const c of CLASSES) {
    if (c.includes("[i]")) continue;
    const v = valueForLabel(c);
    if (v === null || v === undefined) {
      omitted.push(c);
    }
  }
  const scalarKeys = CLASSES.filter(
    (c) => !c.includes("[i]") && !c.startsWith("invoice.line_items")
  );
  for (const key of scalarKeys) {
    const v = valueForLabel(key);
    if (v === null || v === undefined) continue;
    const count = annotations.filter((a) => a.label === key).length;
    if (count === 0) warnings.push(`${key} has 0 boxes`);
    if (count > 1) warnings.push(`${key} has >1 boxes`);
  }
  for (const a of annotations) {
    const [x, y, w, h] = a.bbox;
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > imageW || y + h > imageH) {
      warnings.push(`Annotation ${a.id} (${a.label}) is out of bounds`);
    }
  }
  const productCountsByIndex = {};
  for (const a of annotations) {
    const m = a.label.match(/invoice\.line_items\[(\d+)\]\.product_name/);
    if (m) {
      const i = Number(m[1]);
      productCountsByIndex[i] = (productCountsByIndex[i] || 0) + 1;
    }
  }
  for (const i of Object.keys(productCountsByIndex)) {
    const n = productCountsByIndex[i];
    if (n > 1) {
      const qtyBoxes = annotations.filter(
        (a) => a.label === `invoice.line_items[${i}].quantity`
      ).length;
      if (qtyBoxes < 1)
        warnings.push(
          `Line item [${i}] has ${n} products annotated — consider updating 'quantity' to ${n}.`
        );
    }
  }
  if (invoiceData?.meta?.warnings?.length) {
    for (const w of invoiceData.meta.warnings) {
      warnings.push(w);
    }
  }
  return { warnings, omitted };
}
function validateAndShow() {
  const v = validate();
  validationOutput.textContent = JSON.stringify(v, null, 2);
}

/** ------------------------------
 * Exporters (unchanged) + Export Updated JSON above
 * ------------------------------ */
function exportAnnotatedPNG() {
  const cs = document.createElement("canvas");
  cs.width = imageW;
  cs.height = imageH;
  const c2 = cs.getContext("2d", { alpha: false });
  if (imageLoaded) {
    c2.drawImage(imageEl, 0, 0);
  } else {
    c2.fillStyle = "#0d1225";
    c2.fillRect(0, 0, imageW, imageH);
  }
  for (const ann of annotations) {
    const [x, y, w, h] = ann.bbox;
    if (showFills) {
      c2.fillStyle = hexToRgba(ann.group_color, 0.12);
      c2.fillRect(x, y, w, h);
    }
    if (showBorders) {
      c2.strokeStyle = ann.group_color;
      c2.lineWidth = ann.id === selectedId ? 2 : 1;
      c2.strokeRect(x + 0.5, y + 0.5, w, h);
    }
    if (showLabels) {
      drawLabelPillDirect(c2, ann.label, x, y - 12, ann.group_color);
    }
  }
  const url = cs.toDataURL("image/png");
  const base = (imageFilename || "image").replace(/\.(png|jpg|jpeg)$/i, "");
  triggerDownload(url, `${base}-annotated.png`);
}
function drawLabelPillDirect(c2, text, x, y, color) {
  const padX = 6;
  c2.save();
  c2.font = `12px ui-monospace, SFMono-Regular, Consolas, Menlo, monospace`;
  const w = c2.measureText(text).width + padX * 2;
  const h = 16;
  c2.fillStyle = "#0a0f1f";
  c2.strokeStyle = color;
  c2.lineWidth = 1;
  roundRect(c2, x, y, w, h, 8, true, true);
  c2.fillStyle = color;
  c2.fillText(text, x + padX, y + 12);
  c2.restore();
}
function exportLabelsJSON() {

  const payload = {
    image: {
      filename: imageFilename || "image.png",
      width: imageW,
      height: imageH,
      pages: 1,
    },
    classes: CLASSES,
    annotations: annotations.map((a) => ({
      id: a.id,
      label: a.label,
      value: a.value,
      bbox: a.bbox.map((n) => Math.round(n)),
      page: 0,
      group_color: a.group_color,
      confidence: a.confidence,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const base = (imageFilename || "image").replace(/\.(png|jpg|jpeg)$/i, "");
  triggerDownload(URL.createObjectURL(blob), `${base}-labels.json`);
}

function exportCOCO() {
  const cats = [];
  const nameToId = {};
  let catId = 1;
  for (const c of CLASSES) {
    if (c.includes("[i]")) continue;
    nameToId[c] = catId;
    cats.push({ id: catId, name: c, supercategory: groupOf(c) });
    catId++;
  }
  const images = [
    {
      id: 1,
      file_name: imageFilename || "image.png",
      width: imageW,
      height: imageH,
    },
  ];
  let annId = 1;
  const anns = [];
  for (const a of annotations) {
    const key = a.label.replace(/\[\d+\]/, "[i]");
    const cid =
      nameToId[key] ||
      (nameToId[key] =
        (cats.push({ id: catId, name: key, supercategory: groupOf(key) }),
        catId++));
    const [x, y, w, h] = a.bbox.map(Math.round);
    anns.push({
      id: annId++,
      image_id: 1,
      category_id: cid,
      bbox: [x, y, w, h],
      area: w * h,
      iscrowd: 0,
    });
  }
  const coco = { images, annotations: anns, categories: cats };
  const blob = new Blob([JSON.stringify(coco, null, 2)], {
    type: "application/json",
  });
  const base = (imageFilename || "image").replace(/\.(png|jpg|jpeg)$/i, "");
  triggerDownload(URL.createObjectURL(blob), `${base}-coco.json`);
}
function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** ------------------------------
 * Fit & boot (unchanged)
 * ------------------------------ */
function fitImageToCanvas() {
  const wrap = document.querySelector(".stage-wrap");
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height - 70;
  const scaleX = canvas.width / imageW,
    scaleY = canvas.height / imageH;
  zoom = Math.min(scaleX, scaleY);
  zoom = clamp(zoom, 0.2, 6);
  updateZoomUI();
  const visW = imageW * zoom,
    visH = imageH * zoom;
  panX = (canvas.width - visW) / 2;
  panY = (canvas.height - visH) / 2;
  render();
}
window.addEventListener("resize", () => {
  fitImageToCanvas();
});

(async function boot() {
  try {
    const resp = await fetch("./sample/sample.json");
    const data = await resp.json();
    invoiceData = data;
  } catch {
    invoiceData = null;
  }
  buildSidebar();
  validateAndShow();

  try {
    const resp = await fetch("./sample/sample-invoice.png");
    const blob = await resp.blob();
    imageFilename = "sample-invoice.png";
    const url = URL.createObjectURL(blob);
    imageEl = new Image();
    imageEl.onload = () => {
      imageW = imageEl.naturalWidth || 1000;
      imageH = imageEl.naturalHeight || 1400;
      imageLoaded = true;
      fitImageToCanvas();
      render();
    };
    imageEl.src = url;
  } catch {
    imageLoaded = false;
    imageW = 1000;
    imageH = 1400;
    fitImageToCanvas();
    render();
  }
})();

/** ------------------------------
 * Click selection (unchanged)
 * ------------------------------ */
canvas.addEventListener("click", (e) => {
  if (currentAction) return;
  const { x, y } = toImageSpace(e.clientX, e.clientY);
  const hit = hitTestBox(x, y);
  if (hit) {
    selectedId = hit.id;
    updateSelectionUI();
    highlightButtonForLabel(hit.label);
    render();
  }
});

/** ------------------------------
 * Counts & Validation refresh
 * ------------------------------ */
function updateCountsUI() {
  const counts = countByField();
  document.querySelectorAll(".field-btn").forEach((btn) => {
    const key = btn.getAttribute("data-key");
    if (!key) return;
    const count = counts[key] || 0;
    btn.setAttribute("data-count", String(count));
  });
}
function updateCountsAndValidation() {
  updateCountsUI();
  validateAndShow();
}
setInterval(updateCountsAndValidation, 800);
