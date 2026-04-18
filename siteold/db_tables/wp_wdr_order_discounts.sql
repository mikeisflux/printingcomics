/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wdr_order_discounts`; */
/* PRE_TABLE_NAME: `1776400480_wp_wdr_order_discounts`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wdr_order_discounts` ( `id` int NOT NULL AUTO_INCREMENT, `order_id` int DEFAULT NULL, `has_free_shipping` enum('yes','no') COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'no', `discounts` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `created_at` datetime DEFAULT NULL, `updated_at` datetime DEFAULT NULL, `extra` longtext COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
