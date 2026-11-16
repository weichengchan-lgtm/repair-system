-- 以單一交易建立資料表、權限與政策，避免只套用部分設定。
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

    -- 報價時程：業務提供資訊 → 確認資訊可用性 → 完成報價評估及成本計算 → 提供報價給業務。
    info_provided_on date,
    info_confirmed_on date,
    cost_evaluated_on date,
    quote_delivered_on date,
    quote_total_days integer generated always as (quote_delivered_on - info_provided_on) stored,

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
            ('不需表面處理', '熱浸鍍鋅', '電鍍（吊電）', '電鍍（爐桶）', '機械鍍鋅', '噴漆')),

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

    -- CHECK：需要報價時須選報價類型、填報價需求時間與依序排列的四個時程日期；
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

    -- CHECK：處理狀態只接受列出的值。
    constraint new_product_requests_status_check
        check (status in ('待處理', '處理中', '已完成'))
);

-- GRANT：清除可能來自預設權限的授權，只給 anon 讀取及新增表單欄位的權限。
-- 新增時由資料庫填入 id、created_at、status 與 quote_total_days。
revoke all privileges on table public.new_product_requests
    from public, anon, authenticated, service_role;
grant select on table public.new_product_requests to anon;
grant insert (
    product_name, product_category, product_category_note,
    sales_name, material, quantity, surface_treatment, process_steps,
    needs_drawing, needs_quote, sample_quote, mass_quote_quantities, quote_due_on,
    info_provided_on, info_confirmed_on, cost_evaluated_on, quote_delivered_on,
    notes
) on table public.new_product_requests to anon;

-- RLS：啟用資料列安全，未登入的訪客可以讀取整份需求清單。
alter table public.new_product_requests enable row level security;

create policy new_product_requests_anon_select
    on public.new_product_requests
    for select
    to anon
    using (true);

-- RLS：匿名新增的資料列必須是待處理，不建立修改或刪除政策。
create policy new_product_requests_anon_insert
    on public.new_product_requests
    for insert
    to anon
    with check (status = '待處理');

-- 權限與政策設定完成後一併提交。
commit;
