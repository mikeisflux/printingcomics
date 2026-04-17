/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_gla_shipping_times`; */
/* PRE_TABLE_NAME: `1776400480_wp_gla_shipping_times`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_gla_shipping_times` ( `id` bigint NOT NULL AUTO_INCREMENT, `country` varchar(2) COLLATE utf8mb4_unicode_520_ci NOT NULL, `time` bigint NOT NULL DEFAULT '0', `max_time` bigint NOT NULL DEFAULT '0', PRIMARY KEY (`id`), KEY `country` (`country`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
