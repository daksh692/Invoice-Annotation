/* Invoice Annotator - Vanilla, Offline (v1.1)
 * Changes in this version:
 * - Removed invoice.raw_date and invoice.currency (UI/validation/exports)
 * - Short, human-friendly field names in sidebar; ML-friendly full labels in annotations/exports
 * - Clearer selection: highlight matching sidebar button; thicker border on selected box
 * - Validation hint: if multiple product_name boxes exist for the same line index, suggest updating quantity
 */

/** ------------------------------
 * Types via JSDoc (for clarity)
 * ------------------------------ */
/**
 * @typedef {Object} InvoiceJSON
 * @property {{company_name:string|null,address:string|null,gstin:string|null}} buyer
 * @property {{company_name:string|null,address:string|null,gstin:string|null}} seller
 * @property {{
 *  bill_no:string|null,date:string|null,
 *  line_items:Array<{product_name:string|null,unit:string|null,quantity:number|null,unit_price:number|null,line_total_calculated:number|null,line_total_printed:number|null}>|null,
 *  subtotal_calculated:number|null, subtotal_printed:number|null,
 *  gst_breakdown:{
 *    cgst_percent:number|null,cgst_amount:number|null,
 *    sgst_percent:number|null,sgst_amount:number|null,
 *    other_gst_label:string|null,other_gst_percent:number|null,other_gst_amount:number|null
 *  }|null,
 *  round_off:number|null,
 *  grand_total_calculated:number|null, grand_total_printed:number|null
 * }} invoice
 * @property {{low_confidence_fields:string[],unparsed_text_snippets:string[]}} confidence_notes
 * @property {{source_pages:number,warnings:string[]}} meta
 */

/**
 * @typedef {Object} Annotation
 * @property {string} id
 * @property {string} label
 * @property {string} value
 * @property {[number,number,number,number]} bbox  // [x,y,w,h] image-space ints
 * @property {number} page
 * @property {string} group_color
 * @property {"exact"|"low"|"unsure"} confidence
 */

/**
 * @typedef {Object} ExportJSON
 * @property {{filename:string,width:number,height:number,pages:number}} image
 * @property {string[]} classes
 * @property {Annotation[]} annotations
 * @property {{warnings:string[], omitted_null_fields:string[]}} notes
 */

/** ------------------------------
 * State & constants
 * ------------------------------ */
const COLORS = {
  buyer: "#2563EB",
  seller: "#EF4444",
  meta: "#10B981",
  line: "#F59E0B",
  totals: "#8B5CF6",
};

// Display titles for buttons (keep ML labels intact in data)
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
  "invoice.grand_total_printed": "Grand Total"
};

const GROUPS = [
  { id: "buyer", title: "Buyer", color: COLORS.buyer, fields: [
    "buyer.company_name", "buyer.address", "buyer.gstin"
  ]},
  { id: "seller", title: "Seller", color: COLORS.seller, fields: [
    "seller.company_name", "seller.address", "seller.gstin"
  ]},
  { id: "meta", title: "Invoice Meta", color: COLORS.meta, fields: [
    "invoice.bill_no","invoice.date"
  ]},
  { id: "line", title: "Line Items", color: COLORS.line, fields: [
    "invoice.line_items[i].product_name",
    "invoice.line_items[i].unit",
    "invoice.line_items[i].quantity",
    "invoice.line_items[i].unit_price",
    "invoice.line_items[i].line_total_printed"
  ]},
  { id: "totals", title: "Totals / GST", color: COLORS.totals, fields: [
    "invoice.subtotal_printed",
    "invoice.gst_breakdown.cgst_percent","invoice.gst_breakdown.cgst_amount",
    "invoice.gst_breakdown.sgst_percent","invoice.gst_breakdown.sgst_amount",
    "invoice.gst_breakdown.other_gst_label","invoice.gst_breakdown.other_gst_percent","invoice.gst_breakdown.other_gst_amount",
    "invoice.round_off","invoice.grand_total_printed"
  ]},
];

// Master class list used in exports/validation (no raw_date/currency)
const CLASSES = [
  "buyer.company_name","buyer.address","buyer.gstin",
  "seller.company_name","seller.address","seller.gstin",
  "invoice.bill_no","invoice.date",
  "invoice.line_items[i].product_name","invoice.line_items[i].unit","invoice.line_items[i].quantity","invoice.line_items[i].unit_price","invoice.line_items[i].line_total_printed",
  "invoice.subtotal_printed",
  "invoice.gst_breakdown.cgst_percent","invoice.gst_breakdown.cgst_amount",
  "invoice.gst_breakdown.sgst_percent","invoice.gst_breakdown.sgst_amount",
  "invoice.gst_breakdown.other_gst_label","invoice.gst_breakdown.other_gst_percent","invoice.gst_breakdown.other_gst_amount",
  "invoice.round_off","invoice.grand_total_printed"
];

/** @type {InvoiceJSON|null} */
let invoiceData = null;

let imageEl = new Image();
let imageFilename = "sample-invoice.png";
let imageLoaded = false;
let imageW = 1200, imageH = 900; // defaults (replaced on load)

/** Canvas & view state */
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d", { alpha: false });
let zoom = 1;
let panX = 0, panY = 0;
let showLabels = true, showBorders = true, showFills = false;
let isPanning = false;
let panStart = {x:0,y:0};
let mouseDown = false;

/** Drawing state */
let armedLabel = null; // ML full label (e.g., invoice.line_items[0].product_name)
let armedGroup = null; // group id
let armedColor = "#ffffff";
let armedIsLineItem = false;
let armedLIIndex = 0;

/** Boxes */
let annotations = /** @type {Annotation[]} */([]);
let selectedId = null;

/** Create/resize drag */
const HANDLE_SIZE = 6;
let currentAction = null; // "creating" | "moving" | "resizing" | null
let creationStart = null; // image-space {x,y}
let resizeHandle = null; // which handle name

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

/** ------------------------------
 * Helpers
 * ------------------------------ */
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c)=>{
    const r = Math.random()*16|0;
    const v = c==="x" ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function toImageSpace(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - panX)/zoom;
  const y = (clientY - rect.top - panY)/zoom;
  return {x,y};
}
function rectNormalize(x,y,w,h){
  if(w<0){ x+=w; w=-w; }
  if(h<0){ y+=h; h=-h; }
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  return [x,y,w,h];
}
function withinImage(b){
  let [x,y,w,h]=b;
  x = clamp(x,0,imageW); y = clamp(y,0,imageH);
  w = clamp(w,0,imageW - x); h = clamp(h,0,imageH - y);
  return [x,y,w,h];
}
function handleNames(){ return ["nw","n","ne","e","se","s","sw","w"]; }
function hitTestHandle(ann, mx, my){
  const [x,y,w,h] = ann.bbox;
  const points = {
    nw:[x,y], n:[x+w/2,y], ne:[x+w,y], e:[x+w,y+h/2],
    se:[x+w,y+h], s:[x+w/2,y+h], sw:[x,y+h], w:[x,y+h/2]
  };
  for(const k of Object.keys(points)){
    const [hx,hy] = points[k];
    const dx = mx - hx; const dy = my - hy;
    if(Math.abs(dx)<=HANDLE_SIZE/zoom && Math.abs(dy)<=HANDLE_SIZE/zoom){
      return k;
    }
  }
  return null;
}
function cursorForHandle(h){
  const map = {nw:"nwse-resize",se:"nwse-resize",ne:"nesw-resize",sw:"nesw-resize",n:"ns-resize",s:"ns-resize",e:"ew-resize",w:"ew-resize"};
  return map[h]||"default";
}
function groupOf(label){
  if(label.startsWith("buyer.")) return "buyer";
  if(label.startsWith("seller.")) return "seller";
  if(label.startsWith("invoice.line_items[")) return "line";
  if(label.startsWith("invoice.")) {
    if(label.includes("gst_breakdown") || label.includes("subtotal") || label.includes("grand_total") || label.includes("round_off"))
      return "totals";
    return "meta";
  }
  return "meta";
}
function colorOf(label){ return COLORS[groupOf(label)] || "#ffffff"; }
function displayTitle(key){ return DISPLAY_TITLES[key] || key; }

function valueForLabel(label){
  if(!invoiceData) return "";
  try{
    if(label.startsWith("invoice.line_items[")){
      const m = label.match(/invoice\.line_items\[(\d+)\]\.(.+)$/);
      if(!m) return "";
      const idx = parseInt(m[1],10);
      const key = m[2];
      const li = invoiceData.invoice?.line_items?.[idx];
      return li ? (li[key] ?? "") : "";
    }
    const parts = label.split(".");
    let cur = /** @type {any} */ (invoiceData);
    for(const p of parts){
      if(p.includes("[")) return "";
      cur = cur?.[p];
    }
    return cur ?? "";
  }catch{ return ""; }
}
function countByField(){
  const map = {};
  for(const c of CLASSES) map[c]=0;
  for(const a of annotations){
    const key = a.label.replace(/\[\d+\]/, "[i]");
    map[key] = (map[key]||0)+1;
  }
  return map;
}
function lineItemCount(){
  const arr = invoiceData?.invoice?.line_items;
  return Array.isArray(arr) ? arr.length : 0;
}
function highlightButtonForLabel(label){
  // Highlight the corresponding template button (replace index by [i] for line items)
  const tpl = label.replace(/\[\d+\]/, "[i]");
  document.querySelectorAll(".field-btn").forEach(btn=>{
    const key = btn.getAttribute("data-key");
    btn.classList.toggle("active", key===tpl);
  });
}
function pushHistory(){
  history.push(JSON.stringify(annotations));
  if(history.length>100) history.shift();
  future = [];
}
function undo(){ if(history.length){ future.push(JSON.stringify(annotations)); annotations = JSON.parse(history.pop()); selectedId=null; } }
function redo(){ if(future.length){ history.push(JSON.stringify(annotations)); annotations = JSON.parse(future.pop()); selectedId=null; } }

/** ------------------------------
 * Building sidebar (data-driven)
 * ------------------------------ */
function buildSidebar(){
  groupsContainer.innerHTML = "";
  if(!invoiceData){
    groupsContainer.innerHTML = `<div class="muted">Load JSON to see fields</div>`;
    return;
  }

  const makeBtn = (templateKey, groupColor) => {
    const btn = document.createElement("button");
    btn.className="field-btn";
    btn.textContent = displayTitle(templateKey);
    btn.setAttribute("data-key", templateKey);
    btn.style.borderColor = groupColor;
    btn.addEventListener("click", ()=>{
      if(templateKey.includes("[i]")){
        armedIsLineItem = true;
        armedLIIndex = parseInt(liIndexInput.value||"0",10) || 0;
        armedLabel = templateKey.replace("[i]", `[${armedLIIndex}]`);
      } else {
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

  for(const g of GROUPS){
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

    if(g.id==="line"){
      if(lineItemCount()>0){
        for(const f of g.fields){ fieldsEl.appendChild(makeBtn(f, COLORS[g.id])); }
      } else {
        fieldsEl.innerHTML = `<div class="muted">No line items in JSON</div>`;
      }
    } else {
      // show only non-null scalars
      for(const f of g.fields){
        const v = valueForLabel(f);
        if(v === null || v === undefined) continue;
        fieldsEl.appendChild(makeBtn(f, COLORS[g.id]));
      }
      if(!fieldsEl.children.length){
        fieldsEl.innerHTML = `<div class="muted">No non-null fields</div>`;
      }
    }

    groupsContainer.appendChild(wrapper);
  }
  updateCountsUI();
}

/** ------------------------------
 * Rendering
 * ------------------------------ */
function clearCanvas(){
  ctx.fillStyle = "#0a0f1f";
  ctx.fillRect(0,0,canvas.width, canvas.height);
}
function render(){
  clearCanvas();

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Draw image
  if(imageLoaded){
    ctx.drawImage(imageEl, 0,0);
  } else {
    ctx.fillStyle = "#0d1225"; ctx.fillRect(0,0,imageW,imageH);
    ctx.strokeStyle = "#1e2a55"; ctx.strokeRect(0.5,0.5,imageW-1,imageH-1);
  }

  // Draw boxes
  for(const ann of annotations){
    const [x,y,w,h]=ann.bbox;
    if(showFills){
      ctx.fillStyle = hexToRgba(ann.group_color, 0.12);
      ctx.fillRect(x,y,w,h);
    }
    if(showBorders){
      ctx.lineWidth = (ann.id===selectedId ? 2 : 1)/zoom;
      ctx.strokeStyle = ann.group_color;
      ctx.strokeRect(x+0.5/zoom, y+0.5/zoom, w, h);
    }
    if(showLabels){
      drawLabelPill(ann.label, x, y-12, ann.group_color);
    }
    if(ann.id===selectedId && showBorders){
      drawHandles(x,y,w,h);
    }
  }

  ctx.restore();
}
function drawLabelPill(text, x, y, color){
  const padX = 6;
  ctx.save();
  ctx.font = `${12/zoom}px ui-monospace, SFMono-Regular, Consolas, Menlo, monospace`;
  const w = ctx.measureText(text).width + padX*2/zoom;
  const h = 16/zoom;
  ctx.fillStyle = "#0a0f1f";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1/zoom;
  roundRect(ctx, x, y, w, h, 8/zoom, true, true);
  ctx.fillStyle = color;
  ctx.fillText(text, x+padX/zoom, y+12/zoom);
  ctx.restore();
}
function drawHandles(x,y,w,h){
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  const hs = HANDLE_SIZE/zoom;
  const pts = [
    [x,y],[x+w/2,y],[x+w,y],[x+w,y+h/2],[x+w,y+h],[x+w/2,y+h],[x,y+h],[x,y+h/2]
  ];
  for(const [hx,hy] of pts){
    ctx.fillRect(hx-hs/2, hy-hs/2, hs, hs);
    ctx.strokeRect(hx-hs/2+0.5/zoom, hy-hs/2+0.5/zoom, hs, hs);
  }
  ctx.restore();
}
function roundRect(ctx, x,y,w,h,r, fill, stroke){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y, x+w,y+h,r);
  ctx.arcTo(x+w,y+h, x,y+h,r);
  ctx.arcTo(x,y+h, x,y,r);
  ctx.arcTo(x,y, x+w,y,r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}
function hexToRgba(hex, a){
  const c = hex.replace("#","");
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** ------------------------------
 * Mouse / keyboard
 * ------------------------------ */
canvas.addEventListener("mousedown", (e)=>{
  const {x,y} = toImageSpace(e.clientX, e.clientY);

  if(e.button===0){
    if(isPanning){ return; }

    const sel = annotations.find(a=>a.id===selectedId);
    if(sel){
      const h = hitTestHandle(sel, x,y);
      if(h){
        currentAction = "resizing";
        resizeHandle = h;
        mouseDown = true;
        pushHistory();
        return;
      }
    }

    const hit = hitTestBox(x,y);
    if(hit){
      if(hit.id !== selectedId){
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

    if(!armedLabel) return;
    currentAction = "creating";
    creationStart = {x,y};
    mouseDown = true;
    pushHistory();
  } else if(e.button===1 || (e.button===0 && e.shiftKey)){
    isPanning = true;
    panStart = {x: e.clientX - panX, y: e.clientY - panY};
  }
});
canvas.addEventListener("mousemove", (e)=>{
  const {x,y} = toImageSpace(e.clientX, e.clientY);

  if(isPanning){
    panX = e.clientX - panStart.x;
    panY = e.clientY - panStart.y;
    render();
    return;
  }

  const sel = annotations.find(a=>a.id===selectedId);
  if(sel){
    const h = hitTestHandle(sel, x,y);
    canvas.style.cursor = h ? cursorForHandle(h) : (isPanning? "grabbing" : "default");
  }

  if(!mouseDown) return;

  if(currentAction==="creating" && creationStart){
    const [rx,ry,rw,rh] = rectNormalize(creationStart.x, creationStart.y, x-creationStart.x, y-creationStart.y);
    render();
    ctx.save(); ctx.translate(panX,panY); ctx.scale(zoom,zoom);
    if(showBorders){ ctx.strokeStyle = armedColor; ctx.lineWidth = 1/zoom; ctx.strokeRect(rx+0.5/zoom,ry+0.5/zoom,rw,rh); }
    if(showLabels){ drawLabelPill(armedLabel, rx, ry-12, armedColor); }
    if(showFills){ ctx.fillStyle=hexToRgba(armedColor,0.12); ctx.fillRect(rx,ry,rw,rh); }
    ctx.restore();
  } else if(currentAction==="moving" && sel){
    const prev = sel._movePrev || {x, y};
    const dx = x - prev.x; const dy = y - prev.y;
    let [bx,by,bw,bh] = sel.bbox;
    bx = clamp(bx+dx,0,imageW); by = clamp(by+dy,0,imageH);
    bx = Math.min(bx, imageW - bw);
    by = Math.min(by, imageH - bh);
    sel.bbox = [Math.round(bx),Math.round(by),bw,bh];
    sel._movePrev = {x,y};
    render();
  } else if(currentAction==="resizing" && sel && resizeHandle){
    let [bx,by,bw,bh] = sel.bbox;
    let nx=bx, ny=by, nw=bw, nh=bh;
    const rx = x, ry = y;

    const x2 = bx+bw, y2 = by+bh;
    if(resizeHandle.includes("n")) ny = Math.min(ry, y2-1);
    if(resizeHandle.includes("w")) nx = Math.min(rx, x2-1);
    if(resizeHandle.includes("s")) nh = Math.max(1, ry - ny);
    if(resizeHandle.includes("e")) nw = Math.max(1, rx - nx);
    if(resizeHandle==="n") nh = Math.max(1, y2 - ny);
    if(resizeHandle==="w") nw = Math.max(1, x2 - nx);

    if(resizeHandle.includes("n")) nh = y2 - ny;
    if(resizeHandle.includes("w")) nw = x2 - nx;

    nx = clamp(nx,0,imageW); ny = clamp(ny,0,imageH);
    nw = clamp(nw,1,imageW - nx); nh = clamp(nh,1,imageH - ny);

    sel.bbox = [Math.round(nx),Math.round(ny),Math.round(nw),Math.round(nh)];
    render();
  }
});
canvas.addEventListener("mouseup", (e)=>{
  mouseDown = false;
  isPanning = false;

  if(currentAction==="creating" && creationStart){
    const {x,y} = toImageSpace(e.clientX, e.clientY);
    let [rx,ry,rw,rh] = rectNormalize(creationStart.x, creationStart.y, x-creationStart.x, y-creationStart.y);
    [rx,ry,rw,rh] = withinImage([rx,ry,rw,rh]);
    if(rw>=2 && rh>=2 && armedLabel){
      const ann = /** @type {Annotation} */({
        id: uuid(),
        label: armedLabel,
        value: String(valueForLabel(armedLabel) ?? ""),
        bbox: [rx,ry,rw,rh],
        page: 0,
        group_color: armedColor,
        confidence: "exact"
      });
      annotations.push(ann);
      selectedId = ann.id;
      updateSelectionUI();
      highlightButtonForLabel(ann.label);
      updateCountsUI();
    }
  } else if(currentAction==="moving"){
    const sel = annotations.find(a=>a.id===selectedId);
    if(sel) delete sel._movePrev;
  }

  currentAction = null;
  creationStart = null;
  resizeHandle = null;
  render();
});
canvas.addEventListener("mouseleave", ()=>{
  mouseDown = false; isPanning=false; currentAction=null; creationStart=null; resizeHandle=null;
});

canvas.addEventListener("wheel", (e)=>{
  if(e.ctrlKey || e.metaKey){
    e.preventDefault();
    const scale = Math.exp(-e.deltaY * 0.0015);
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left - panX)/zoom;
    const cy = (e.clientY - rect.top - panY)/zoom;

    zoom = clamp(zoom * scale, 0.2, 6);
    panX = e.clientX - rect.left - cx * zoom;
    panY = e.clientY - rect.top - cy * zoom;
    updateZoomUI();
    render();
  }
}, {passive:false});

window.addEventListener("keydown", (e)=>{
  if(e.code==="Space"){ isPanning = true; canvas.style.cursor="grabbing"; }
  if(e.key==="Escape"){
    if(currentAction==="creating"){ currentAction=null; creationStart=null; render(); }
    armedLabel=null; armedGroup=null; armedFieldEl.textContent="None"; lineItemPicker.hidden = true;
    highlightButtonForLabel("__none__");
  }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="z"){ e.preventDefault(); undo(); updateSelectionUI(); updateCountsUI(); render(); }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="y"){ e.preventDefault(); redo(); updateSelectionUI(); updateCountsUI(); render(); }
  if(e.key==="Delete" || e.key==="Backspace"){
    if(selectedId){
      pushHistory();
      const idx = annotations.findIndex(a=>a.id===selectedId);
      if(idx>=0) annotations.splice(idx,1);
      selectedId=null;
      updateSelectionUI(); updateCountsUI(); render();
    }
  }
  if(e.key.toLowerCase()==="h"){ const c=document.getElementById("chkShowLabels"); c.checked=!c.checked; showLabels=c.checked; render(); }
  if(e.key.toLowerCase()==="b"){ const c=document.getElementById("chkShowBorders"); c.checked=!c.checked; showBorders=c.checked; render(); }
  if(e.key.toLowerCase()==="f"){ const c=document.getElementById("chkShowFills"); c.checked=!c.checked; showFills=c.checked; render(); }
});
window.addEventListener("keyup",(e)=>{
  if(e.code==="Space"){ isPanning=false; canvas.style.cursor="crosshair"; }
});

function hitTestBox(x,y){
  for(let i=annotations.length-1;i>=0;i--){
    const [bx,by,bw,bh] = annotations[i].bbox;
    if(x>=bx && y>=by && x<=bx+bw && y<=by+bh){
      return annotations[i];
    }
  }
  return null;
}

/** ------------------------------
 * UI hooks
 * ------------------------------ */
document.getElementById("btnLoadImage").addEventListener("click", ()=>document.getElementById("fileImage").click());
document.getElementById("fileImage").addEventListener("change", (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  imageFilename = file.name;
  const fr = new FileReader();
  fr.onload = ()=>{
    const url = fr.result;
    imageEl = new Image();
    imageEl.onload = ()=>{
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

document.getElementById("btnLoadJSON").addEventListener("click", ()=>document.getElementById("fileJSON").click());
document.getElementById("fileJSON").addEventListener("change", (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const fr = new FileReader();
  fr.onload = ()=>{
    try{
      invoiceData = JSON.parse(fr.result);
      buildSidebar();
      validateAndShow();
    }catch(err){
      alert("Invalid JSON: " + err);
    }
  };
  fr.readAsText(file, "utf-8");
});

document.getElementById("btnReset").addEventListener("click", ()=>{
  if(!confirm("Reset canvas, annotations, and selection?")) return;
  armedLabel=null; armedGroup=null; armedFieldEl.textContent="None";
  document.querySelectorAll(".field-btn").forEach(b=>b.classList.remove("active"));
  annotations=[]; selectedId=null; history=[]; future=[];
  showLabels = document.getElementById("chkShowLabels").checked = true;
  showBorders = document.getElementById("chkShowBorders").checked = true;
  showFills = document.getElementById("chkShowFills").checked = false;
  fitImageToCanvas(); updateSelectionUI(); updateCountsUI(); render();
});

document.getElementById("chkShowLabels").addEventListener("change",(e)=>{ showLabels=e.target.checked; render(); });
document.getElementById("chkShowBorders").addEventListener("change",(e)=>{ showBorders=e.target.checked; render(); });
document.getElementById("chkShowFills").addEventListener("change",(e)=>{ showFills=e.target.checked; render(); });
liIndexInput.addEventListener("change", ()=>{
  if(!armedIsLineItem) return;
  const i = Math.max(0, parseInt(liIndexInput.value||"0",10) || 0);
  armedLIIndex = i;
  if(armedLabel){
    const base = armedLabel.replace(/\[\d+\]/,"[i]");
    armedLabel = base.replace("[i]", `[${i}]`);
    armedFieldEl.textContent = armedLabel;
    highlightButtonForLabel(armedLabel);
  }
});

btnDelete.addEventListener("click", ()=>{
  if(!selectedId) return;
  pushHistory();
  const idx = annotations.findIndex(a=>a.id===selectedId);
  if(idx>=0) annotations.splice(idx,1);
  selectedId = null;
  updateSelectionUI(); updateCountsUI(); render();
});

document.getElementById("btnExportPNG").addEventListener("click", exportAnnotatedPNG);
document.getElementById("btnExportLabels").addEventListener("click", exportLabelsJSON);
document.getElementById("btnExportCOCO").addEventListener("click", exportCOCO);

document.getElementById("toggleLeft").addEventListener("click", ()=>{
  document.getElementById("sidebarLeft").classList.toggle("closed");
});
document.getElementById("toggleRight").addEventListener("click", ()=>{
  document.getElementById("sidebarRight").classList.toggle("closed");
});

function updateSelectionUI(){
  const sel = annotations.find(a=>a.id===selectedId);
  if(!sel){
    selectionInfo.textContent = "No selection";
    btnDelete.disabled = true;
    return;
  }
  const [x,y,w,h]=sel.bbox;
  selectionInfo.innerHTML = `
    <div><strong>Label:</strong> ${sel.label}</div>
    <div><strong>Value:</strong> ${escapeHTML(sel.value||"")}</div>
    <div><strong>BBox:</strong> [${x}, ${y}, ${w}, ${h}]</div>
  `;
  btnDelete.disabled = false;
}
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,(m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
function updateZoomUI(){ zoomPct.textContent = Math.round(zoom*100) + "%"; }

/** ------------------------------
 * Validation
 * ------------------------------ */
function validate(){
  /** @type {string[]} */ const warnings=[];
  /** @type {string[]} */ const omitted=[];

  // Omitted null scalars present in schema (skip line_items templates)
  for(const c of CLASSES){
    if(c.includes("[i]")) continue;
    const v = valueForLabel(c);
    if(v === null || v === undefined){
      omitted.push(c);
    }
  }

  // Scalars (non-null) must have ≤1 bbox
  const scalarKeys = CLASSES.filter(c=>!c.includes("[i]") && !(c.startsWith("invoice.line_items")));
  for(const key of scalarKeys){
    const v = valueForLabel(key);
    if(v===null || v===undefined) continue;
    const count = annotations.filter(a=>a.label===key).length;
    if(count===0) warnings.push(`${key} has 0 boxes`);
    if(count>1) warnings.push(`${key} has >1 boxes`);
  }

  // coords within image
  for(const a of annotations){
    const [x,y,w,h] = a.bbox;
    if(x<0 || y<0 || w<1 || h<1 || x+w>imageW || y+h>imageH){
      warnings.push(`Annotation ${a.id} (${a.label}) is out of bounds`);
    }
  }

  // Heuristic: if multiple product_name boxes exist for a given index, remind to update quantity
  const productCountsByIndex = {};
  for(const a of annotations){
    const m = a.label.match(/invoice\.line_items\[(\d+)\]\.product_name/);
    if(m){ const i = Number(m[1]); productCountsByIndex[i] = (productCountsByIndex[i]||0)+1; }
  }
  for(const i of Object.keys(productCountsByIndex)){
    const n = productCountsByIndex[i];
    if(n>1){
      const qtyBoxes = annotations.filter(a=>a.label===`invoice.line_items[${i}].quantity`).length;
      if(qtyBoxes<1){
        warnings.push(`Line item [${i}] has ${n} products annotated — consider updating 'quantity' to ${n}.`);
      }
    }
  }

  // include meta warnings
  if(invoiceData?.meta?.warnings?.length){
    for(const w of invoiceData.meta.warnings){ warnings.push(w); }
  }

  return { warnings, omitted };
}
function validateAndShow(){
  const v = validate();
  validationOutput.textContent = JSON.stringify(v, null, 2);
}

/** ------------------------------
 * Exporters
 * ------------------------------ */
function exportAnnotatedPNG(){
  const cs = document.createElement("canvas");
  cs.width = imageW; cs.height = imageH;
  const c2 = cs.getContext("2d", {alpha:false});

  if(imageLoaded){ c2.drawImage(imageEl,0,0); }
  else { c2.fillStyle="#0d1225"; c2.fillRect(0,0,imageW,imageH); }

  for(const ann of annotations){
    const [x,y,w,h]=ann.bbox;
    if(showFills){ c2.fillStyle=hexToRgba(ann.group_color,0.12); c2.fillRect(x,y,w,h); }
    if(showBorders){ c2.strokeStyle=ann.group_color; c2.lineWidth=(ann.id===selectedId?2:1); c2.strokeRect(x+0.5,y+0.5,w,h); }
    if(showLabels){ drawLabelPillDirect(c2, ann.label, x, y-12, ann.group_color); }
  }

  const url = cs.toDataURL("image/png");
  const base = (imageFilename||"image").replace(/\.(png|jpg|jpeg)$/i,"");
  triggerDownload(url, `${base}-annotated.png`);
}
function drawLabelPillDirect(c2, text, x,y,color){
  const padX=6;
  c2.save();
  c2.font = `12px ui-monospace, SFMono-Regular, Consolas, Menlo, monospace`;
  const w = c2.measureText(text).width + padX*2;
  const h = 16;
  c2.fillStyle="#0a0f1f";
  c2.strokeStyle=color; c2.lineWidth=1;
  roundRect(c2, x, y, w, h, 8, true, true);
  c2.fillStyle=color;
  c2.fillText(text, x+padX, y+12);
  c2.restore();
}

function exportLabelsJSON(){
  const { warnings, omitted } = validate();
  /** @type {ExportJSON} */
  const payload = {
    image: { filename: imageFilename||"image.png", width:imageW, height:imageH, pages:1 },
    classes: CLASSES,
    annotations: annotations.map(a=>({
      id: a.id, label: a.label, value: a.value, bbox: a.bbox.map(n=>Math.round(n)),
      page: 0, group_color: a.group_color, confidence: a.confidence
    })),
    notes: { warnings, omitted_null_fields: omitted }
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const base = (imageFilename||"image").replace(/\.(png|jpg|jpeg)$/i,"");
  triggerDownload(URL.createObjectURL(blob), `${base}-labels.json`);
}

function exportCOCO(){
  const cats = [];
  const nameToId = {};
  let catId = 1;
  for(const c of CLASSES){
    if(c.includes("[i]")) continue;
    nameToId[c] = catId;
    cats.push({ id: catId, name: c, supercategory: groupOf(c) });
    catId++;
  }
  const images = [{ id:1, file_name:imageFilename||"image.png", width:imageW, height:imageH }];
  let annId = 1;
  const anns = [];
  for(const a of annotations){
    const key = a.label.replace(/\[\d+\]/,"[i]");
    const cid = nameToId[key] || (nameToId[key] = (cats.push({id:catId, name:key, supercategory:groupOf(key)}), catId++));
    const [x,y,w,h] = a.bbox.map(Math.round);
    anns.push({
      id: annId++,
      image_id: 1,
      category_id: cid,
      bbox: [x,y,w,h],
      area: w*h,
      iscrowd: 0
    });
  }
  const coco = { images, annotations: anns, categories: cats };
  const blob = new Blob([JSON.stringify(coco,null,2)], {type:"application/json"});
  const base = (imageFilename||"image").replace(/\.(png|jpg|jpeg)$/i,"");
  triggerDownload(URL.createObjectURL(blob), `${base}-coco.json`);
}

function triggerDownload(url, filename){
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** ------------------------------
 * Fit & boot
 * ------------------------------ */
function fitImageToCanvas(){
  const wrap = document.querySelector(".stage-wrap");
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height - 70;

  const scaleX = canvas.width / imageW;
  const scaleY = canvas.height / imageH;
  zoom = Math.min(scaleX, scaleY);
  zoom = clamp(zoom, 0.2, 6);
  updateZoomUI();

  const visW = imageW*zoom, visH = imageH*zoom;
  panX = (canvas.width - visW)/2;
  panY = (canvas.height - visH)/2;
  render();
}
window.addEventListener("resize", ()=>{ fitImageToCanvas(); });

/** ------------------------------
 * Load built-in sample on first boot
 * ------------------------------ */
(async function boot(){
  try{
    const resp = await fetch("./sample/sample.json");
    const data = await resp.json();
    invoiceData = data;
  }catch{
    invoiceData = null;
  }
  buildSidebar();
  validateAndShow();

  try{
    const resp = await fetch("./sample/sample-invoice.png");
    const blob = await resp.blob();
    imageFilename = "sample-invoice.png";
    const url = URL.createObjectURL(blob);
    imageEl = new Image();
    imageEl.onload = ()=>{
      imageW = imageEl.naturalWidth || 1000;
      imageH = imageEl.naturalHeight || 1400;
      imageLoaded = true;
      fitImageToCanvas();
      render();
    };
    imageEl.src = url;
  }catch{
    imageLoaded = false;
    imageW = 1000; imageH = 1400;
    fitImageToCanvas();
    render();
  }
})();

/** ------------------------------
 * Selection via click
 * ------------------------------ */
canvas.addEventListener("click",(e)=>{
  if(currentAction) return;
  const {x,y} = toImageSpace(e.clientX, e.clientY);
  const hit = hitTestBox(x,y);
  if(hit){
    selectedId = hit.id;
    updateSelectionUI();
    highlightButtonForLabel(hit.label);
    render();
  }
});

/** ------------------------------
 * Counts & Validation refresh
 * ------------------------------ */
function updateCountsUI(){
  const counts = countByField();
  document.querySelectorAll(".field-btn").forEach(btn=>{
    const key = btn.getAttribute("data-key");
    if(!key) return;
    const count = counts[key]||0;
    btn.setAttribute("data-count", String(count));
  });
}
function updateCountsAndValidation(){
  updateCountsUI(); validateAndShow();
}
setInterval(updateCountsAndValidation, 800);
