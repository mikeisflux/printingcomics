/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_log`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_log`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_log` ( `log_id` bigint unsigned NOT NULL AUTO_INCREMENT, `timestamp` datetime NOT NULL, `level` smallint NOT NULL, `source` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `message` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `context` longtext COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`log_id`), KEY `level` (`level`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
