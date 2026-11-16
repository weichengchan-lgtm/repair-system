-- 已執行過 002_login_and_actual_dates.sql 的專案使用：
-- 改為點選開發部人員姓名後上傳進度，上傳後不可修改，並移除帳號登入的編輯名單。
-- 全新安裝請直接執行 supabase/schema.sql，不需要執行本檔。
begin;

-- 移除登入編輯名單與直接修改的權限，改由 upload_quote_progress 函式上傳。
drop policy new_product_requests_editor_update on public.new_product_requests;
revoke update on table public.new_product_requests from authenticated;
drop table public.quote_editors;

-- 上傳紀錄：各階段實際日期、處理狀態由誰上傳，以及最後一次上傳的人與時間。
-- 先前以帳號登入填寫的實際日期沒有上傳人員，保留空白。
alter table public.new_product_requests
    add column actual_info_confirmed_by text,
    add column actual_cost_evaluated_by text,
    add column actual_quote_delivered_by text,
    add column status_updated_by text,
    add column last_uploaded_by text,
    add column last_uploaded_at timestamptz;

-- CHECK：上傳人員只能是開發部人員；記錄上傳人員的日期必須有值。
alter table public.new_product_requests
    add constraint new_product_requests_staff_check
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
    );

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

commit;
