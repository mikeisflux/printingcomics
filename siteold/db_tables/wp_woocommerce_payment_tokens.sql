/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_payment_tokens`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_payment_tokens`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_payment_tokens` ( `token_id` bigint unsigned NOT NULL AUTO_INCREMENT, `gateway_id` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `token` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `user_id` bigint unsigned NOT NULL DEFAULT '0', `type` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `is_default` tinyint(1) NOT NULL DEFAULT '0', PRIMARY KEY (`token_id`), KEY `user_id` (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
