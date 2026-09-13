create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone varchar(32) unique,
  username varchar(64) unique,
  display_name varchar(120),
  avatar_url text,
  bio text,
  level int not null default 1,
  badge varchar(64),
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  title varchar(160) not null,
  host_id uuid not null references users(id),
  max_seats int not null default 12 check(max_seats between 1 and 12),
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists room_members (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  seat_no int,
  role varchar(24) not null default 'listener',
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key(room_id, user_id)
);

create table if not exists follows (
  follower_id uuid references users(id) on delete cascade,
  following_id uuid references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id, following_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references users(id),
  room_id uuid references rooms(id) on delete cascade,
  receiver_id uuid references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  diamond_cost bigint not null,
  image_url text,
  enabled boolean not null default true
);

create table if not exists wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  currency varchar(16) not null check(currency in ('diamond','bean','usd')),
  amount numeric(20,4) not null,
  direction varchar(8) not null check(direction in ('credit','debit')),
  reference_type varchar(32),
  reference_id varchar(128),
  created_at timestamptz not null default now()
);

create table if not exists agencies (
  id uuid primary key default gen_random_uuid(),
  code varchar(32) unique not null,
  name varchar(120) not null,
  owner_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

insert into agencies(code, name)
values ('7077', 'Pro Live Voice Agency')
on conflict (code) do nothing;

create table if not exists hosts (
  user_id uuid primary key references users(id) on delete cascade,
  agency_id uuid references agencies(id),
  status varchar(24) not null default 'pending',
  total_beans bigint not null default 0
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),
  target_user_id uuid references users(id),
  room_id uuid references rooms(id),
  reason text not null,
  status varchar(24) not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references users(id),
  action varchar(120) not null,
  target_id varchar(128),
  details jsonb,
  created_at timestamptz not null default now()
);
