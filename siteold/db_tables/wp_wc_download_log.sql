/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_download_log`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_download_log`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_download_log` ( `download_log_id` bigint unsigned NOT NULL AUTO_INCREMENT, `timestamp` datetime NOT NULL, `permission_id` bigint unsigned NOT NULL, `user_id` bigint unsigned DEFAULT NULL, `user_ip_address` varchar(100) COLLATE utf8mb4_unicode_520_ci DEFAULT '', PRIMARY KEY (`download_log_id`), KEY `permission_id` (`permission_id`), KEY `timestamp` (`timestamp`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
