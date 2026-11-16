-- 已執行過第一版 schema.sql 的專案使用：更名滾鍍、加入實際日期與開發部登入修改權限。
-- 執行本檔後，請接著執行 003_staff_upload.sql。
-- 全新安裝請直接執行 supabase/schema.sql，不需要執行本檔。
begin;

-- 表面處理「電鍍（爐桶）」更名為「電鍍（滾鍍）」，先放寬檢查條件再更新既有資料。
alter table public.new_product_requests
    drop constraint new_product_requests_surface_treatment_check;
update public.new_product_requests
    set surface_treatment = '電鍍（滾鍍）'
    where surface_treatment = '電鍍（爐桶）';
alter table public.new_product_requests
    add constraint new_product_requests_surface_treatment_check
    check (surface_treatment in
        ('不需表面處理', '熱浸鍍鋅', '電鍍（吊電）', '電鍍（滾鍍）', '機械鍍鋅', '噴漆'));

-- 實際報價時程：由開發部登入後填寫，起點沿用業務提供資訊的日期。
alter table public.new_product_requests
    add column actual_info_confirmed_on date,
    add column actual_cost_evaluated_on date,
    add column actual_quote_delivered_on date,
    add column actual_total_days integer
        generated always as (actual_quote_delivered_on - info_provided_on) stored;

-- CHECK：實際日期只用於需要報價的需求，須依階段順序填寫，且不可早於前一階段。
alter table public.new_product_requests
    add constraint new_product_requests_actual_dates_check
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
    );

-- 可修改需求的開發部帳號名單，由管理員在 SQL Editor 新增或移除。
create table public.quote_editors (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);
revoke all privileges on table public.quote_editors
    from public, anon, authenticated, service_role;
grant select on table public.quote_editors to authenticated;
alter table public.quote_editors enable row level security;
create policy quote_editors_select_own
    on public.quote_editors
    for select
    to authenticated
    using (user_id = (select auth.uid()));

-- GRANT：已登入的使用者也能讀取與新增；修改只限處理狀態與實際日期。
grant select on table public.new_product_requests to authenticated;
grant insert (
    product_name, product_category, product_category_note,
    sales_name, material, quantity, surface_treatment, process_steps,
    needs_drawing, needs_quote, sample_quote, mass_quote_quantities, quote_due_on,
    info_provided_on, info_confirmed_on, cost_evaluated_on, quote_delivered_on,
    notes
) on table public.new_product_requests to authenticated;
grant update (status, actual_info_confirmed_on, actual_cost_evaluated_on, actual_quote_delivered_on)
    on table public.new_product_requests to authenticated;

-- RLS：讀取與新增政策改為同時適用未登入與已登入的使用者。
drop policy new_product_requests_anon_select on public.new_product_requests;
drop policy new_product_requests_anon_insert on public.new_product_requests;
create policy new_product_requests_select
    on public.new_product_requests
    for select
    to anon, authenticated
    using (true);
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

commit;
