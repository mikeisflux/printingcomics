/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_payment_tokenmeta`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_payment_tokenmeta`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_payment_tokenmeta` ( `meta_id` bigint unsigned NOT NULL AUTO_INCREMENT, `payment_token_id` bigint unsigned NOT NULL, `meta_key` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `meta_value` longtext COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`meta_id`), KEY `payment_token_id` (`payment_token_id`), KEY `meta_key` (`meta_key`(32))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
