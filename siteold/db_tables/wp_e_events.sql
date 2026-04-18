/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_e_events`; */
/* PRE_TABLE_NAME: `1776400480_wp_e_events`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_e_events` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `event_data` text COLLATE utf8mb4_unicode_520_ci, `created_at` datetime NOT NULL, PRIMARY KEY (`id`), KEY `created_at_index` (`created_at`)) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_e_events` (`id`, `event_data`, `created_at`) VALUES (1,'{\"event\":\"modal load\",\"version\":\"\",\"details\":\"{\\\"placement\\\":\\\"Onboarding wizard\\\",\\\"step\\\":\\\"account\\\",\\\"user_state\\\":\\\"anon\\\"}\",\"ts\":\"2024-08-27T08:30:33.992-06:45\"}','2024-08-27 08:30:34'),(2,'{\"event\":\"close modal\",\"version\":\"\",\"details\":\"{\\\"placement\\\":\\\"Onboarding wizard\\\",\\\"step\\\":\\\"account\\\"}\",\"ts\":\"2024-08-27T08:30:36.290-06:45\"}','2024-08-27 08:30:36');
