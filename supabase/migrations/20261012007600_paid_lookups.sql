-- Pools the free lookups miss (owner, 2026-10-20: "Go with option 1, cap at 100"): Mapbox's
-- permanent geocoding, which has no free tier ($5 per 1,000), gets one try at an address the
-- Census and OpenStreetMap geocoders couldn't find, at most 100 a month for every shop
-- together: at most $0.50 a month. Counted in the same monthly budget as the free tiers.

insert into app.mapbox_budget (api, monthly_limit) values ('geocode_paid', 100);
