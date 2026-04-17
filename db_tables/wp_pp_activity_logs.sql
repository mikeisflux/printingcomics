/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_pp_activity_logs`; */
/* PRE_TABLE_NAME: `1776400480_wp_pp_activity_logs`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_pp_activity_logs` ( `id` mediumint NOT NULL AUTO_INCREMENT, `ip` varchar(55) COLLATE utf8mb4_unicode_520_ci NOT NULL, `browser` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `status` tinytext COLLATE utf8mb4_unicode_520_ci NOT NULL, `created_at` varchar(55) COLLATE utf8mb4_unicode_520_ci NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
