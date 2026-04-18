/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_gla_shipping_rates`; */
/* PRE_TABLE_NAME: `1776400480_wp_gla_shipping_rates`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_gla_shipping_rates` ( `id` bigint NOT NULL AUTO_INCREMENT, `country` varchar(2) COLLATE utf8mb4_unicode_520_ci NOT NULL, `currency` varchar(3) COLLATE utf8mb4_unicode_520_ci NOT NULL, `rate` double NOT NULL DEFAULT '0', `options` text COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`id`), KEY `country` (`country`), KEY `currency` (`currency`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
