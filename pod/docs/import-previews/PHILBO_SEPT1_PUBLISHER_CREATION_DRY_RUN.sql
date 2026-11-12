-- READ-ONLY-EFFECT DRY RUN: every proposed insert is rolled back at the end.
-- This file must not be converted to COMMIT until Maura explicitly approves
-- production Publisher creation after reviewing the UUID/name mapping.

begin;

insert into public.organizations (id, organization_type, name, slug, account_status)
values
  ('3811302a-dd82-4a06-985b-35afe4957c17', 'publisher', '20th Place Media', '20th-place-media', 'pending'),
  ('82028526-e6a8-42b8-b26e-86cfb9e991a8', 'publisher', '4 Speed Studios', '4-speed-studios', 'pending'),
  ('ac704c8e-e112-468b-ad57-48be22ffadc8', 'publisher', 'APEX COMICS GROUP', 'apex-comics-group', 'pending'),
  ('af0a46f8-e54b-4452-aac4-3a689188ec39', 'publisher', 'Broken Oar Comics', 'broken-oar-comics', 'pending'),
  ('33f59355-02ed-4859-874e-9e51e33e131d', 'publisher', 'Critical Entertainment', 'critical-entertainment', 'pending'),
  ('28bec1a4-b2a2-494b-9719-81b396305e58', 'publisher', 'Crooked Comix, LLC', 'crooked-comix-llc', 'pending'),
  ('b742240d-17d7-48ad-9477-dbd192326faf', 'publisher', 'Dreamscape Publishing', 'dreamscape-publishing', 'pending'),
  ('3c0724de-8fff-494c-98a4-0a6cfba76841', 'publisher', 'FairSquare Graphics', 'fairsquare-graphics', 'pending'),
  ('b774447e-2ec1-4d57-bd06-98bea11d2b3e', 'publisher', 'Hermes Press', 'hermes-press', 'pending'),
  ('e64181b7-a440-4f0c-b694-a6e3c7a56b96', 'publisher', 'Heroic Publishing Inc', 'heroic-publishing-inc', 'pending'),
  ('1a54e853-79c1-4e38-b127-e5ad18be31ef', 'publisher', 'High-Vibrational Pirate Syndicate of Western New York', 'high-vibrational-pirate-syndicate-western-new-york', 'pending'),
  ('6918da47-bb9a-4019-9a4e-5fe0ffaaf61a', 'publisher', 'Homebrewed Comics', 'homebrewed-comics', 'pending'),
  ('cccd6967-e9ad-4d20-8588-d7997ca76c26', 'publisher', 'New Pain Pro', 'new-pain-pro', 'pending'),
  ('c641d442-8d1a-49c3-8f7e-ebd082b33621', 'publisher', 'Phantom Blade Productions LLC', 'phantom-blade-productions-llc', 'pending'),
  ('f443d302-f378-4a30-b4c7-0a2bc9a37c7a', 'publisher', 'Philbo Publishing', 'philbo-publishing', 'pending'),
  ('2e2ddf1e-099c-45ce-b62d-049d01667d81', 'publisher', 'Silverline Comics', 'silverline-comics', 'pending'),
  ('02466c1d-4e5a-4d57-908d-c7ff97599d91', 'publisher', 'Star Cross Comics', 'star-cross-comics', 'pending');

insert into public.publisher_profiles (organization_id, legal_business_name, commission_rate, default_fulfillment_method)
select id, name, null, null
from public.organizations
where id in (
  '3811302a-dd82-4a06-985b-35afe4957c17',
  '82028526-e6a8-42b8-b26e-86cfb9e991a8',
  'ac704c8e-e112-468b-ad57-48be22ffadc8',
  'af0a46f8-e54b-4452-aac4-3a689188ec39',
  '33f59355-02ed-4859-874e-9e51e33e131d',
  '28bec1a4-b2a2-494b-9719-81b396305e58',
  'b742240d-17d7-48ad-9477-dbd192326faf',
  '3c0724de-8fff-494c-98a4-0a6cfba76841',
  'b774447e-2ec1-4d57-bd06-98bea11d2b3e',
  'e64181b7-a440-4f0c-b694-a6e3c7a56b96',
  '1a54e853-79c1-4e38-b127-e5ad18be31ef',
  '6918da47-bb9a-4019-9a4e-5fe0ffaaf61a',
  'cccd6967-e9ad-4d20-8588-d7997ca76c26',
  'c641d442-8d1a-49c3-8f7e-ebd082b33621',
  'f443d302-f378-4a30-b4c7-0a2bc9a37c7a',
  '2e2ddf1e-099c-45ce-b62d-049d01667d81',
  '02466c1d-4e5a-4d57-908d-c7ff97599d91'
);

select id as proposed_production_publisher_uuid, name, slug, account_status
from public.organizations
where organization_type = 'publisher'
order by lower(name);

rollback;

select
  'PASSED — ROLLED BACK' as dry_run_result,
  17 as proposed_publisher_count,
  count(*) as persisted_proposed_publisher_count
from public.organizations
where id in (
  '3811302a-dd82-4a06-985b-35afe4957c17',
  '82028526-e6a8-42b8-b26e-86cfb9e991a8',
  'ac704c8e-e112-468b-ad57-48be22ffadc8',
  'af0a46f8-e54b-4452-aac4-3a689188ec39',
  '33f59355-02ed-4859-874e-9e51e33e131d',
  '28bec1a4-b2a2-494b-9719-81b396305e58',
  'b742240d-17d7-48ad-9477-dbd192326faf',
  '3c0724de-8fff-494c-98a4-0a6cfba76841',
  'b774447e-2ec1-4d57-bd06-98bea11d2b3e',
  'e64181b7-a440-4f0c-b694-a6e3c7a56b96',
  '1a54e853-79c1-4e38-b127-e5ad18be31ef',
  '6918da47-bb9a-4019-9a4e-5fe0ffaaf61a',
  'cccd6967-e9ad-4d20-8588-d7997ca76c26',
  'c641d442-8d1a-49c3-8f7e-ebd082b33621',
  'f443d302-f378-4a30-b4c7-0a2bc9a37c7a',
  '2e2ddf1e-099c-45ce-b62d-049d01667d81',
  '02466c1d-4e5a-4d57-908d-c7ff97599d91'
);
