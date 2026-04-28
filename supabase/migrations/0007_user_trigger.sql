-- 0007_user_trigger.sql

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, organization_id, email, full_name, role)
  values (
    NEW.id,
    (NEW.raw_user_meta_data->>'organization_id')::uuid,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.email),
    (NEW.raw_user_meta_data->>'role')::public.user_role
  );
  return NEW;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
