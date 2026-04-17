/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_sbi_instagram_feed_locator`; */
/* PRE_TABLE_NAME: `1776400480_wp_sbi_instagram_feed_locator`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_sbi_instagram_feed_locator` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `feed_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '', `post_id` bigint unsigned NOT NULL, `html_location` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown', `shortcode_atts` longtext COLLATE utf8mb4_unicode_ci NOT NULL, `last_update` datetime DEFAULT NULL, PRIMARY KEY (`id`), KEY `feed_id` (`feed_id`), KEY `post_id` (`post_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
