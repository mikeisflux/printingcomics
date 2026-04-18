/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_sbi_feed_caches`; */
/* PRE_TABLE_NAME: `1776400480_wp_sbi_feed_caches`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_sbi_feed_caches` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `feed_id` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `cache_key` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `cache_value` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `cron_update` varchar(20) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'yes', `last_updated` datetime NOT NULL, PRIMARY KEY (`id`), KEY `feed_id` (`feed_id`(191))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
