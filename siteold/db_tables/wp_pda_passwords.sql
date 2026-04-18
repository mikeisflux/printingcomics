/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_pda_passwords`; */
/* PRE_TABLE_NAME: `1776400480_wp_pda_passwords`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_pda_passwords` ( `id` mediumint NOT NULL AUTO_INCREMENT, `post_id` mediumint NOT NULL, `contact_id` mediumint DEFAULT NULL, `campaign_app_type` text COLLATE utf8mb4_unicode_520_ci, `password` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT '', `is_activated` tinyint(1) DEFAULT '1', `created_time` bigint DEFAULT NULL, `expired_time` bigint DEFAULT NULL, `hits_count` mediumint NOT NULL, `is_default` tinyint(1) DEFAULT '0', `expired_date` bigint DEFAULT NULL, `usage_limit` mediumint DEFAULT NULL, `label` tinytext COLLATE utf8mb4_unicode_520_ci, `post_types` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `protection_types` varchar(50) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, UNIQUE KEY `id` (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
