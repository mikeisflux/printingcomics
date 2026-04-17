/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_rate_limits`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_rate_limits`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_rate_limits` ( `rate_limit_id` bigint unsigned NOT NULL AUTO_INCREMENT, `rate_limit_key` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `rate_limit_expiry` bigint unsigned NOT NULL, `rate_limit_remaining` smallint NOT NULL DEFAULT '0', PRIMARY KEY (`rate_limit_id`), UNIQUE KEY `rate_limit_key` (`rate_limit_key`(191))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
