/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_order_addresses`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_order_addresses`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_order_addresses` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `order_id` bigint unsigned NOT NULL, `address_type` varchar(20) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `first_name` text COLLATE utf8mb4_unicode_520_ci, `last_name` text COLLATE utf8mb4_unicode_520_ci, `company` text COLLATE utf8mb4_unicode_520_ci, `address_1` text COLLATE utf8mb4_unicode_520_ci, `address_2` text COLLATE utf8mb4_unicode_520_ci, `city` text COLLATE utf8mb4_unicode_520_ci, `state` text COLLATE utf8mb4_unicode_520_ci, `postcode` text COLLATE utf8mb4_unicode_520_ci, `country` text COLLATE utf8mb4_unicode_520_ci, `email` varchar(320) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `phone` varchar(100) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, PRIMARY KEY (`id`), UNIQUE KEY `address_type_order_id` (`address_type`,`order_id`), KEY `order_id` (`order_id`), KEY `email` (`email`(191)), KEY `phone` (`phone`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
