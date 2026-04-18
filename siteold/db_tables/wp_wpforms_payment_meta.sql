/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wpforms_payment_meta`; */
/* PRE_TABLE_NAME: `1776400480_wp_wpforms_payment_meta`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wpforms_payment_meta` ( `id` bigint NOT NULL AUTO_INCREMENT, `payment_id` bigint NOT NULL, `meta_key` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `meta_value` longtext COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`id`), KEY `payment_id` (`payment_id`), KEY `meta_key` (`meta_key`(191)), KEY `meta_value` (`meta_value`(191))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
