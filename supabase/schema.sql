-- Run once in Supabase SQL Editor.
-- IMPORTANT: replace FIRST_ADMIN_EMAIL before running the final UPDATE.

create type public.app_role as enum ('doctor', 'reviewer', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role public.app_role not null default 'doctor',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.communication_records (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  history_number text not null,
  admission_date date not null,
  department text not null,
  doctor_name text not null,
  contact_name text not null,
  contact_details text not null,
  relationship text not null,
  authority_basis text not null,
  communication_at timestamptz not null,
  channel text not null,
  reason text,
  information_summary text not null,
  understanding text not null,
  questions_answers text,
  agreed_actions text not null,
  next_update text,
  staff_name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communication_records_month_idx on public.communication_records (communication_at desc);
create index communication_records_creator_idx on public.communication_records (created_by);
create unique index communication_records_history_comm_idx
  on public.communication_records (history_number, communication_at);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.admin_update_profile(
  target_user uuid, new_full_name text, new_role public.app_role, new_active boolean
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'Administrator access required';
  end if;
  if target_user = auth.uid() and new_active = false then
    raise exception 'Administrator cannot deactivate their own account';
  end if;
  update public.profiles
  set full_name = trim(new_full_name), role = new_role, active = new_active
  where id = target_user;
end;
$$;

alter table public.profiles enable row level security;
alter table public.communication_records enable row level security;

create policy "profile own or admin read" on public.profiles for select to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin');

create policy "active user creates record" on public.communication_records for insert to authenticated
with check (created_by = auth.uid() and public.current_app_role() in ('doctor','reviewer','admin'));

create policy "own or oversight reads records" on public.communication_records for select to authenticated
using (created_by = auth.uid() or public.current_app_role() in ('reviewer','admin'));

create policy "admin updates records" on public.communication_records for update to authenticated
using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

revoke all on function public.admin_update_profile(uuid,text,public.app_role,boolean) from public;
grant execute on function public.admin_update_profile(uuid,text,public.app_role,boolean) to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.communication_records to authenticated;

-- After creating/inviting your own Auth user, make that account administrator:
-- UPDATE public.profiles SET role = 'admin', active = true
-- WHERE email = 'FIRST_ADMIN_EMAIL';
