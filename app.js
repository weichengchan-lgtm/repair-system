(() => {
  "use strict";

  const MAX_TIERS = 5;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STATUSES = ["待處理", "處理中", "已完成"];
  const STAFF = ["陳偉政", "王精美", "林尚民"];
  const STAFF_KEY = "new-product-quote-staff";
  const SCHEDULE_FIELDS = ["info_provided_on", "info_confirmed_on", "cost_evaluated_on", "quote_delivered_on"];
  const ACTUAL_FIELDS = [
    ["actual_info_confirmed_on", "實際確認資訊可用性", "p_actual_info_confirmed_on"],
    ["actual_cost_evaluated_on", "實際完成報價評估及成本計算", "p_actual_cost_evaluated_on"],
    ["actual_quote_delivered_on", "實際提供報價給業務", "p_actual_quote_delivered_on"],
  ];
  const COLUMNS = [
    "id", "sales_name", "product_name", "product_category", "product_category_note",
    "material", "quantity", "surface_treatment", "process_steps",
    "needs_drawing", "needs_quote", "sample_quote", "mass_quote_quantities",
    "quote_due_on", ...SCHEDULE_FIELDS, "quote_total_days",
    ...ACTUAL_FIELDS.map(([name]) => name), "actual_total_days",
    ...ACTUAL_FIELDS.map(([name]) => name.replace(/_on$/, "_by")),
    "status_updated_by", "last_uploaded_by", "last_uploaded_at",
    "notes", "status", "created_at",
  ].join(",");

  const form = document.querySelector("#quote-form");
  const fields = form.elements;
  const submit = document.querySelector("#submit-quote");
  const refresh = document.querySelector("#refresh-list");
  const formMessage = document.querySelector("#form-message");
  const listMessage = document.querySelector("#list-message");
  const filterMessage = document.querySelector("#filter-message");
  const filters = document.querySelectorAll(".category-filters button");
  const list = document.querySelector("#quote-list");
  const categoryNote = document.querySelector("#category-note");
  const quoteDetails = document.querySelector("#quote-details");
  const quoteSchedule = document.querySelector("#quote-schedule");
  const massTiers = document.querySelector("#mass-tiers");
  const tierList = document.querySelector("#tier-list");
  const addTier = document.querySelector("#add-tier");
  const totalDays = document.querySelector("#total-days");
  const scheduleWarning = document.querySelector("#schedule-warning");
  const staffButtons = document.querySelectorAll(".staff-picker button");
  const staffStatus = document.querySelector("#staff-status");
  const defaultStaffStatus = staffStatus.textContent;

  const numberFormat = new Intl.NumberFormat("zh-TW");
  const timeFormat = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" });
  // 日期欄位是不含時區的 YYYY-MM-DD，以 UTC 解析與顯示才不會因時區差一天。
  const dateFormat = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "UTC" });

  function showMessage(element, text, kind = "") {
    element.textContent = text;
    element.className = kind;
  }

  function daysBetween(start, end) {
    return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
  }

  function formatDate(value) {
    return dateFormat.format(new Date(value));
  }

  function todayValue() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // 只比較相鄰且都有值的日期，找出後一階段早於前一階段的情況。
  function scheduleProblem(dates) {
    for (let i = 1; i < dates.length; i += 1) {
      if (dates[i - 1] && dates[i] && dates[i] < dates[i - 1]) {
        return "各階段日期須依序排列，後一階段不可早於前一階段。";
      }
    }
    return "";
  }

  // ---------- 新增需求表單 ----------

  function toggleSection(element, visible) {
    element.hidden = !visible;
    element.disabled = !visible;
  }

  function renumberTiers() {
    const rows = tierList.querySelectorAll("li");
    rows.forEach((row, index) => {
      row.querySelector("span").textContent = `級距 ${index + 1}`;
      row.querySelector("button").disabled = rows.length === 1;
    });
    addTier.disabled = rows.length >= MAX_TIERS;
  }

  function addTierRow() {
    const row = document.createElement("li");
    const label = document.createElement("label");
    const text = document.createElement("span");
    const input = document.createElement("input");
    const remove = document.createElement("button");

    input.name = "mass_quantity";
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.max = "100000000";
    input.step = "1";
    input.placeholder = "量產數量";
    input.required = true;
    label.append(text, input);
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      row.remove();
      renumberTiers();
    });
    row.append(label, remove);
    tierList.append(row);
    renumberTiers();
    return input;
  }

  function updateSchedule() {
    const dates = SCHEDULE_FIELDS.map((name) => fields[name].value);
    const problem = scheduleProblem(dates);
    const [start, , , end] = dates;
    const due = fields.quote_due_on.value;

    if (start && end && !problem) {
      totalDays.textContent = `${daysBetween(start, end)} 天`;
    } else {
      totalDays.textContent = problem ? "日期順序有誤" : "尚未填完日期";
    }
    showMessage(
      scheduleWarning,
      problem || (end && due && end > due ? "提供報價日期晚於報價需求時間，請確認是否能如期完成。" : ""),
      "wide error",
    );
  }

  function syncForm() {
    const isOther = fields.product_category.value === "其它";
    categoryNote.hidden = !isOther;
    fields.product_category_note.disabled = !isOther;

    const needsQuote = fields.needs_quote.value === "是";
    toggleSection(quoteDetails, needsQuote);
    toggleSection(quoteSchedule, needsQuote);
    toggleSection(massTiers, needsQuote && fields.mass_quote.checked);
    updateSchedule();
  }

  function resetForm() {
    form.reset();
    tierList.replaceChildren();
    addTierRow();
    fields.info_provided_on.value = todayValue();
    syncForm();
  }

  form.addEventListener("change", syncForm);
  form.addEventListener("input", (event) => {
    if (event.target.type === "date") updateSchedule();
  });
  addTier.addEventListener("click", () => addTierRow().focus());
  form.addEventListener("submit", (event) => event.preventDefault());
  resetForm();

  // ---------- 清單顯示 ----------

  function detail(term, ...value) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.append(...value);
    return [dt, dd];
  }

  function tag(text, className) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function quoteSummary(record) {
    if (!record.needs_quote) return "不需報價";
    const kinds = [];
    if (record.sample_quote) kinds.push("樣品報價");
    if (record.mass_quote_quantities?.length) {
      const tiers = record.mass_quote_quantities.map((n) => numberFormat.format(n)).join("／");
      kinds.push(`量產報價（${tiers}）`);
    }
    return kinds.join("、");
  }

  function dueTag(record) {
    if (record.actual_quote_delivered_on) {
      return record.actual_quote_delivered_on > record.quote_due_on
        ? tag("實際晚於需求時間", "tag-warning")
        : tag("如期提供", "tag-success");
    }
    if (todayValue() > record.quote_due_on) return tag("已超過需求時間", "tag-warning");
    if (record.quote_delivered_on > record.quote_due_on) return tag("預計晚於需求時間", "tag-warning");
    return "";
  }

  function scheduleTable(record) {
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    const body = table.createTBody();
    table.className = "schedule-table";
    for (const text of ["階段", "預計", "實際"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = text;
      head.append(th);
    }

    const stages = [
      ["業務提供資訊", record.info_provided_on, record.info_provided_on, null],
      ["確認資訊可用性", record.info_confirmed_on, record.actual_info_confirmed_on, record.actual_info_confirmed_by],
      ["完成報價評估及成本計算", record.cost_evaluated_on, record.actual_cost_evaluated_on, record.actual_cost_evaluated_by],
      ["提供報價給業務", record.quote_delivered_on, record.actual_quote_delivered_on, record.actual_quote_delivered_by],
    ];
    for (const [stage, planned, actual, uploader] of stages) {
      const row = body.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = stage;
      row.append(th);
      row.insertCell().textContent = formatDate(planned);
      const cell = row.insertCell();
      cell.textContent = actual ? formatDate(actual) : "—";
      if (uploader) cell.append(" ", tag(uploader, "uploader"));
      if (actual && actual > planned) {
        cell.append(" ", tag(`延後 ${daysBetween(planned, actual)} 天`, "tag-warning"));
      }
    }

    const total = body.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = "總天數";
    total.className = "schedule-total";
    total.append(th);
    total.insertCell().textContent = `${record.quote_total_days} 天`;
    const elapsed = daysBetween(record.info_provided_on, todayValue());
    total.insertCell().textContent = record.actual_total_days !== null
      ? `${record.actual_total_days} 天`
      : elapsed >= 0 ? `進行中（至今 ${elapsed} 天）` : "—";
    return table;
  }

  function field(labelText, control) {
    const label = document.createElement("label");
    label.append(labelText, control);
    return label;
  }

  function lockedValue(labelText, value) {
    const box = document.createElement("div");
    const label = document.createElement("span");
    const text = document.createElement("p");
    box.className = "locked-field";
    label.className = "locked-label";
    label.textContent = labelText;
    text.append(value, " ", tag("已上傳", "tag-locked"));
    box.append(label, text);
    return box;
  }

  function uploadErrorMessage(error) {
    // 資料庫函式回傳的中文訊息可直接顯示；其他錯誤（含檢查條件）改用通用說明。
    if (["22023", "42501", "P0002"].includes(error?.code) && error.message) return error.message;
    if (error?.code === "23514") return "上傳失敗，請依階段順序填寫實際日期，且不可早於前一階段。";
    return "上傳失敗，請確認網路後再試一次。";
  }

  function progressEditor(record) {
    const statusIndex = STATUSES.indexOf(record.status);
    const openDates = record.needs_quote ? ACTUAL_FIELDS.filter(([name]) => !record[name]) : [];
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const editor = document.createElement("form");
    details.className = "progress-editor";
    summary.textContent = `上傳進度（${selectedStaff}）`;
    details.append(summary, editor);

    if (statusIndex === STATUSES.length - 1 && !openDates.length) {
      const done = document.createElement("p");
      done.className = "wide muted-note";
      done.textContent = "此需求的處理狀態與實際日期都已上傳完成，無法再修改。";
      editor.append(done);
      return details;
    }

    const status = document.createElement("select");
    status.name = "status";
    // 處理狀態只能維持或往前，不顯示已經過的狀態。
    for (const value of STATUSES.slice(statusIndex)) status.add(new Option(value, value, false, value === record.status));
    editor.append(field("處理狀態", status));

    if (record.needs_quote) {
      for (const [name, text] of ACTUAL_FIELDS) {
        if (record[name]) {
          const by = record[name.replace(/_on$/, "_by")];
          editor.append(lockedValue(text, `${formatDate(record[name])}${by ? `（${by}）` : ""}`));
          continue;
        }
        const input = document.createElement("input");
        input.type = "date";
        input.name = name;
        input.min = record.info_provided_on;
        input.max = todayValue();
        editor.append(field(text, input));
      }
    }

    const actions = document.createElement("div");
    const upload = document.createElement("button");
    const message = document.createElement("p");
    upload.type = "submit";
    upload.textContent = "上傳";
    message.setAttribute("role", "status");
    actions.className = "wide actions";
    actions.append(upload, message);
    editor.append(actions);

    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (upload.disabled) return;

      const staff = selectedStaff;
      const actual = ACTUAL_FIELDS.map(([name]) => record[name] || editor.elements[name]?.value || null);
      const newDates = ACTUAL_FIELDS.filter(([name]) => !record[name] && editor.elements[name]?.value);
      let problem = "";
      if (!STAFF.includes(staff)) problem = "請先在「開發部人員」點選姓名。";
      else if (status.value === record.status && !newDates.length) problem = "沒有新的進度可以上傳。";
      else if (actual.some((value, i) => value && actual.slice(0, i).some((prev) => !prev))) {
        problem = "請依階段順序填寫實際日期，前一階段完成後才能填寫下一階段。";
      } else if (actual.some((value) => value && value > todayValue())) {
        problem = "實際日期不可晚於今天。";
      } else if (record.needs_quote) {
        problem = scheduleProblem([record.info_provided_on, ...actual]);
      }
      if (problem) {
        showMessage(message, problem, "error");
        return;
      }

      const summaryLines = [`上傳人員：${staff}`];
      if (status.value !== record.status) summaryLines.push(`處理狀態：${record.status} → ${status.value}`);
      for (const [name, text] of newDates) summaryLines.push(`${text}：${formatDate(editor.elements[name].value)}`);
      if (!window.confirm(`${summaryLines.join("\n")}\n\n上傳後不可修改，確定要上傳嗎？`)) return;

      const params = { p_id: record.id, p_staff: staff, p_status: status.value };
      for (const [name, , param] of newDates) params[param] = editor.elements[name].value;

      upload.disabled = true;
      showMessage(message, "正在上傳…");
      try {
        const { data, error } = await client.rpc("upload_quote_progress", params);
        if (error) {
          showMessage(message, uploadErrorMessage(error), "error");
          return;
        }
        records = records.map((item) => (item.id === data.id ? data : item));
        renderQuotes();
        showMessage(listMessage, `${staff} 已上傳「${data.product_name}」的進度。`, "success");
      } catch {
        showMessage(message, uploadErrorMessage(null), "error");
      } finally {
        upload.disabled = false;
      }
    });
    return details;
  }

  function quoteItem(record) {
    const item = document.createElement("li");
    const title = document.createElement("h3");
    const meta = document.createElement("p");
    const time = document.createElement("time");
    const details = document.createElement("dl");

    const category = record.product_category === "其它"
      ? `其它（${record.product_category_note}）`
      : record.product_category;
    title.textContent = `${category} · ${record.product_name}`;

    meta.className = "quote-meta";
    time.dateTime = record.created_at;
    time.textContent = timeFormat.format(new Date(record.created_at));
    meta.append(`業務 ${record.sales_name} · `, tag(record.status, `status status-${STATUSES.indexOf(record.status)}`), " · ", time);
    if (record.last_uploaded_by) {
      const uploaded = document.createElement("time");
      uploaded.dateTime = record.last_uploaded_at;
      uploaded.textContent = timeFormat.format(new Date(record.last_uploaded_at));
      meta.append(` · 最後上傳 ${record.last_uploaded_by} `, uploaded);
    }

    details.className = "detail-list";
    details.append(
      ...detail("需求材質", record.material),
      ...detail("需求數量", numberFormat.format(record.quantity)),
      ...detail("表面處理", record.surface_treatment),
      ...detail("加工關卡", `${record.process_steps} 道`),
      ...detail("製圖", record.needs_drawing ? "需要製圖" : "不需製圖"),
      ...detail("報價", quoteSummary(record)),
    );
    if (record.needs_quote) {
      const due = dueTag(record);
      details.append(...detail("報價需求時間", formatDate(record.quote_due_on), ...(due ? [" ", due] : [])));
    }

    item.append(title, meta, details);
    if (record.needs_quote) item.append(scheduleTable(record));
    if (record.notes) {
      const notes = document.createElement("p");
      notes.className = "quote-notes";
      notes.textContent = record.notes;
      item.append(notes);
    }
    if (selectedStaff) item.append(progressEditor(record));
    return item;
  }

  // ---------- 連線與資料 ----------

  const config = window.quoteConfig;
  if (!config?.publishableKey?.startsWith("sb_publishable_")) {
    showMessage(formMessage, "尚未設定 Supabase 公開金鑰。", "error");
    showMessage(listMessage, "設定公開金鑰後即可載入需求清單。");
    return;
  }

  let client;
  try {
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch {
    showMessage(formMessage, "無法初始化資料服務，請重新載入頁面或確認服務設定。", "error");
    showMessage(listMessage, "目前無法載入清單。", "error");
    return;
  }

  let listRequest = 0;
  let records = [];
  let selectedCategory = "";
  let selectedStaff = "";

  function renderQuotes() {
    const visible = selectedCategory
      ? records.filter((record) => record.product_category === selectedCategory)
      : records;
    list.replaceChildren(...visible.map(quoteItem));
    showMessage(filterMessage, records.length && !visible.length
      ? `最近 20 筆沒有產品類別為「${selectedCategory}」的需求。`
      : "");
  }

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      selectedCategory = filter.dataset.category;
      for (const button of filters) {
        button.setAttribute("aria-pressed", String(button === filter));
      }
      renderQuotes();
    });
  }

  async function loadQuotes() {
    const request = ++listRequest;
    refresh.disabled = true;
    showMessage(listMessage, "正在載入清單…");
    try {
      const { data, error } = await client
        .from("new_product_requests")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20);
      if (request !== listRequest) return;
      if (error) throw error;
      records = data;
      renderQuotes();
      for (const filter of filters) filter.disabled = false;
      showMessage(listMessage, data.length ? "" : "目前還沒有開發／報價需求。");
    } catch {
      if (request === listRequest) {
        showMessage(listMessage, "清單載入失敗，請點選重新整理再試一次。", "error");
      }
    } finally {
      if (request === listRequest) refresh.disabled = false;
    }
  }

  // ---------- 開發部人員 ----------

  function selectStaff(name) {
    selectedStaff = STAFF.includes(name) ? name : "";
    for (const button of staffButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.staff === selectedStaff));
    }
    staffStatus.textContent = selectedStaff
      ? `目前人員：${selectedStaff}。請在清單各筆需求展開「上傳進度」，上傳後不可修改。再點一次姓名可取消選取。`
      : defaultStaffStatus;
    try {
      if (selectedStaff) localStorage.setItem(STAFF_KEY, selectedStaff);
      else localStorage.removeItem(STAFF_KEY);
    } catch {
      // 無法使用瀏覽器儲存空間時，只是不記住選取的人員。
    }
    renderQuotes();
  }

  for (const button of staffButtons) {
    button.addEventListener("click", () => {
      selectStaff(button.dataset.staff === selectedStaff ? "" : button.dataset.staff);
    });
  }

  try {
    selectStaff(localStorage.getItem(STAFF_KEY) ?? "");
  } catch {
    selectStaff("");
  }

  function buildRecord() {
    const data = new FormData(form);
    const text = (name) => (data.get(name) ?? "").trim();
    const needsQuote = data.get("needs_quote") === "是";
    const category = data.get("product_category");
    const tiers = data.getAll("mass_quantity").map(Number);

    const record = {
      sales_name: text("sales_name"),
      product_name: text("product_name"),
      product_category: category,
      product_category_note: category === "其它" ? text("product_category_note") : null,
      material: text("material"),
      quantity: Number(data.get("quantity")),
      surface_treatment: data.get("surface_treatment"),
      process_steps: Number(data.get("process_steps")),
      needs_drawing: data.get("needs_drawing") === "是",
      needs_quote: needsQuote,
      sample_quote: needsQuote && data.has("sample_quote"),
      mass_quote_quantities: needsQuote && data.has("mass_quote") ? [...tiers].sort((a, b) => a - b) : [],
      quote_due_on: needsQuote ? data.get("quote_due_on") : null,
      notes: text("notes") || null,
    };
    for (const name of SCHEDULE_FIELDS) record[name] = needsQuote ? data.get(name) : null;

    let problem = "";
    const blank = [
      ["product_name", "產品名稱"], ["sales_name", "業務人員"], ["material", "需求材質"],
    ].find(([name]) => !record[name]);
    if (blank) problem = `請填寫${blank[1]}。`;
    else if (category === "其它" && !record.product_category_note) problem = "請填寫其它項目說明。";
    else if (!record.needs_drawing && !needsQuote) problem = "製圖與報價至少需選擇一項。";
    else if (needsQuote && !record.sample_quote && !record.mass_quote_quantities.length) {
      problem = "請至少勾選樣品報價或量產報價。";
    } else if (new Set(record.mass_quote_quantities).size !== record.mass_quote_quantities.length) {
      problem = "量產報價數量級距不可重複。";
    } else if (needsQuote) {
      problem = scheduleProblem(SCHEDULE_FIELDS.map((name) => record[name]));
    }
    return { record, problem };
  }

  form.addEventListener("submit", async () => {
    if (submit.disabled) return;

    const { record, problem } = buildRecord();
    if (problem) {
      showMessage(formMessage, problem, "error");
      return;
    }

    submit.disabled = true;
    showMessage(formMessage, "正在送出需求…");
    try {
      const { error } = await client.from("new_product_requests").insert(record);
      if (error) throw error;
      resetForm();
      showMessage(formMessage, "開發／報價需求已送出。", "success");
      void loadQuotes();
    } catch {
      showMessage(formMessage, "需求送出失敗，請確認網路或稍後再試。", "error");
    } finally {
      submit.disabled = false;
    }
  });

  refresh.addEventListener("click", loadQuotes);
  submit.disabled = false;
  void loadQuotes();
})();
