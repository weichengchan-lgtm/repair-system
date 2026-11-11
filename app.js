(() => {
  "use strict";

  const form = document.querySelector("#repair-form");
  const submit = document.querySelector("#submit-repair");
  const refresh = document.querySelector("#refresh-list");
  const formMessage = document.querySelector("#form-message");
  const listMessage = document.querySelector("#list-message");
  const filterMessage = document.querySelector("#filter-message");
  const filters = document.querySelectorAll(".urgency-filters button");
  const list = document.querySelector("#repair-list");
  const timeFormat = new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function showMessage(element, text, kind = "") {
    element.textContent = text;
    element.className = kind;
  }

  function repairItem(record) {
    const item = document.createElement("li");
    const title = document.createElement("h3");
    const meta = document.createElement("p");
    const urgency = document.createElement("span");
    const time = document.createElement("time");
    const description = document.createElement("p");

    title.textContent = `${record.category} · ${record.location}`;
    meta.className = "repair-meta";
    time.dateTime = record.created_at;
    time.textContent = timeFormat.format(new Date(record.created_at));
    urgency.textContent = `緊急程度 ${record.urgency}`;
    if (record.urgency === "高") urgency.className = "urgency-high";
    meta.append(`${record.reporter_name} · `, urgency, ` · ${record.status} · `, time);
    description.className = "repair-description";
    description.textContent = record.description;
    item.append(title, meta, description);
    return item;
  }

  form.addEventListener("submit", (event) => event.preventDefault());

  const config = window.repairConfig;
  if (!config?.publishableKey?.startsWith("sb_publishable_")) {
    showMessage(formMessage, "尚未設定 Supabase 公開金鑰。", "error");
    showMessage(listMessage, "設定公開金鑰後即可載入報修清單。");
    return;
  }

  let client;
  try {
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch {
    showMessage(formMessage, "無法初始化報修服務，請重新載入頁面或確認服務設定。", "error");
    showMessage(listMessage, "目前無法載入清單。", "error");
    return;
  }

  let listRequest = 0;
  let records = [];
  let selectedUrgency = "";

  function renderRepairs() {
    const visible = selectedUrgency
      ? records.filter((record) => record.urgency === selectedUrgency)
      : records;
    list.replaceChildren(...visible.map(repairItem));
    showMessage(filterMessage, records.length && !visible.length
      ? `最近 20 筆沒有緊急程度為「${selectedUrgency}」的報修。`
      : "");
  }

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      selectedUrgency = filter.dataset.urgency;
      for (const button of filters) {
        button.setAttribute("aria-pressed", String(button === filter));
      }
      renderRepairs();
    });
  }

  async function loadRepairs() {
    const request = ++listRequest;
    refresh.disabled = true;
    showMessage(listMessage, "正在載入清單…");
    try {
      const { data, error } = await client
        .from("repair_requests")
        .select("reporter_name,location,category,description,urgency,status,created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20);
      if (request !== listRequest) return;
      if (error) throw error;
      records = data;
      renderRepairs();
      for (const filter of filters) filter.disabled = false;
      showMessage(listMessage, data.length ? "" : "目前還沒有報修紀錄。");
    } catch {
      if (request === listRequest) {
        showMessage(listMessage, "清單載入失敗，請點選重新整理再試一次。", "error");
      }
    } finally {
      if (request === listRequest) refresh.disabled = false;
    }
  }

  form.addEventListener("submit", async () => {
    if (submit.disabled) return;

    const fields = new FormData(form);
    const record = {
      reporter_name: fields.get("reporter_name").trim(),
      location: fields.get("location").trim(),
      category: fields.get("category"),
      description: fields.get("description").trim(),
      urgency: fields.get("urgency"),
    };
    if (!record.reporter_name || !record.location || !record.description) {
      showMessage(formMessage, "請填寫報修人、地點或部門及問題說明。", "error");
      return;
    }

    submit.disabled = true;
    showMessage(formMessage, "正在送出報修…");
    try {
      const { error } = await client.from("repair_requests").insert(record);
      if (error) throw error;
      form.reset();
      showMessage(formMessage, "報修已送出。", "success");
      void loadRepairs();
    } catch {
      showMessage(formMessage, "報修送出失敗，請確認網路或稍後再試。", "error");
    } finally {
      submit.disabled = false;
    }
  });

  refresh.addEventListener("click", loadRepairs);
  submit.disabled = false;
  void loadRepairs();
})();
