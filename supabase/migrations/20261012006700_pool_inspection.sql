-- Pool Inspection, a new job type for leak shops (owner, 2026-10-20: "For leak detections, let's
-- add Pool Inspection reports. Leak companies often do a pool inspection when a new pool is built
-- or whatever." ... "Huge report. Don't remove anything but you can condense it. Pool inspection
-- will be a new type of job." Plan approved with its recommendations: docs/plans/pool-inspection.md).
--
-- Every question of Leaktronics' New Swimming Pool Inspection with Leak Detection
-- (docs/research/leaktronics-pool-inspection.md) is config, not code:
--   * Tabs 4 to 11 are checklist items of job type 'inspection', in eight new sections, word for
--     word, with their group headers (group_label) and banners (notice).
--   * Contact information is the job's own customer, pool, price, date and tech.
--   * The Phone Questionnaire is From the Customer for this job type (intake questions now say
--     which job types ask them), its twelve feature Yes/No pairs one tap-all-that-apply list.
--     The insurance claim question isn't asked (owner, 2026-10-20: "Remove the insurance stuff").
--   * Leaks noted and Summary notes are the report's own text; photos are job photos.
--
-- New answer kinds: 'choice' (one of options), 'multi' (several), 'text'. An option can carry a
-- flag: 'attention' or 'leaking' (the answer needs attention; it sets the result's outcome, so
-- tallies and reports keep working), 'ok', or 'na' (not applicable: the item is excluded). An
-- option with fold: true is a gate: choosing it folds away the rest of its group ("Not present").
-- The answer itself is checklist_item_result.value: the option's label, a list of labels, or text.

-- ---------------------------------------------------------------------------
-- Job type
-- ---------------------------------------------------------------------------

alter table public.job drop constraint job_type_check;
alter table public.job add constraint job_type_check
  check (type in ('detection', 'repair', 'maintenance', 'inspection'));

-- ---------------------------------------------------------------------------
-- Checklist items: sections, answers, groups, options, notices
-- ---------------------------------------------------------------------------

alter table public.component_type drop constraint component_type_job_type_check;
alter table public.component_type add constraint component_type_job_type_check
  check (job_type in ('detection', 'maintenance', 'inspection'));
alter table public.component_type drop constraint component_type_answer_check;
alter table public.component_type add constraint component_type_answer_check
  check (answer in ('leak', 'yes_no', 'done', 'choice', 'multi', 'text'));
alter table public.component_type drop constraint component_type_section_check;
alter table public.component_type add constraint component_type_section_check
  check (section in ('visual', 'plumbing', 'bond_beam', 'other', 'service',
                     'insp_equipment', 'insp_self_cleaning', 'insp_heaters', 'insp_electrical',
                     'insp_fencing', 'insp_covers', 'insp_visual', 'insp_plumbing'));

alter table public.component_type
  -- The small header the item sits under ("Filtration System").
  add column group_label text check (group_label is null or length(group_label) <= 80),
  -- [{"label", "flag"?: "ok"|"attention"|"leaking"|"na", "fold"?: true}] for choice and multi.
  add column options jsonb check (
    options is null or (jsonb_typeof(options) = 'array' and length(options::text) <= 4000)),
  -- A banner shown before the item, word for word, and as a recommendation on the report.
  add column notice text check (notice is null or length(notice) <= 400);

-- The answer to a choice, multi, or text item.
alter table public.checklist_item_result
  add column value jsonb check (value is null or length(value::text) <= 8000);

grant insert (group_label, options, notice), update (group_label, options, notice)
  on public.component_type to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{group_label,options,notice}',
    update_columns = update_columns || '{group_label,options,notice}'
where table_name = 'component_type';

grant insert (value), update (value) on public.checklist_item_result to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{value}', update_columns = update_columns || '{value}'
where table_name = 'checklist_item_result';

-- ---------------------------------------------------------------------------
-- The inspection's questions, word for word (from the research transcription)
-- ---------------------------------------------------------------------------

update app.config_default
set rows = rows || $json$[
  {"key": "insp_001", "name": "Is solar present?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Solar", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2010},
  {"key": "insp_002", "name": "What type of filtration system is present?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "DE"}, {"label": "Cartridge"}, {"label": "Sand / media"}, {"label": "Other"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2020},
  {"key": "insp_003", "name": "Is the system easily accessible for repair?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2030},
  {"key": "insp_004", "name": "Does the system have proper sized plumbing?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2040},
  {"key": "insp_005", "name": "Is the plumbing properly labeled and organized?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2050},
  {"key": "insp_006", "name": "Is the filtration system operating properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2060},
  {"key": "insp_007", "name": "Does the system show visible leaking?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2070},
  {"key": "insp_008", "name": "Does the system run quietly during operation?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2080},
  {"key": "insp_009", "name": "Is the filtration system mounted properly and secure?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2090},
  {"key": "insp_010", "name": "Does the filtration system have a pressure gauge?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2100},
  {"key": "insp_011", "name": "What was the pressure at the time of operation?", "section": "insp_equipment", "answer": "text", "job_type": "inspection", "group_label": "Filtration System", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2110},
  {"key": "insp_012", "name": "If pressure is high, describe reason", "section": "insp_equipment", "answer": "text", "job_type": "inspection", "group_label": "Filtration System", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2120},
  {"key": "insp_013", "name": "Does the filtration system have a proper backwash or valves to lower water in the pool?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2130},
  {"key": "insp_014", "name": "Is a proper backwash hose present at the filtration system?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2140},
  {"key": "insp_015", "name": "Are the grid / cartridge / media in good condition?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Filtration System", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2150},
  {"key": "insp_016", "name": "Does pool pump meet proper code for variable speed?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2160},
  {"key": "insp_017", "name": "Is the pool filtration pump operating properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2170},
  {"key": "insp_018", "name": "Is the pool filtration pump accessible for maintenance?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2180},
  {"key": "insp_019", "name": "Is the pool filtration pump adequately sized for the pool?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2190},
  {"key": "insp_020", "name": "Is the pool filtration pump mounted properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2200},
  {"key": "insp_021", "name": "Does the pool filtration pump have visible water leaks?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2210},
  {"key": "insp_022", "name": "Are the seals and gaskets on the pool filtration pump in good condition?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2220},
  {"key": "insp_023", "name": "Is visible plumbing adequately sized for the pool filtration pump?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2230},
  {"key": "insp_024", "name": "Does the equipment run quietly during operation?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Pool Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2240},
  {"key": "insp_025", "name": "Is there a spa jet pump?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Spa Jet Pump", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2250},
  {"key": "insp_026", "name": "Is there a swim jet system pump?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Swim Jet System Pump", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2260},
  {"key": "insp_027", "name": "Are there water features?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Water Feature Pump", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2270},
  {"key": "insp_028", "name": "Is there a self cleaning pump?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Self Cleaning Pump", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2280},
  {"key": "insp_029", "name": "Is there a booster pump?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Booster Pump For Pressure Side Cleaner", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2290},
  {"key": "insp_030", "name": "Are there any other pumps?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Other Pumps (If Applicable)", "options": [{"label": "Yes"}, {"label": "No", "fold": true}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2300},
  {"key": "insp_031", "name": "List other pump types:", "section": "insp_equipment", "answer": "text", "job_type": "inspection", "group_label": "Other Pumps (If Applicable)", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2310},
  {"key": "insp_032", "name": "Is there a blower present?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Blowers", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2320},
  {"key": "insp_033", "name": "Do valves open, close and function properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Valves", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2330},
  {"key": "insp_034", "name": "Are valve handles present and unbroken?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Valves", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2340},
  {"key": "insp_035", "name": "Are internal springs of check valves in good condition?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Valves", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2350},
  {"key": "insp_036", "name": "Have springs been replaced recently?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Valves", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2360},
  {"key": "insp_037", "name": "Do valves appear to be closing properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Valves", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2370},
  {"key": "insp_038", "name": "Are all automated valves working properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Valves", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2380},
  {"key": "insp_039", "name": "Is there a mechanical feeder present?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Tablet Feeder", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2390},
  {"key": "insp_040", "name": "Is a salt system present?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Salt System", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2400},
  {"key": "insp_041", "name": "Any other type of water purification?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Any Other Type Of Water Purification", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2410},
  {"key": "insp_042", "name": "What type of timeclock is present?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Mechanical"}, {"label": "Automated"}, {"label": "No time clock"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2420},
  {"key": "insp_043", "name": "Is the time clock mounted properly?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2430},
  {"key": "insp_044", "name": "Does the device run properly when tested?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2440},
  {"key": "insp_045", "name": "Are there exposed wires or terminals?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2450},
  {"key": "insp_046", "name": "Is the system properly grounded?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2460},
  {"key": "insp_047", "name": "Is the system in a weatherproof enclosure?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2470},
  {"key": "insp_048", "name": "Does the spa have a side switch?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2480},
  {"key": "insp_049", "name": "Does the spa have an air switch?", "section": "insp_equipment", "answer": "choice", "job_type": "inspection", "group_label": "Time Clock And Automation", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2490},
  {"key": "insp_050", "name": "Is a self cleaning system (on the floor) present?", "section": "insp_self_cleaning", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2500},
  {"key": "insp_051", "name": "The heater is for", "section": "insp_heaters", "answer": "multi", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Pool only"}, {"label": "Spa only"}, {"label": "Pool / spa combo"}, {"label": "Other"}], "notice": "FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A LICENSED GAS COMPANY", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2510},
  {"key": "insp_052", "name": "Is the heater properly sized?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2520},
  {"key": "insp_053", "name": "Did the heater fire up properly?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2530},
  {"key": "insp_054", "name": "Are there any error codes on the display?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2540},
  {"key": "insp_055", "name": "Is there a gas shutoff valve with a proper handle outside of the heater?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2550},
  {"key": "insp_056", "name": "Is the heater a safe distance from walls or trees for proper ventilation / fire hazard avoidance?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2560},
  {"key": "insp_057", "name": "Is there anything mounted above the heater that blocks the exhaust?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2570},
  {"key": "insp_058", "name": "Are internals free of debris?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2580},
  {"key": "insp_059", "name": "Are there any exposed wires?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2590},
  {"key": "insp_060", "name": "Are terminals clean?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2600},
  {"key": "insp_061", "name": "Is the burner tray clean?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heater", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2610},
  {"key": "insp_062", "name": "Is the heat pump operating properly?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heat Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "notice": "***RECOMMEND HAVING AN A/C COMPANY PERFORM INSPECTION", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2620},
  {"key": "insp_063", "name": "Is the display panel working properly?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heat Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2630},
  {"key": "insp_064", "name": "Is the heat pump blowing cold air when running?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heat Pump", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2640},
  {"key": "insp_065", "name": "Is the heat pump drain free and clear?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heat Pump", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2650},
  {"key": "insp_066", "name": "Does the heat pump have any exposed wiring?", "section": "insp_heaters", "answer": "choice", "job_type": "inspection", "group_label": "Heat Pump", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2660},
  {"key": "insp_067", "name": "Are all equipment / rails / perimeter metal within 3 feet of the pool properly bonded?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "notice": "FOR ANY UNKNOWN ELECTRICAL ISSUES - ALWAYS REFER TO A LICENSED ELECTRICIAN", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2670},
  {"key": "insp_068", "name": "Is there any exposed wiring?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2680},
  {"key": "insp_069", "name": "Are there any disconnected accessories?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2690},
  {"key": "insp_070", "name": "Is all equipment properly bonded?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2700},
  {"key": "insp_071", "name": "Is there a proper GFI present?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2710},
  {"key": "insp_072", "name": "Does GFI work properly when tripped?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2720},
  {"key": "insp_073", "name": "Are there any wires overhanging the pool?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2730},
  {"key": "insp_074", "name": "Are junction boxes mounted to proper height standards present?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2740},
  {"key": "insp_075", "name": "Are all pool lights working properly?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2750},
  {"key": "insp_076", "name": "For low voltage lights, are proper transformers installed?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2760},
  {"key": "insp_077", "name": "Are there any fiber optic lighting systems?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2770},
  {"key": "insp_078", "name": "Are spa lights working properly?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2780},
  {"key": "insp_079", "name": "Are catch basin/water feature lights working properly?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2790},
  {"key": "insp_080", "name": "Are all lights free of water?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2800},
  {"key": "insp_081", "name": "Are all lights mounted flush?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2810},
  {"key": "insp_082", "name": "Is there a proper GFI present?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2820},
  {"key": "insp_083", "name": "Does GFI work when tripped?", "section": "insp_electrical", "answer": "choice", "job_type": "inspection", "group_label": "Lights", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2830},
  {"key": "insp_084", "name": "Is a perimeter fence present?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Fencing", "options": [{"label": "Yes"}, {"label": "No", "fold": true}], "notice": "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF BARRIERS MUST BE INSTALLED", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2840},
  {"key": "insp_085", "name": "Is the fence set to state and local height standards?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Fencing", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2850},
  {"key": "insp_086", "name": "Is there proper minimal spacing between slats?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Fencing", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2860},
  {"key": "insp_087", "name": "Is perimeter fence free of defects?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Fencing", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "notice": "Always recommend child proof fencing!", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2870},
  {"key": "insp_088", "name": "Are all gates self closing and self latching?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Fencing", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2880},
  {"key": "insp_089", "name": "Are all gates free of defects?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Fencing", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2890},
  {"key": "insp_090", "name": "Is a child proof barrier present and mounted properly? Or signs of one formerly present?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Child Proof Barrier", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2900},
  {"key": "insp_091", "name": "Does the child proof barrier have locking mechanisms? (this includes house/patio access)", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Child Proof Barrier", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2910},
  {"key": "insp_092", "name": "If a barrier is present but not installed, is it defect free?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Child Proof Barrier", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2920},
  {"key": "insp_093", "name": "Does the barrier completely isolate pool and water features from the house, yard or other entrances?", "section": "insp_fencing", "answer": "choice", "job_type": "inspection", "group_label": "Child Proof Barrier", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No", "flag": "attention"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2930},
  {"key": "insp_094", "name": "Is a cover present for the pool or spa?", "section": "insp_covers", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2940},
  {"key": "insp_095", "name": "Equipment area", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Noted leak(s)", "flag": "leaking"}, {"label": "No leaks noted", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2950},
  {"key": "insp_096", "name": "Back wash", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2960},
  {"key": "insp_097", "name": "Around water feature", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2970},
  {"key": "insp_098", "name": "Solar System", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2980},
  {"key": "insp_099", "name": "Catch Basin", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 2990},
  {"key": "insp_100", "name": "Slot Drains", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3000},
  {"key": "insp_101", "name": "If Vinyl, is Vinyl stretched", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3010},
  {"key": "insp_102", "name": "Any Noticeable Tears in Vinyl", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3020},
  {"key": "insp_103", "name": "Structural cracks in pool", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes", "flag": "ok"}, {"label": "No visible structural cracks in pool", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3030},
  {"key": "insp_104", "name": "Bond beam", "section": "insp_visual", "answer": "choice", "job_type": "inspection", "options": [{"label": "Was cracked at area(s)", "flag": "attention"}, {"label": "Was solid and not cracked", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3040},
  {"key": "insp_105", "name": "Returns", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3050},
  {"key": "insp_106", "name": "Skimmer", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3060},
  {"key": "insp_107", "name": "Skimmer seam", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3070},
  {"key": "insp_108", "name": "Skimmer suction", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3080},
  {"key": "insp_109", "name": "Skimmer ports", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3090},
  {"key": "insp_110", "name": "Main drain", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3100},
  {"key": "insp_111", "name": "All light niches and conduits", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3110},
  {"key": "insp_112", "name": "Cleaner lines", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3120},
  {"key": "insp_113", "name": "Side suctions", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3130},
  {"key": "insp_114", "name": "Front to equalizer or main drain", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3140},
  {"key": "insp_115", "name": "Structural cracks", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3150},
  {"key": "insp_116", "name": "Spa jets", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3160},
  {"key": "insp_117", "name": "Spa fill", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3170},
  {"key": "insp_118", "name": "Surge tank", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3180},
  {"key": "insp_119", "name": "Scum gutters", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3190},
  {"key": "insp_120", "name": "Bond Beam Pool", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3200},
  {"key": "insp_121", "name": "Bond Beam Spa", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3210},
  {"key": "insp_122", "name": "Autofill", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3220},
  {"key": "insp_123", "name": "Around all fittings", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3230},
  {"key": "insp_124", "name": "Autofill EQ line", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}, {"label": "Not applicable", "flag": "na"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3240},
  {"key": "insp_125", "name": "Other", "section": "insp_plumbing", "answer": "text", "job_type": "inspection", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3250},
  {"key": "insp_126", "name": "Static tested", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Leaking", "flag": "leaking"}, {"label": "Not leaking", "flag": "ok"}], "notice": "Any EQ line between spa-pool or any vessel structure:", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3260},
  {"key": "insp_127", "name": "Used Vinyl Liner Leak Locator to locate any pinholes:", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3270},
  {"key": "insp_128", "name": "Ran suction lines to check for air on", "section": "insp_plumbing", "answer": "multi", "job_type": "inspection", "options": [{"label": "Pool main drain"}, {"label": "Spa suctions"}, {"label": "Pool skimmer"}, {"label": "Side suctions"}, {"label": "Water feature suction"}, {"label": "Other"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3280},
  {"key": "insp_129", "name": "If any air noted, describe", "section": "insp_plumbing", "answer": "text", "job_type": "inspection", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3290},
  {"key": "insp_130", "name": "Upon visual inspection, noted surge tank:", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "group_label": "Surge Tank", "options": [{"label": "Yes"}, {"label": "No", "fold": true}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3300},
  {"key": "insp_131", "name": "Hydrophoned and listened around fittings and protrusions:", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "group_label": "Surge Tank", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3310},
  {"key": "insp_132", "name": "Was the surge tank overflowing to waste when the system was off?", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "group_label": "Surge Tank", "options": [{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3320},
  {"key": "insp_133", "name": "Was the surge tank overflowing to waste when the system was operating properly?", "section": "insp_plumbing", "answer": "choice", "job_type": "inspection", "group_label": "Surge Tank", "options": [{"label": "Yes"}, {"label": "No"}], "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 3330}
]$json$::jsonb
where key = 'component_type';

-- One price on the job, like the detection fee (a starting price; shops set their own).
update app.config_default
set rows = rows || $json$[
  {"package": "leak", "name": "Pool inspection", "category": "Inspection", "component_type_key": null, "unit": "each", "price_cents": 49500, "taxable": false, "warranty_months": null, "sort_order": 30}
]$json$::jsonb
where key = 'price_book_item';

-- One package's defaults for one shop (as 20261012004700_scheduled_cleanings.sql), with the new
-- columns; leak detection also gets the inspection checklist.
create or replace function app.seed_package_defaults(target_company uuid, pkg text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if pkg not in ('pool', 'leak') then
    raise exception 'Unknown package %', pkg using errcode = 'invalid_parameter_value';
  end if;

  -- Checklist: leak detection and pool inspection items for leak shops, visit items for pool care.
  insert into public.component_type
    (company_id, key, name, section, answer, job_type, on_schedule, applies_to_pool_type,
     group_label, options, notice, allows_multiple, default_count, applies_to, methods,
     sort_order)
  select target_company, r.key, r.name, coalesce(r.section, 'visual'), coalesce(r.answer, 'leak'),
         coalesce(r.job_type, 'detection'), coalesce(r.on_schedule, false), r.pool_type,
         r.group_label, r.options, r.notice, r.allows_multiple, r.default_count, r.applies_to,
         r.methods, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, section text, answer text,
         job_type text, on_schedule boolean, pool_type text, group_label text, options jsonb,
         notice text, allows_multiple boolean, default_count integer, applies_to text,
         methods text[], sort_order integer)
  where d.key = 'component_type'
    and case pkg when 'pool' then coalesce(r.job_type, 'detection') = 'maintenance'
                 else coalesce(r.job_type, 'detection') in ('detection', 'inspection') end
    and not exists (select 1 from public.component_type t
                    where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

  if pkg = 'leak' then
    insert into public.test_type
      (company_id, key, name, field_schema, calculator, result_options, sort_order)
    select target_company, r.key, r.name, r.field_schema, r.calculator, r.result_options, r.sort_order
    from app.config_default d,
         jsonb_to_recordset(d.rows) as r(key text, name text, field_schema jsonb, calculator text,
           result_options text[], sort_order integer)
    where d.key = 'test_type'
      and not exists (select 1 from public.test_type t
                      where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

    insert into public.severity_level (company_id, key, name, color, must_mention, sort_order)
    select target_company, r.key, r.name, r.color, r.must_mention, r.sort_order
    from app.config_default d,
         jsonb_to_recordset(d.rows) as r(key text, name text, color text, must_mention boolean,
           sort_order integer)
    where d.key = 'severity_level'
      and not exists (select 1 from public.severity_level t
                      where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

    insert into public.exclusion_reason (company_id, label, sort_order)
    select target_company, r.label, r.sort_order
    from app.config_default d, jsonb_to_recordset(d.rows) as r(label text, sort_order integer)
    where d.key = 'exclusion_reason'
      and not exists (select 1 from public.exclusion_reason t
                      where t.company_id = target_company and t.label = r.label and t.deleted_at is null);
  end if;

  insert into public.price_book_item
    (company_id, name, category, component_type_key, unit, price_cents, taxable, warranty_months,
     sort_order)
  select target_company, r.name, r.category, r.component_type_key, r.unit, r.price_cents,
         r.taxable, r.warranty_months, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(package text, name text, category text,
         component_type_key text, unit text, price_cents integer, taxable boolean,
         warranty_months integer, sort_order integer)
  where d.key = 'price_book_item' and coalesce(r.package, 'leak') = pkg
    and not exists (select 1 from public.price_book_item t
                    where t.company_id = target_company and t.name = r.name and t.deleted_at is null);
end
$$;

-- Shops that do leak detection get the inspection checklist and its price book item now. Only
-- what's missing is added, so their own edits stay.
do $$
declare
  co uuid;
begin
  for co in select c.id from public.company c
            where coalesce(c.settings ->> 'services', 'both') <> 'pool' loop
    perform app.seed_package_defaults(co, 'leak');
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- From the Customer: which job types ask each question
-- ---------------------------------------------------------------------------

-- job_types lists the job types that ask a question; without it, leak detection (as until now).
-- The inspection's Phone Questionnaire, for every shop and for new ones.
create function pg_temp.inspection_questions() returns jsonb language sql as $f$
  select $json$[
    {"key": "found_us", "label": "How did you find us?", "type": "single", "job_types": ["inspection"],
     "options": ["Existing customer (used our services in the past)", "Online", "Other"]},
    {"key": "real_estate", "label": "If it is a real estate deal, it is for the:", "type": "single", "job_types": ["inspection"],
     "options": ["Buyer", "Seller"]},
    {"key": "features", "label": "Features that apply", "type": "multi", "job_types": ["inspection"],
     "options": ["Swimming Pool", "Spa", "Portable Spa", "Infinity Edge / Negative Edge", "Catch Basin", "Slot Drain", "Surge Tank", "Sheer Descent Wall", "Rock Formation Waterfall", "Deck Jets", "Additional Water Feature", "Other"]},
    {"key": "heating", "label": "Does the pool have a Heater/Heat Pump?", "type": "multi", "job_types": ["inspection"],
     "options": ["Heater", "Heat Pump", "Solar System", "Geothermal System"]}
  ]$json$::jsonb
$f$;

update public.company
set settings = jsonb_set(settings, '{intake_questions}',
  case when jsonb_typeof(settings -> 'intake_questions') = 'array'
       then settings -> 'intake_questions' else '[]'::jsonb end
  || pg_temp.inspection_questions())
where not exists (select 1 from jsonb_array_elements(
                    case when jsonb_typeof(settings -> 'intake_questions') = 'array'
                         then settings -> 'intake_questions' else '[]'::jsonb end) q
                  where q ->> 'key' = 'found_us');

do $$
declare
  current_default jsonb;
begin
  execute 'select ' || pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.company'::regclass and a.attname = 'settings'
  into current_default;
  current_default := jsonb_set(current_default, '{intake_questions}',
    coalesce(current_default -> 'intake_questions', '[]'::jsonb) || pg_temp.inspection_questions());
  execute format('alter table public.company alter column settings set default %L::jsonb',
                 current_default);
end
$$;

-- ---------------------------------------------------------------------------
-- New Job and the invoice
-- ---------------------------------------------------------------------------

-- As 20261012005100_new_repair_job.sql, taking 'inspection' too.
create or replace function public.create_job(
  target_company uuid,
  new_customer jsonb,
  existing_customer uuid,
  new_property jsonb,
  existing_property uuid,
  job jsonb,
  components jsonb
) returns uuid
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  cp record;
  new_job uuid;
  c jsonb;
  comp uuid;
begin
  select * into cp from app.customer_and_pool(target_company, new_customer, existing_customer,
                                              new_property, existing_property);
  insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                          assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                          summary_notes, fee_cents, intake)
  values (target_company,
          case when job ->> 'type' in ('maintenance', 'repair', 'inspection') then job ->> 'type'
               else 'detection' end,
          cp.prop, cp.cust, job ->> 'status',
          (job ->> 'assigned_user_id')::uuid, (job ->> 'second_tech_id')::uuid,
          (job ->> 'scheduled_start')::timestamptz, (job ->> 'scheduled_end')::timestamptz,
          job ->> 'summary_notes', (job ->> 'fee_cents')::integer, job -> 'intake')
  returning id into new_job;

  for c in select * from jsonb_array_elements(coalesce(components, '[]')) loop
    insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                      label, sort_order)
    values (target_company, new_job, (c ->> 'component_type_id')::uuid,
            (c ->> 'instance_number')::integer, c ->> 'label', (c ->> 'sort_order')::integer)
    returning id into comp;
    insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
    values (target_company, new_job, comp, 'pending');
  end loop;
  return new_job;
end
$$;

-- The job's price is its first invoice line: "Leak detection", "Pool inspection", or "Repair".
-- As 20261012005100_new_repair_job.sql otherwise.
create or replace function app.create_invoice_unchecked(target_job uuid) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
  q public.quote;
  inv uuid;
  deposit bigint;
begin
  select * into j from public.job where id = target_job and deleted_at is null for update;
  if j.id is null or not app.is_member(j.company_id) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
  select id into inv from public.invoice
  where job_id = j.id and status <> 'void' and deleted_at is null order by created_at limit 1;
  if inv is not null then
    return inv;
  end if;
  if j.status in ('unscheduled', 'scheduled', 'canceled') then
    raise exception 'Start the job before invoicing it' using errcode = 'check_violation';
  end if;

  select * into q from public.quote
  where repair_job_id = j.id and status = 'accepted' and deleted_at is null
  order by accepted_at desc limit 1;
  if q.id is not null and exists (select 1 from public.payment where quote_id = q.id
                                  and status = 'pending' and deleted_at is null) then
    raise exception 'The deposit is still clearing. Create the invoice once it has cleared.'
      using errcode = 'check_violation', hint = 'deposit_pending';
  end if;

  insert into public.invoice (company_id, job_id, quote_id, discount_cents)
  values (j.company_id, j.id, q.id, coalesce(q.discount_cents, 0))
  returning id into inv;

  if j.fee_cents is not null and j.fee_cents > 0 then
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    values (j.company_id, inv,
            case j.type when 'repair' then 'Repair' when 'inspection' then 'Pool inspection'
                         else 'Leak detection' end, j.fee_cents,
            false, 0);
  end if;
  if q.id is not null then
    insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                          unit_price_cents, taxable, warranty_months, sort_order)
    select j.company_id, inv, l.description, l.quantity, l.unit_price_cents, l.taxable,
           l.warranty_months, 10 + row_number() over (order by l.sort_order, l.id)
    from public.quote_line_item l where l.quote_id = q.id and l.deleted_at is null;

    select coalesce(sum(amount_cents), 0) into deposit from public.payment
    where quote_id = q.id and status = 'succeeded' and deleted_at is null;
    if deposit > 0 then
      perform set_config('app.invoice_server', 'on', true);
      insert into public.invoice_line_item (company_id, invoice_id, kind, description,
                                            unit_price_cents, taxable, sort_order)
      values (j.company_id, inv, 'deposit_credit',
              'Deposit paid on quote #' || coalesce(q.number::text, ''), -deposit, false, 1000);
      perform set_config('app.invoice_server', 'off', true);
    end if;
  end if;
  return inv;
end
$$;


-- ---------------------------------------------------------------------------
-- Reports: the answers in the snapshot
-- ---------------------------------------------------------------------------

-- The snapshot as before (20261012005600_pool_diagram_layout.sql), each checklist item with its
-- group, options, notice and answer.
alter function app.report_snapshot(uuid) rename to report_snapshot_m11;
create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null then null else s || jsonb_build_object(
    'components', coalesce((
      select jsonb_agg(comp || jsonb_build_object(
               'group_label', t.group_label, 'options', t.options, 'notice', t.notice,
               'value', r.value)
             order by ord)
      from jsonb_array_elements(s -> 'components') with ordinality as e(comp, ord)
      left join public.job_component jc on jc.id = (comp ->> 'id')::uuid
      left join public.component_type t on t.id = jc.component_type_id
      left join public.checklist_item_result r
        on r.job_component_id = jc.id and r.deleted_at is null), '[]'::jsonb))
  end
  from app.report_snapshot_m11(target_job) s
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_m11(uuid) from public;

-- ---------------------------------------------------------------------------
-- Sending the report
-- ---------------------------------------------------------------------------

-- The body behind public.send_report (20261012002800_visibility_functions.sql), as
-- 20261012002600_report_sign_off.sql except that a pool inspection can be sent before all of
-- its 133 questions are answered: the report lists the ones that were.
create or replace function app.send_report_unchecked(target_report uuid, unsigned_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  link text;
  pending int;
  snap jsonb;
  reason text := nullif(trim(coalesce(unsigned_reason, '')), '');
begin
  select * into rep from public.report where id = target_report and deleted_at is null for update;
  if rep.id is null or not app.is_member(rep.company_id)
     or not app.job_visible(rep.company_id, rep.job_id) then
    raise exception 'Report not found' using errcode = 'insufficient_privilege';
  end if;
  if rep.status <> 'draft' then
    raise exception 'This report has already been sent' using errcode = 'check_violation';
  end if;
  if rep.final_sections is null or jsonb_typeof(rep.final_sections) <> 'array'
     or jsonb_array_length(rep.final_sections) = 0
     or not exists (select 1 from jsonb_array_elements(rep.final_sections) s
                    where length(trim(coalesce(s ->> 'text', ''))) > 0) then
    raise exception 'Write the report before sending it' using errcode = 'check_violation';
  end if;
  -- BUILD_PLAN 6.1: every checklist item is inspected or excluded with a reason. A pool
  -- inspection's report shows the questions answered, so its unanswered ones don't hold it up.
  select count(*) into pending
  from public.job_component jc
  join public.job j on j.id = jc.job_id
  left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
  where jc.job_id = rep.job_id and jc.deleted_at is null and j.type <> 'inspection'
    and coalesce(r.status, 'pending') = 'pending';
  if pending > 0 then
    raise exception '% checklist item(s) are still to do. Inspect them or mark them not inspected with a reason.', pending
      using errcode = 'check_violation', hint = 'checklist_pending';
  end if;

  -- Signatures taken since the last version belong to this one.
  update public.signature set report_id = rep.id
  where job_id = rep.job_id and report_id is null and purpose <> 'quote_acceptance'
    and deleted_at is null;
  snap := app.report_snapshot(rep.job_id);
  if reason is not null and not exists (
    select 1 from public.signature
    where report_id = rep.id and deleted_at is null) then
    snap := snap || jsonb_build_object('sign_off', jsonb_build_object('unsigned_reason', reason));
  end if;

  update public.report set status = 'superseded'
  where job_id = rep.job_id and template_key = rep.template_key and status = 'sent'
    and deleted_at is null;
  update public.report set status = 'sent', sent_at = now(), data_snapshot = snap
  where id = rep.id;
  insert into public.share_link (company_id, job_id, report_id)
  values (rep.company_id, rep.job_id, rep.id)
  returning token into link;
  update public.job set status = 'report_sent'
  where id = rep.job_id and status = 'in_progress';
  return jsonb_build_object('token', link, 'report_id', rep.id, 'version', rep.version);
end
$$;

-- The review screen's draft (behind public.report_preview, as 20261012002600_report_sign_off.sql):
-- nothing pending holds up signing a pool inspection.
create or replace function app.report_preview_unchecked(target_report uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  pending int;
begin
  select * into rep from public.report where id = target_report and deleted_at is null;
  if rep.id is null or not app.is_member(rep.company_id) or not app.job_visible(rep.company_id, rep.job_id) then
    return null;
  end if;
  select count(*) into pending
  from public.job_component jc
  join public.job j on j.id = jc.job_id
  left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
  where jc.job_id = rep.job_id and jc.deleted_at is null and j.type <> 'inspection'
    and coalesce(r.status, 'pending') = 'pending';
  return jsonb_build_object(
    'report_id', rep.id, 'job_id', rep.job_id, 'template_key', rep.template_key,
    'version', rep.version, 'status', rep.status, 'sent_at', rep.sent_at,
    'final_sections', rep.final_sections,
    'snapshot', case when rep.status = 'draft' then app.report_snapshot(rep.job_id)
                     else rep.data_snapshot end,
    'pending', pending);
end
$$;
