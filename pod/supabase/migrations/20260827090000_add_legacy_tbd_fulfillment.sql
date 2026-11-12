-- One-time September legacy import prerequisite.
-- Adding the enum value is isolated because PostgreSQL requires the transaction
-- that adds an enum value to commit before later migrations can use it.

alter type public.fulfillment_method add value if not exists 'tbd';
