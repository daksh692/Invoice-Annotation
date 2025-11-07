# Invoice Annotator (Offline, Vanilla JS)

A lightweight, production-ready invoice annotation tool that runs 100% offline by opening `index.html`. Load an invoice **image** and a **JSON** object, draw tight bounding boxes for fields, and export:

- ✅ Annotated PNG (`<base>-annotated.png`)
- ✅ Training labels JSON (`<base>-labels.json`)
- ✅ Optional COCO JSON (`<base>-coco.json`)

No OCR, no model inference — just precise, human labeling.

---

## Features

- **Zero install:** open `index.html` directly
- **True pixel coords:** integer `[x,y,w,h]` in image space (origin top-left)
- **Zoom & pan:** Ctrl+wheel to zoom; hold Space to pan
- **Draw / select / resize / delete** with 8 handles
- **Undo/redo** (Ctrl/Cmd+Z / Ctrl/Cmd+Y)
- **Field-driven UI:** sidebars generated from your JSON; null fields hidden
- **Line items:** choose index `i` and label per row
- **Group color coding:**
  - Buyer `#2563EB`, Seller `#EF4444`, Invoice Meta `#10B981`, Line Items `#F59E0B`, Totals/GST `#8B5CF6`
- **Visibility toggles:** labels (H), borders (B), fills (F)
- **Validation on export:** scalar ≤1 box, coords in bounds, omitted null fields listed
- **Works offline:** no network calls

---

## Quick Start

1) **Download** this folder `invoice-annotator/` to your computer.

2) (Optional) Put your invoice image (PNG/JPG) into `sample/` or anywhere.

3) **Open** `index.html` in your browser (double-click).

4) Click **Load JSON** → select `sample/sample.json` (or your own).

5) Click **Load Image** → select your invoice image.

6) In the left sidebar, **click a field** to arm the drawing tool:
   - For line items, set **Line item index** on the right, then click the `[i]` field (it becomes `[0]`, `[1]`, ...).

7) **Draw**: Click-drag on the canvas to create a rectangle.  
   - **Select / move / resize**: click a box, drag it or its handles.  
   - **Delete**: press `Delete`/`Backspace` or click **Delete** in the right panel.

8) **Export**:
   - **Save Annotated PNG** → `<base>-annotated.png`
   - **Export Labels JSON** → `<base>-labels.json` (schema below)
   - **Export COCO (optional)** → `<base>-coco.json`

---

## Keyboard Shortcuts

- **Draw:** Click a field button, then drag on canvas
- **Pan:** Hold **Space** + drag
- **Zoom:** **Ctrl/Cmd + mouse wheel**
- **Cancel drawing:** **Esc**
- **Undo / Redo:** **Ctrl/Cmd+Z**, **Ctrl/Cmd+Y**
- **Delete selection:** **Del** / **Backspace**
- **Toggle labels:** **H**
- **Toggle borders:** **B**
- **Toggle fills:** **F**

---

## Export Formats

### Labels JSON (custom)
```json
{
  "image": { "filename": "invoice.png", "width": 1800, "height": 2400, "pages": 1 },
  "classes": [
    "buyer.company_name","buyer.address","buyer.gstin",
    "seller.company_name","seller.address","seller.gstin",
    "invoice.bill_no","invoice.date","invoice.raw_date","invoice.currency",
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
    "warnings": ["Printed total differs from calculated due to rounding"],
    "omitted_null_fields": []
  }
}
