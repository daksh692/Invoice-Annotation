# Invoice Annotator (Offline, Vanilla JS) — v1.2

A lightweight, **100% offline** invoice annotation tool. Load an invoice **image** and a **JSON** skeleton, draw tight boxes for each field, and export:

- ✅ Annotated PNG (`<base>-annotated.png`)
- ✅ Training labels JSON (`<base>-labels.json`)
- ✅ Optional COCO JSON (`<base>-coco.json`)
- ✅ **Updated Invoice JSON with OCR’d values** (`<base>-invoice-updated.json`) ← **new in v1.2**

**What’s new in v1.2**
- **In-browser OCR** with Tesseract.js: when you draw a box, it **reads the text in that box** and sets the annotation’s `value`.
- **Auto-write into your JSON**: that same OCR text is written into the correct path in your loaded JSON (e.g. `buyer.company_name`, `invoice.line_items[0].product_name`, etc.). No separate manual editing.
- **OCR controls**: **Re-OCR selection** (right panel) and **OCR all boxes** (top bar).
- **Export Updated Invoice JSON**: dumps your live JSON (now filled with OCR’d values).
- **Sidebar always shows all fields** (even if `null`), so you can annotate empty ones immediately.

---

## Features

- **Zero install**: open `index.html` directly
- **True pixel coords**: integer `[x,y,w,h]` in image space (origin top-left)
- **Zoom & pan**: Ctrl/Cmd + wheel to zoom; hold Space to pan
- **Draw / select / resize / delete** with 8 handles
- **Undo/redo** (Ctrl/Cmd+Z / Ctrl/Cmd+Y)
- **Field-driven UI**: sidebars generated from your schema; line-item index picker
- **OCR on create**: draw a box → OCR runs → `annotation.value` set → JSON updated at the field path
- **Controls**:
  - **OCR all boxes**
  - **Re-OCR selection**
  - **Export Updated Invoice JSON**
- **Group colors**:
  - Buyer `#2563EB`, Seller `#EF4444`, Invoice Meta `#10B981`, Line Items `#F59E0B`, Totals/GST `#8B5CF6`
- **Visibility toggles**: labels (H), borders (B), fills (F)
- **Validation**: flags out-of-bounds boxes, scalar fields with 0 or >1 boxes, and lists omitted null fields
- **Works offline**: no servers, no network calls (Tesseract runs in the browser)

---

## Quick Start

1. **Open** `index.html` in your browser (double-click).  
2. Click **Load JSON** → select your schema (e.g. `sample/sample.json` with `null` placeholders).  
3. Click **Load Image** → select your invoice image (PNG/JPG).  
4. In the left sidebar, **click a field** to arm the drawing tool.  
   - For line items, set **Line item index** on the right (e.g. `0`, `1`, …) then click a line-item field `[i]` (it will arm as `[0]`, `[1]`, etc.).
5. **Draw** a tight box around the field text.  
   - On mouseup, **OCR runs automatically** and sets the box’s `value`, then writes it into your JSON at that field path.
6. **Adjust** boxes as needed: click to select, drag to move, drag handles to resize. Use **Re-OCR selection** if you resize significantly.
7. **Export**:
   - **Save Annotated PNG** → `<base>-annotated.png`
   - **Export Labels JSON** → `<base>-labels.json`
   - **Export Updated Invoice JSON** → `<base>-invoice-updated.json` (**v1.2**)
   - **Export COCO (optional)** → `<base>-coco.json`

---

## Buttons & Panels (v1.2)

- **Top bar (left)**: Load Image, Load JSON, Reset, **OCR all boxes**  
- **Top bar (right)**: Save Annotated PNG, Export Labels JSON, **Export Updated Invoice JSON**, Export COCO  
- **Right panel**:
  - **Armed Field**: currently selected field path
  - **Line item index**: picker for `[i]` fields
  - **Selection**: shows `Label`, `Value` (OCR result), `BBox`; actions: **Re-OCR selection**, **Delete**
  - **Validation**: live warnings/omissions summary

---

## Keyboard Shortcuts

- **Draw**: click a field button, then drag on canvas  
- **Pan**: hold **Space** + drag  
- **Zoom**: **Ctrl/Cmd + mouse wheel**  
- **Cancel drawing**: **Esc**  
- **Undo / Redo**: **Ctrl/Cmd+Z**, **Ctrl/Cmd+Y**  
- **Delete selection**: **Del** / **Backspace**  
- **Toggle labels**: **H**  
- **Toggle borders**: **B**  
- **Toggle fills**: **F**

---

## Data Flow in v1.2 (important)

1. **You draw a box** for a field (e.g. `buyer.company_name`).  
2. The app **crops that region** from the image and runs **Tesseract.js OCR**.  
3. The OCR text is written to:
   - the annotation’s `value`, and
   - the loaded **JSON** at the correct **path** (e.g. `buyer.company_name`, `invoice.line_items[0].product_name`).  
4. On export, you get:
   - Labels JSON (with per-box `value`s)
   - **Updated Invoice JSON** (your original schema with those values filled in)

---

## Export Formats

### 1) Labels JSON (custom)
Includes each annotation with its `value` from OCR:

```json
{
  "image": { "filename": "invoice.png", "width": 1800, "height": 2400, "pages": 1 },
  "classes": [
    "buyer.company_name","buyer.address","buyer.gstin",
    "seller.company_name","seller.address","seller.gstin",
    "invoice.bill_no","invoice.date",
    "invoice.line_items[i].product_name","invoice.line_items[i].unit","invoice.line_items[i].quantity","invoice.line_items[i].unit_price","invoice.line_items[i].line_total_printed",
    "invoice.subtotal_printed",
    "invoice.gst_breakdown.cgst_percent","invoice.gst_breakdown.cgst_amount",
    "invoice.gst_breakdown.sgst_percent","invoice.gst_breakdown.sgst_amount",
    "invoice.gst_breakdown.other_gst_label","invoice.gst_breakdown.other_gst_percent","invoice.gst_breakdown.other_gst_amount",
    "invoice.round_off","invoice.grand_total_printed"
  ],
  "annotations": [
    {
      "id": "uuid",
      "label": "seller.gstin",
      "value": "27CORPP3939N1ZP",
      "bbox": [x, y, w, h],
      "page": 0,
      "group_color": "#EF4444",
      "confidence": "exact"
    }
  ],
  "notes": {
    "warnings": [],
    "omitted_null_fields": []
  }
}
```

### 2) COCO JSON (optional)
Standard COCO boxes with categories derived from class names. No text values included.

---

## Tesseract.js (OCR) Notes

- **Language**: default is `'eng'`. To support other languages, change the `recognize` call to load the language(s) you need and ensure the traineddata is available.  
- **Quality**: good OCR depends on tight boxes, clean scans, and decent resolution. If the box is loose or rotated, expect errors.  
- **Re-OCR**: after resizing a box, use **Re-OCR selection** to refresh the value.

---

## Tips for Accurate Annotations

- **Draw tight** — don’t include extra columns, grid lines, or neighboring words.
- **Use zoom** (Ctrl/Cmd + wheel) for small fonts.
- **Line items**: for multiple product rows, set the line-item index correctly before drawing each set of fields.
- **Quantities vs count**: the validator reminds you if you’ve boxed multiple product names under the same line index without a matching `quantity`.

---

## Common Issues

- **“hitTestHandle is not defined”**: add the resize-handle helpers `hitTestHandle` and `cursorForHandle` (included in v1.2 `app.js`).  
- **OCR slow on huge images**: run **OCR all boxes** only after placing boxes; or scale images to a sensible DPI.  
- **Numbers as strings**: OCR writes raw text by default. Add normalization if you need numeric types in the updated JSON.

---

## Version History

- **v1.2**
  - Added in-browser OCR (Tesseract.js)
  - Auto-write OCR results into loaded JSON
  - Added **OCR all boxes**, **Re-OCR selection**, **Export Updated Invoice JSON**
  - Sidebar shows all fields (even when `null`)
- **v1.1**
  - Core annotator: boxes, exports (PNG, labels, COCO), validation, line-item indexing
- **v1.0**
  - Initial canvas + basic exports

---

## License
Private project. All rights reserved (Daksh Shah).
