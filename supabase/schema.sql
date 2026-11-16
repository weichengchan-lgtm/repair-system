-- 全新安裝用：以單一交易建立資料表、權限與政策，避免只套用部分設定。
-- 已執行過舊版 schema.sql 的專案，請改執行 migrations/002_login_and_actual_dates.sql。
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

    -- 實際報價時程：由開發部登入後填寫，起點沿用業務提供資訊的日期。
    actual_info_confirmed_on date,
    actual_cost_evaluated_on date,
    actual_quote_delivered_on date,
    actual_total_days integer generated always as (actual_quote_delivered_on - info_provided_on) stored,

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

    -- CHECK：處理狀態只接受列出的值。
    constraint new_product_requests_status_check
        check (status in ('待處理', '處理中', '已完成'))
);

-- 可修改需求的開發部帳號名單，由管理員在 SQL Editor 新增或移除。
create table public.quote_editors (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

-- GRANT：清除可能來自預設權限的授權。
revoke all privileges on table public.new_product_requests
    from public, anon, authenticated, service_role;
revoke all privileges on table public.quote_editors
    from public, anon, authenticated, service_role;

-- GRANT：未登入與已登入的使用者都能讀取清單、新增表單欄位。
-- 新增時由資料庫填入 id、created_at、status 與兩個總天數，實際日期留空。
grant select on table public.new_product_requests to anon, authenticated;
grant insert (
    product_name, product_category, product_category_note,
    sales_name, material, quantity, surface_treatment, process_steps,
    needs_drawing, needs_quote, sample_quote, mass_quote_quantities, quote_due_on,
    info_provided_on, info_confirmed_on, cost_evaluated_on, quote_delivered_on,
    notes
) on table public.new_product_requests to anon, authenticated;

-- GRANT：已登入的使用者只能修改處理狀態與實際日期，是否允許再由 RLS 檢查編輯名單。
grant update (status, actual_info_confirmed_on, actual_cost_evaluated_on, actual_quote_delivered_on)
    on table public.new_product_requests to authenticated;

-- GRANT：已登入的使用者可查詢自己是否在編輯名單中。
grant select on table public.quote_editors to authenticated;

-- RLS：啟用資料列安全。
alter table public.new_product_requests enable row level security;
alter table public.quote_editors enable row level security;

create policy new_product_requests_select
    on public.new_product_requests
    for select
    to anon, authenticated
    using (true);

-- RLS：新增的資料列必須是待處理，不建立刪除政策。
create policy new_product_requests_insert
    on public.new_product_requests
    for insert
    to anon, authenticated
    with check (status = '待處理');

-- RLS：只有編輯名單中的帳號可以修改需求。
create policy new_product_requests_editor_update
    on public.new_product_requests
    for update
    to authenticated
    using (exists (select 1 from public.quote_editors e where e.user_id = (select auth.uid())))
    with check (exists (select 1 from public.quote_editors e where e.user_id = (select auth.uid())));

-- RLS：已登入的使用者只能看到自己的編輯名單資料列。
create policy quote_editors_select_own
    on public.quote_editors
    for select
    to authenticated
    using (user_id = (select auth.uid()));

-- 權限與政策設定完成後一併提交。
commit;
