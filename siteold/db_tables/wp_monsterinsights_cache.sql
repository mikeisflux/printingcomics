/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_monsterinsights_cache`; */
/* PRE_TABLE_NAME: `1776400480_wp_monsterinsights_cache`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_monsterinsights_cache` ( `cache_id` bigint unsigned NOT NULL AUTO_INCREMENT, `cache_key` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL, `cache_value` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `cache_group` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT 'default', `expires_at` datetime NOT NULL, `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`cache_id`), UNIQUE KEY `cache_key_group` (`cache_key`,`cache_group`), KEY `expires_at` (`expires_at`), KEY `created_at` (`created_at`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
