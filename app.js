(() => {
  "use strict";

  const MAX_TIERS = 5;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SCHEDULE_FIELDS = ["info_provided_on", "info_confirmed_on", "cost_evaluated_on", "quote_delivered_on"];

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

  // ---------- 表單互動 ----------

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

  function scheduleValues() {
    return SCHEDULE_FIELDS.map((name) => fields[name].value);
  }

  function scheduleProblem(dates) {
    for (let i = 1; i < dates.length; i += 1) {
      if (dates[i - 1] && dates[i] && dates[i] < dates[i - 1]) {
        return "各階段日期須依序排列，後一階段不可早於前一階段。";
      }
    }
    return "";
  }

  function updateSchedule() {
    const dates = scheduleValues();
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

  // ---------- 清單 ----------

  function detail(term, value) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.append(value);
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
    meta.append(`業務 ${record.sales_name} · ${record.status} · `, time);

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
      const due = document.createElement("span");
      due.append(formatDate(record.quote_due_on));
      if (record.quote_delivered_on > record.quote_due_on) {
        due.append(" ", tag("預計晚於需求時間", "tag-warning"));
      }
      const schedule = [
        `提供資訊 ${formatDate(record.info_provided_on)}`,
        `確認資訊 ${formatDate(record.info_confirmed_on)}`,
        `評估成本 ${formatDate(record.cost_evaluated_on)}`,
        `提供報價 ${formatDate(record.quote_delivered_on)}`,
      ].join(" → ");
      details.append(
        ...detail("報價需求時間", due),
        ...detail("報價總天數", `${record.quote_total_days} 天（${schedule}）`),
      );
    }

    item.append(title, meta, details);
    if (record.notes) {
      const notes = document.createElement("p");
      notes.className = "quote-notes";
      notes.textContent = record.notes;
      item.append(notes);
    }
    return item;
  }

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
        .select([
          "sales_name", "product_name", "product_category", "product_category_note",
          "material", "quantity", "surface_treatment", "process_steps",
          "needs_drawing", "needs_quote", "sample_quote", "mass_quote_quantities",
          "quote_due_on", ...SCHEDULE_FIELDS, "quote_total_days",
          "notes", "status", "created_at",
        ].join(","))
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
