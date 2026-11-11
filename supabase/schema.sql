-- 以單一交易建立資料表、權限與政策，避免只套用部分設定。
begin;

-- 建立報修資料表，識別碼與登記時間由資料庫自動產生。
create table public.repair_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    reporter_name text not null,
    location text not null,
    category text not null,
    description text not null,
    urgency text not null default '中',
    status text not null default '待處理',

    -- CHECK：姓名、地點與說明須含非空白字元，並分別限制為 100、200、2000 字元。
    constraint repair_requests_reporter_name_check
        check (char_length(reporter_name) between 1 and 100 and reporter_name ~ '[^[:space:]]'),
    constraint repair_requests_location_check
        check (char_length(location) between 1 and 200 and location ~ '[^[:space:]]'),
    constraint repair_requests_description_check
        check (char_length(description) between 1 and 2000 and description ~ '[^[:space:]]'),

    -- CHECK：類別、緊急程度與處理狀態只接受列出的值。
    constraint repair_requests_category_check
        check (category in ('設備', '網路', '環境', '其他')),
    constraint repair_requests_urgency_check
        check (urgency in ('低', '中', '高')),
    constraint repair_requests_status_check
        check (status in ('待處理', '處理中', '已完成'))
);

-- GRANT：清除可能來自預設權限的授權，只給 anon 讀取及新增表單欄位的權限。
-- 新增時由資料庫填入 id、created_at 與 status，並可省略 urgency 以使用預設值。
revoke all privileges on table public.repair_requests
    from public, anon, authenticated, service_role;
grant select on table public.repair_requests to anon;
grant insert (reporter_name, location, category, description, urgency)
    on table public.repair_requests to anon;

-- RLS：啟用資料列安全，未登入的訪客可以讀取整份報修清單。
alter table public.repair_requests enable row level security;

create policy repair_requests_anon_select
    on public.repair_requests
    for select
    to anon
    using (true);

-- RLS：匿名新增的資料列必須是待處理，不建立修改或刪除政策。
create policy repair_requests_anon_insert
    on public.repair_requests
    for insert
    to anon
    with check (status = '待處理');

-- 權限與政策設定完成後一併提交。
commit;
