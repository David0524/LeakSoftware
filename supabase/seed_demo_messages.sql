-- Sample texts for demonstrations (owner request, 2026-10-16): the demo shop's conversation
-- with Sam Sample about the sample inspection (seed_sample_job.sql), so Messages and the
-- job's Messages group have something to show before a real number is connected. Times
-- follow 8:00 on the sample job's day, in the shop's time zone: Sam asks the afternoon
-- before, the tech is on the way that morning, the result goes out before noon, and Sam's
-- last reply is unread.
-- Runs after seed_sample_job.sql.
--
-- Idempotent: does nothing once the demo shop has a conversation with Sam, or without the
-- sample job.

do $$
declare
  sample_job uuid := '00000000-0000-4000-8000-00000000e001';
  cust uuid := '00000000-0000-4000-8000-00000000c003';
  owner_id uuid := '00000000-0000-4000-8000-00000000d001';
  tech_id uuid := '00000000-0000-4000-8000-00000000d002';
  -- Sam's number, (480) 555-0123 (555-01xx is reserved for fiction).
  sam text := '+14805550123';
  co uuid;
  morning timestamptz;  -- 8:00 on the sample job's day
  conv uuid := gen_random_uuid();
begin
  select j.company_id,
         ((coalesce(j.started_at, j.scheduled_start, now()) at time zone c.timezone)::date
          + time '08:00') at time zone c.timezone
  into co, morning
  from public.job j join public.company c on c.id = j.company_id
  where j.id = sample_job;
  if co is null
     or exists (select 1 from public.conversation
                where company_id = co and phone = sam and deleted_at is null) then
    return;
  end if;

  insert into public.conversation (id, company_id, phone, customer_id, last_at, last_preview,
                                   unread, created_at)
  values (conv, co, sam, cust, morning + interval '3 hours 34 minutes',
          'Wow, that was fast. How soon can you fix the return line?', true,
          morning - interval '15 hours 48 minutes');

  insert into public.text_message
    (company_id, conversation_id, direction, body, status, sent_by, job_id, created_at)
  values
    (co, conv, 'in',
     'Hi, this is Sam on Osborn. The pool is losing about an inch a day and the auto-fill '
     || 'runs all the time. Can someone take a look?',
     'received', null, null, morning - interval '15 hours 48 minutes'),
    (co, conv, 'out',
     'Thanks, Sam. Tony can be there tomorrow at 8 for a leak detection. Anything we should '
     || 'know about getting to the pool?',
     'delivered', owner_id, sample_job, morning - interval '15 hours 40 minutes'),
    (co, conv, 'in', 'Front gate is unlocked. The dogs will be inside.',
     'received', null, null, morning - interval '15 hours 29 minutes'),
    (co, conv, 'out', 'Tony from Demo Leak Co. is on the way. See you in about 20 minutes.',
     'delivered', tech_id, sample_job, morning - interval '19 minutes'),
    (co, conv, 'out',
     'Found it: the Return 3 line is leaking under the deck, about 6 ft from the fitting. '
     || 'The pool light needs attention too. Your report and a repair quote are on the way.',
     'delivered', tech_id, sample_job, morning + interval '3 hours 20 minutes'),
    (co, conv, 'in', 'Wow, that was fast. How soon can you fix the return line?',
     'received', null, null, morning + interval '3 hours 34 minutes');
end $$;
