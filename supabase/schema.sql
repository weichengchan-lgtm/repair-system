-- 全新安裝用：以單一交易建立資料表、權限與政策，避免只套用部分設定。
-- 已建立過舊版資料表的專案，請依序執行 migrations/ 中尚未執行的升級腳本。
begin;

-- 建立新產品開發／報價需求資料表，識別碼、建立時間與處理狀態由資料庫自動產生。
create table public.new_product_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),

    -- 產品項目：模板、系統架、零件或其它項目（其它須填說明）。
    product_name text not null,
    product_category text not null,
    product_category_note text,

    -- 業務提供資訊。
    sales_name text not null,
    material text not null,
    quantity integer not null,
    surface_treatment text not null,

    -- 加工關卡：需要幾道加工製程。
    process_steps smallint not null,

    -- 製圖與報價。量產報價依量產數量分級，以由小到大的整數陣列儲存。
    needs_drawing boolean not null,
    needs_quote boolean not null,
    sample_quote boolean not null default false,
    mass_quote_quantities integer[] not null default '{}',
    quote_due_on date,

    -- 預計報價時程：業務提供資訊 → 確認資訊可用性 → 完成報價評估及成本計算 → 提供報價給業務。
    info_provided_on date,
    info_confirmed_on date,
    cost_evaluated_on date,
    quote_delivered_on date,
    quote_total_days integer generated always as (quote_delivered_on - info_provided_on) stored,

    -- 實際報價時程：由開發部人員點選姓名後上傳，起點沿用業務提供資訊的日期。
    actual_info_confirmed_on date,
    actual_cost_evaluated_on date,
    actual_quote_delivered_on date,
    actual_total_days integer generated always as (actual_quote_delivered_on - info_provided_on) stored,

    -- 上傳紀錄：各階段實際日期、處理狀態由誰上傳，以及最後一次上傳的人與時間。
    actual_info_confirmed_by text,
    actual_cost_evaluated_by text,
    actual_quote_delivered_by text,
    status_updated_by text,
    last_uploaded_by text,
    last_uploaded_at timestamptz,

    notes text,
    status text not null default '待處理',

    -- CHECK：文字欄位須含非空白字元並限制長度。
    constraint new_product_requests_product_name_check
        check (char_length(product_name) between 1 and 200 and product_name ~ '[^[:space:]]'),
    constraint new_product_requests_sales_name_check
        check (char_length(sales_name) between 1 and 100 and sales_name ~ '[^[:space:]]'),
    constraint new_product_requests_material_check
        check (char_length(material) between 1 and 200 and material ~ '[^[:space:]]'),
    constraint new_product_requests_notes_check
        check (notes is null or (char_length(notes) between 1 and 2000 and notes ~ '[^[:space:]]')),

    -- CHECK：產品類別只接受列出的值，選「其它」時必須說明，其餘類別不得填說明。
    constraint new_product_requests_category_check
        check (product_category in ('模板', '系統架', '零件', '其它')),
    constraint new_product_requests_category_note_check
        check (
            (product_category = '其它'
                and product_category_note is not null
                and char_length(product_category_note) between 1 and 200
                and product_category_note ~ '[^[:space:]]')
            or (product_category <> '其它' and product_category_note is null)
        ),

    -- CHECK：數量、加工關卡與表面處理種類的範圍。
    constraint new_product_requests_quantity_check
        check (quantity between 1 and 100000000),
    constraint new_product_requests_process_steps_check
        check (process_steps between 0 and 30),
    constraint new_product_requests_surface_treatment_check
        check (surface_treatment in
            ('不需表面處理', '熱浸鍍鋅', '電鍍（吊電）', '電鍍（滾鍍）', '機械鍍鋅', '噴漆')),

    -- CHECK：製圖與報價至少需要一項。
    constraint new_product_requests_purpose_check
        check (needs_drawing or needs_quote),

    -- CHECK：量產數量級距為一維陣列，最多 5 個，每個值介於 1 到 1 億且不含空值。
    constraint new_product_requests_mass_quantities_check
        check (
            coalesce(array_ndims(mass_quote_quantities), 1) = 1
            and cardinality(mass_quote_quantities) <= 5
            and array_position(mass_quote_quantities, null) is null
            and 1 <= all (mass_quote_quantities)
            and 100000000 >= all (mass_quote_quantities)
        ),

    -- CHECK：需要報價時須選報價類型、填報價需求時間與依序排列的四個預計日期；
    -- 不需報價時，報價相關欄位必須留空。
    constraint new_product_requests_quote_check
        check (
            (needs_quote
                and (sample_quote or cardinality(mass_quote_quantities) > 0)
                and quote_due_on is not null
                and info_provided_on is not null
                and info_confirmed_on is not null
                and cost_evaluated_on is not null
                and quote_delivered_on is not null
                and info_provided_on <= info_confirmed_on
                and info_confirmed_on <= cost_evaluated_on
                and cost_evaluated_on <= quote_delivered_on)
            or (not needs_quote
                and not sample_quote
                and cardinality(mass_quote_quantities) = 0
                and quote_due_on is null
                and info_provided_on is null
                and info_confirmed_on is null
                and cost_evaluated_on is null
                and quote_delivered_on is null)
        ),

    -- CHECK：實際日期只用於需要報價的需求，須依階段順序填寫，且不可早於前一階段。
    constraint new_product_requests_actual_dates_check
        check (
            (not needs_quote
                and actual_info_confirmed_on is null
                and actual_cost_evaluated_on is null
                and actual_quote_delivered_on is null)
            or (needs_quote
                and (actual_cost_evaluated_on is null or actual_info_confirmed_on is not null)
                and (actual_quote_delivered_on is null or actual_cost_evaluated_on is not null)
                and (actual_info_confirmed_on is null or info_provided_on <= actual_info_confirmed_on)
                and (actual_cost_evaluated_on is null or actual_info_confirmed_on <= actual_cost_evaluated_on)
                and (actual_quote_delivered_on is null or actual_cost_evaluated_on <= actual_quote_delivered_on))
        ),

    -- CHECK：上傳人員只能是開發部人員；記錄上傳人員的日期必須有值。
    constraint new_product_requests_staff_check
        check (
            (actual_info_confirmed_by is null or actual_info_confirmed_by in ('陳偉政', '王精美', '林尚民'))
            and (actual_cost_evaluated_by is null or actual_cost_evaluated_by in ('陳偉政', '王精美', '林尚民'))
            and (actual_quote_delivered_by is null or actual_quote_delivered_by in ('陳偉政', '王精美', '林尚民'))
            and (status_updated_by is null or status_updated_by in ('陳偉政', '王精美', '林尚民'))
            and (last_uploaded_by is null or last_uploaded_by in ('陳偉政', '王精美', '林尚民'))
            and (actual_info_confirmed_by is null or actual_info_confirmed_on is not null)
            and (actual_cost_evaluated_by is null or actual_cost_evaluated_on is not null)
            and (actual_quote_delivered_by is null or actual_quote_delivered_on is not null)
            and ((last_uploaded_by is null) = (last_uploaded_at is null))
        ),

    -- CHECK：處理狀態只接受列出的值。
    constraint new_product_requests_status_check
        check (status in ('待處理', '處理中', '已完成'))
);

-- GRANT：清除可能來自預設權限的授權。
revoke all privileges on table public.new_product_requests
    from public, anon, authenticated, service_role;

-- GRANT：網頁使用者都能讀取清單、新增表單欄位。
-- 新增時由資料庫填入 id、created_at、status 與兩個總天數，實際日期與上傳紀錄留空。
-- 不開放直接修改或刪除，進度只能透過 upload_quote_progress 上傳。
grant select on table public.new_product_requests to anon, authenticated;
grant insert (
    product_name, product_category, product_category_note,
    sales_name, material, quantity, surface_treatment, process_steps,
    needs_drawing, needs_quote, sample_quote, mass_quote_quantities, quote_due_on,
    info_provided_on, info_confirmed_on, cost_evaluated_on, quote_delivered_on,
    notes
) on table public.new_product_requests to anon, authenticated;

-- RLS：啟用資料列安全。
alter table public.new_product_requests enable row level security;

create policy new_product_requests_select
    on public.new_product_requests
    for select
    to anon, authenticated
    using (true);

-- RLS：新增的資料列必須是待處理，不建立修改或刪除政策。
create policy new_product_requests_insert
    on public.new_product_requests
    for insert
    to anon, authenticated
    with check (status = '待處理');

-- 開發部上傳進度：點選姓名後呼叫此函式，資料庫檢查後才寫入。
-- 規則：已上傳的實際日期不可修改，處理狀態只能往前（待處理 → 處理中 → 已完成），實際日期不可晚於今天。
-- 參數為 null 表示該欄位這次不上傳。
create function public.upload_quote_progress(
    p_id uuid,
    p_staff text,
    p_status text,
    p_actual_info_confirmed_on date default null,
    p_actual_cost_evaluated_on date default null,
    p_actual_quote_delivered_on date default null
)
returns public.new_product_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    statuses constant text[] := array['待處理', '處理中', '已完成'];
    today constant date := (now() at time zone 'Asia/Taipei')::date;
    current_row public.new_product_requests;
    result public.new_product_requests;
begin
    if p_staff is null or p_staff not in ('陳偉政', '王精美', '林尚民') then
        raise exception '請先點選開發部人員。' using errcode = '22023';
    end if;
    if p_status is null or array_position(statuses, p_status) is null then
        raise exception '處理狀態不正確。' using errcode = '22023';
    end if;

    select * into current_row
        from public.new_product_requests
        where id = p_id
        for update;
    if not found then
        raise exception '找不到這筆需求，請重新整理清單。' using errcode = 'P0002';
    end if;

    if array_position(statuses, p_status) < array_position(statuses, current_row.status) then
        raise exception '處理狀態已上傳，不可退回。' using errcode = '42501';
    end if;
    if current_row.actual_info_confirmed_on <> p_actual_info_confirmed_on
        or current_row.actual_cost_evaluated_on <> p_actual_cost_evaluated_on
        or current_row.actual_quote_delivered_on <> p_actual_quote_delivered_on then
        raise exception '已上傳的日期不可修改。' using errcode = '42501';
    end if;
    if greatest(p_actual_info_confirmed_on, p_actual_cost_evaluated_on, p_actual_quote_delivered_on) > today then
        raise exception '實際日期不可晚於今天。' using errcode = '22023';
    end if;
    if p_status = current_row.status
        and (p_actual_info_confirmed_on is null or current_row.actual_info_confirmed_on is not null)
        and (p_actual_cost_evaluated_on is null or current_row.actual_cost_evaluated_on is not null)
        and (p_actual_quote_delivered_on is null or current_row.actual_quote_delivered_on is not null) then
        raise exception '沒有新的進度可以上傳。' using errcode = '22023';
    end if;

    -- SET 右側引用的是更新前的值，只填入原本空白的欄位並記錄上傳人員。
    update public.new_product_requests set
        actual_info_confirmed_on = coalesce(actual_info_confirmed_on, p_actual_info_confirmed_on),
        actual_info_confirmed_by = case
            when actual_info_confirmed_on is null and p_actual_info_confirmed_on is not null then p_staff
            else actual_info_confirmed_by end,
        actual_cost_evaluated_on = coalesce(actual_cost_evaluated_on, p_actual_cost_evaluated_on),
        actual_cost_evaluated_by = case
            when actual_cost_evaluated_on is null and p_actual_cost_evaluated_on is not null then p_staff
            else actual_cost_evaluated_by end,
        actual_quote_delivered_on = coalesce(actual_quote_delivered_on, p_actual_quote_delivered_on),
        actual_quote_delivered_by = case
            when actual_quote_delivered_on is null and p_actual_quote_delivered_on is not null then p_staff
            else actual_quote_delivered_by end,
        status = p_status,
        status_updated_by = case when status <> p_status then p_staff else status_updated_by end,
        last_uploaded_by = p_staff,
        last_uploaded_at = now()
    where id = p_id
    returning * into result;

    return result;
end;
$$;

-- GRANT：函式預設開放給 PUBLIC，先收回再只開放給網頁使用的角色。
revoke all on function public.upload_quote_progress(uuid, text, text, date, date, date) from public;
grant execute on function public.upload_quote_progress(uuid, text, text, date, date, date)
    to anon, authenticated;

-- 權限與政策設定完成後一併提交。
commit;
