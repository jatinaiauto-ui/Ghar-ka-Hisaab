-- Ghar ka Hisaab: Supabase schema
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to re-run (also upgrades an older install): IF NOT EXISTS everywhere, seed categories are upserted.
--
-- Multi-user: every person signs in (Supabase Auth, email + password) and sees only their own expenses.
-- Categories are a shared, read-only list. Expenses, AI usage and AI insights are per user.

create extension if not exists pgcrypto;

-- ---------- Categories ----------
-- `description` is what the AI reads to pick a category, so write it like a hint to a person.
-- `keywords` only feed the offline fallback parser (used when the AI is unreachable); they are optional.
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_en     text not null,
  name_hi     text not null,
  icon        text not null default 'dots',
  color       text not null default '#EBD9C2',
  description text not null default '',
  keywords    text[] not null default '{}',   -- lowercase, Roman + Devanagari spellings
  sort        int  not null default 100,
  created_at  timestamptz not null default now()
);
alter table public.categories add column if not exists description text not null default '';

-- ---------- Expenses ----------
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade default auth.uid(),   -- owner; filled in by the database
  amount      numeric(12,2) not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  note        text not null default '',
  spoken_text text,                                 -- what she actually said, for debugging / re-analysis
  parsed_by   text not null default 'manual' check (parsed_by in ('manual', 'ai', 'parser')),
  spent_on    date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at  timestamptz not null default now()
);
alter table public.expenses add column if not exists parsed_by text not null default 'manual';
alter table public.expenses add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
-- Rows from the old single-user version have user_id = null and are invisible to everyone until claimed. See README, "Upgrading".

create index if not exists expenses_user_spent_idx  on public.expenses (user_id, spent_on desc, created_at desc);
drop index if exists public.expenses_spent_on_idx;
create index if not exists expenses_category_idx    on public.expenses (category_id);

-- ---------- Profiles ----------
-- Optional details each person can add about themselves. One row per user, private to them.
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  full_name      text not null default '' check (char_length(full_name) <= 60),
  phone          text not null default '' check (char_length(phone) <= 20),
  city           text not null default '' check (char_length(city) <= 60),
  household_size int  check (household_size between 1 and 30),
  monthly_budget numeric(12,2) check (monthly_budget >= 0),
  updated_at     timestamptz not null default now()
);

-- ---------- Monthly summary helper ----------
create or replace view public.monthly_category_totals
with (security_invoker = on) as   -- run with the caller's RLS, not the view owner's
select
  date_trunc('month', e.spent_on)::date as month,
  c.id   as category_id,
  c.slug,
  c.name_en,
  c.name_hi,
  c.icon,
  c.color,
  sum(e.amount)::numeric(12,2) as total,
  count(*)                     as entries
from public.expenses e
left join public.categories c on c.id = e.category_id
group by 1, c.id, c.slug, c.name_en, c.name_hi, c.icon, c.color;

-- ---------- AI support (used only by the `analyze` Edge Function) ----------
-- Daily call counter per user: a hard cap so nobody (or a leaked login) can run up the OpenRouter bill.
-- Older installs had a global counter; it is only a counter, so it is rebuilt with the new shape.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ai_usage')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage' and column_name = 'user_id') then
    drop table public.ai_usage;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'month_insights')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'month_insights' and column_name = 'user_id') then
    drop table public.month_insights;      -- a cache; summaries are regenerated on demand
  end if;
end $$;

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  calls   int  not null default 0,
  primary key (user_id, day)
);

-- Cached monthly insight per user. `basis` = "entries:total"; the text is regenerated only when it changes.
create table if not exists public.month_insights (
  user_id    uuid not null references auth.users(id) on delete cascade,
  month      date not null,
  basis      text not null,
  summary    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

-- Global daily counter: a ceiling on the total AI bill however many accounts exist.
create table if not exists public.ai_usage_global (
  day   date primary key,
  calls int not null default 0
);
alter table public.ai_usage_global enable row level security;   -- no policies: service role only

-- Atomically counts one AI call for this user and for everyone today (India time).
-- Returns false once either the per-user or the global cap is reached.
drop function if exists public.bump_ai_usage(int);
drop function if exists public.bump_ai_usage(uuid, int);
create or replace function public.bump_ai_usage(uid uuid, max_user int, max_global int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  used_user int;
  used_all  int;
begin
  insert into public.ai_usage (user_id, day, calls) values (uid, today, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into used_user;

  insert into public.ai_usage_global (day, calls) values (today, 1)
  on conflict (day) do update set calls = ai_usage_global.calls + 1
  returning calls into used_all;

  return used_user <= max_user and used_all <= max_global;
end;
$$;

revoke all on function public.bump_ai_usage(uuid, int, int) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, int, int) to service_role;

-- Lets a signed-in user delete their own account and, through the cascades, all their data.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Row Level Security ----------
-- Signed-in users (role `authenticated`) read the shared categories and have full access to their own
-- expenses only. The public (anon) key alone can do nothing: no policy and no grant for `anon`.
alter table public.categories     enable row level security;
alter table public.expenses       enable row level security;
alter table public.ai_usage       enable row level security;   -- no policies: only the Edge Function (service role) touches these
alter table public.month_insights enable row level security;
alter table public.profiles       enable row level security;

drop policy if exists "categories open"  on public.categories;
drop policy if exists "expenses open"    on public.expenses;
drop policy if exists "categories read"  on public.categories;
drop policy if exists "expenses own"     on public.expenses;
drop policy if exists "profile own"      on public.profiles;

create policy "categories read" on public.categories
  for select to authenticated using (true);
create policy "expenses own" on public.expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "profile own" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.categories, public.expenses, public.monthly_category_totals, public.profiles from anon;
revoke all on public.categories, public.expenses, public.profiles from authenticated;
grant usage on schema public to authenticated;
grant select on public.categories to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.monthly_category_totals to authenticated;

-- ---------- Seed categories ----------
-- Starter rows so the app has categories on first run. Re-running updates them in place.
insert into public.categories (slug, name_en, name_hi, icon, color, sort, description, keywords) values
 ('sabzi',   'Sabzi',      'सब्ज़ी',   'leaf',  '#CBD8B8', 10,
   'Vegetables and greens from the sabzi wala or mandi: aloo, pyaaz, tamatar, bhindi, palak, dhaniya, mirchi.',
   array['sabzi','sabji','sabzee','sabji wala','aloo','pyaaz','pyaz','tamatar','bhindi','gobhi','palak','vegetable','vegetables','veg',
         'सब्ज़ी','सब्जी','सब्जियां','सब्ज़ियाँ','आलू','प्याज','टमाटर','भिंडी','गोभी','पालक']),
 ('fal',     'Fal',        'फल',       'fruit', '#F0C9BB', 20,
   'Fresh fruit: kela, seb, angoor, santra, aam, anaar, papita, fruit juice.',
   array['fal','phal','fruit','fruits','kela','seb','angoor','santra','aam','केला','सेब','अंगूर','संतरा','आम','फल']),
 ('doodh',   'Doodh',      'दूध',      'milk',  '#F8DFA6', 30,
   'Milk and dairy: doodh, dahi, paneer, ghee, makhan, chaach, cream.',
   array['doodh','dudh','milk','dahi','curd','paneer','ghee','makhan','दूध','दही','पनीर','घी','मक्खन']),
 ('kirana',  'Kirana',     'किराना',   'bag',   '#F0C9BB', 40,
   'Monthly ration and packaged groceries: atta, chawal, daal, tel, cheeni, namak, masala, chai patti, biscuits, maggi, soap, detergent.',
   array['kirana','kiraana','ration','atta','aata','chawal','daal','dal','tel','oil','cheeni','sugar','namak','masala','chai','maggi','grocery','groceries',
         'किराना','राशन','आटा','चावल','दाल','तेल','चीनी','नमक','मसाला','चाय']),
 ('bijli',   'Bijli',      'बिजली',    'bolt',  '#EBD9C2', 50,
   'Electricity bill and inverter/battery costs.',
   array['bijli','bizli','electricity','light bill','current bill','bijli bill','बिजली']),
 ('gas',     'Gas',        'गैस',      'flame', '#F0C9BB', 60,
   'Cooking gas: LPG cylinder refill or piped gas bill.',
   array['gas','cylinder','silender','lpg','गैस','सिलेंडर','सिलिंडर']),
 ('ghar',    'Ghar',       'घर',       'house', '#CBD8B8', 70,
   'Household and home costs: rent, maid/kaamwali/bai, cleaning, repairs, plumber, mistri, water bill, society maintenance.',
   array['ghar','rent','kiraya','maid','bai','kaamwali','safai','repair','plumber','mistri','pani bill','water bill','society','maintenance',
         'घर','किराया','कामवाली','बाई','सफाई','मरम्मत','मिस्त्री']),
 ('dawai',   'Dawai',      'दवाई',     'pill',  '#F8DFA6', 80,
   'Health: medicines, chemist, doctor fees, medical tests.',
   array['dawai','dawa','davai','medicine','medical','doctor','chemist','tablet','दवाई','दवा','डॉक्टर','मेडिकल','गोली']),
 ('transport','Aana-jaana','आना-जाना', 'bus',   '#EBD9C2', 90,
   'Travel and commute: auto, rickshaw, taxi/cab, petrol/diesel/tel for a scooty, bike or car, bus, metro, train tickets.',
   array['auto','rickshaw','ricksha','taxi','cab','ola','uber','petrol','diesel','scooty','scooter','bike','activa','gaadi','car','dalwaya','पेट्रोल','डीजल','स्कूटी','बाइक','गाड़ी','bus','metro','train','ticket','किराया auto','ऑटो','रिक्शा','टैक्सी','पेट्रोल','बस','मेट्रो','ट्रेन','टिकट']),
 ('kapde',   'Kapde',      'कपड़े',    'shirt', '#F0C9BB', 100,
   'Clothes and tailoring: kapde, saree, suit, shirt, darzi/stitching, shoes.',
   array['kapde','kapda','saree','sari','suit','shirt','tailor','darzi','दर्ज़ी','कपड़े','कपड़ा','साड़ी','सूट','दर्जी']),
 ('bahar',   'Bahar ka khana','बाहर का खाना','plate','#F8DFA6', 110,
   'Eating out or ordering in: restaurant, hotel, zomato, swiggy, pizza, samosa, chaat, golgappe, ice cream, mithai from a shop.',
   array['restaurant','hotel','zomato','swiggy','pizza','burger','samosa','chaat','golgappe','ice cream','icecream','mithai','bahar ka khana',
         'रेस्टोरेंट','होटल','पिज़्ज़ा','समोसा','चाट','गोलगप्पे','मिठाई','आइसक्रीम']),
 ('recharge','Recharge',   'रिचार्ज',  'phone', '#CBD8B8', 120,
   'Phone and internet: mobile recharge, wifi, broadband, DTH/TV recharge.',
   array['recharge','mobile','phone bill','wifi','internet','broadband','dth','रिचार्ज','मोबाइल','वाईफाई','इंटरनेट']),
 ('other',   'Anya',       'अन्य',     'dots',  '#EBD9C2', 999,
   'Anything that clearly fits none of the other categories (gifts, donations, pooja items, stationery, misc). Use only when unsure.',
   array[]::text[])
on conflict (slug) do update set
  name_en     = excluded.name_en,
  name_hi     = excluded.name_hi,
  icon        = excluded.icon,
  color       = excluded.color,
  sort        = excluded.sort,
  description = excluded.description,
  keywords    = excluded.keywords;
