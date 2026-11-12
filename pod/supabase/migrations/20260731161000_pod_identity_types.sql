-- Add the dedicated Print-on-Demand account type without conflating POD
-- customers with distributed publishers.

alter type public.organization_type add value if not exists 'pod_customer';
alter type public.app_role add value if not exists 'pod';

