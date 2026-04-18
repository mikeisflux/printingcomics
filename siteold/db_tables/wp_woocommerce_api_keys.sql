/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_api_keys`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_api_keys`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_api_keys` ( `key_id` bigint unsigned NOT NULL AUTO_INCREMENT, `user_id` bigint unsigned NOT NULL, `description` varchar(200) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `permissions` varchar(10) COLLATE utf8mb4_unicode_520_ci NOT NULL, `consumer_key` char(64) COLLATE utf8mb4_unicode_520_ci NOT NULL, `consumer_secret` char(43) COLLATE utf8mb4_unicode_520_ci NOT NULL, `nonces` longtext COLLATE utf8mb4_unicode_520_ci, `truncated_key` char(7) COLLATE utf8mb4_unicode_520_ci NOT NULL, `last_access` datetime DEFAULT NULL, PRIMARY KEY (`key_id`), KEY `consumer_key` (`consumer_key`), KEY `consumer_secret` (`consumer_secret`)) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_woocommerce_api_keys` (`key_id`, `user_id`, `description`, `permissions`, `consumer_key`, `consumer_secret`, `nonces`, `truncated_key`, `last_access`) VALUES (1,1,'Pirate Ship - API (2024-09-04 04:12:30)','read_write','fc315a16508195ea8e1b4542997b576b20ce7258b1b529a7345ccb99177f5f77','cs_555c4ed09464dab06f53c1470c3cfffa38b2eca0',NULL,'e06e9f8','2025-07-29 23:00:51');
