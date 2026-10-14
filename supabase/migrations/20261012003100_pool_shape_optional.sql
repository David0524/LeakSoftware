-- A pool's shape can be left blank when the job is created and picked later on the job's
-- Findings (owner, 2026-10-14). Blank draws as a rectangle until someone picks one; pools
-- that already have a shape keep it.
alter table public.property
  alter column diagram_shape drop not null,
  alter column diagram_shape drop default;
