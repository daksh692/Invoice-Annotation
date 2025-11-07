(function () {
  const out = document.getElementById("out");
  function log(ok, name, detail = "") {
    const d = document.createElement("div");
    d.className = ok ? "pass" : "fail";
    d.textContent =
      (ok ? "✔" : "✖") + " " + name + (detail ? " — " + detail : "");
    out.appendChild(d);
  }

  // UUID uniqueness
  (function () {
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(uuid());
    log(set.size === 1000, "UUID uniqueness (1000 gen)");
  })();

  // Validation shape — minimal
  (function () {
    imageW = 100;
    imageH = 100;
    annotations = [];
    invoiceData = {
      buyer: { company_name: "ABC", address: "X", gstin: null },
      seller: { company_name: "Y", address: "Z", gstin: "12ABC" },
      invoice: {
        bill_no: "B1",
        date: "2025-01-01",
        raw_date: "1 Jan",
        currency: "INR",
        line_items: [],
        subtotal_calculated: null,
        subtotal_printed: 100,
        gst_breakdown: null,
        round_off: null,
        grand_total_calculated: null,
        grand_total_printed: 100,
      },
      confidence_notes: {
        low_confidence_fields: [],
        unparsed_text_snippets: [],
      },
      meta: { source_pages: 1, warnings: [] },
    };
    annotations.push({
      id: uuid(),
      label: "buyer.company_name",
      value: "ABC",
      bbox: [10, 10, 20, 10],
      page: 0,
      group_color: "#2563EB",
      confidence: "exact",
    });
    const v = validate();
    log(
      Array.isArray(v.warnings) && Array.isArray(v.omitted),
      "validate() returns warnings+omitted arrays"
    );
  })();

  // Export labels JSON
  (function () {
    const { warnings, omitted } = validate();
    const payload = {
      image: { filename: "t.png", width: imageW, height: imageH, pages: 1 },
      classes: CLASSES,
      annotations: annotations,
      notes: { warnings, omitted_null_fields: omitted },
    };
    const ok =
      payload.annotations.length > 0 &&
      payload.classes.includes("buyer.company_name");
    log(ok, "labels exporter shape & counts");
  })();

  // Done
  const pre = document.createElement("pre");
  pre.textContent = "Tests completed.";
  out.appendChild(pre);
})();
