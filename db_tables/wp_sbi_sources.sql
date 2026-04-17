/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_sbi_sources`; */
/* PRE_TABLE_NAME: `1776400480_wp_sbi_sources`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_sbi_sources` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `account_id` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `account_type` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `privilege` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `access_token` varchar(1000) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `username` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `info` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `error` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `expires` datetime NOT NULL, `last_updated` datetime NOT NULL, `author` bigint unsigned NOT NULL DEFAULT '1', `connect_type` varchar(100) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', PRIMARY KEY (`id`), KEY `account_type` (`account_type`(191)), KEY `author` (`author`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
