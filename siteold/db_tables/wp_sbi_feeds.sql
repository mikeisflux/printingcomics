/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_sbi_feeds`; */
/* PRE_TABLE_NAME: `1776400480_wp_sbi_feeds`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_sbi_feeds` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `feed_name` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `feed_title` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `settings` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `author` bigint unsigned NOT NULL DEFAULT '1', `status` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `last_modified` datetime NOT NULL, PRIMARY KEY (`id`), KEY `author` (`author`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
