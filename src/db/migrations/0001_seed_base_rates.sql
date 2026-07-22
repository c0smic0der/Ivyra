-- Static outside-view rates for the base-rate fallback (§9.2). No AI.
INSERT INTO base_rates (kind, rate, description) VALUES
  ('deadline_hit', 0.35, 'Self-imposed deadlines are hit'),
  ('habit_adherence', 0.40, 'New habits stick at the stated frequency'),
  ('hiring_works_out', 0.50, 'A new hire works out as hoped'),
  ('project_on_budget', 0.30, 'Projects finish at or under budget');
