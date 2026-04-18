/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_ce4wp_contacts`; */
/* PRE_TABLE_NAME: `1776400480_wp_ce4wp_contacts`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_ce4wp_contacts` ( `contact_id` bigint unsigned NOT NULL AUTO_INCREMENT, `email` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `first_name` varchar(200) COLLATE utf8mb4_unicode_520_ci DEFAULT '', `last_name` varchar(200) COLLATE utf8mb4_unicode_520_ci DEFAULT '', `telephone` varchar(200) COLLATE utf8mb4_unicode_520_ci DEFAULT '', `consent` varchar(200) COLLATE utf8mb4_unicode_520_ci DEFAULT '', PRIMARY KEY (`contact_id`), UNIQUE KEY `email` (`email`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
