/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_gla_merchant_issues`; */
/* PRE_TABLE_NAME: `1776400480_wp_gla_merchant_issues`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_gla_merchant_issues` ( `id` bigint NOT NULL AUTO_INCREMENT, `product_id` bigint NOT NULL, `issue` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `code` varchar(100) COLLATE utf8mb4_unicode_520_ci NOT NULL, `severity` varchar(20) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'warning', `product` varchar(100) COLLATE utf8mb4_unicode_520_ci NOT NULL, `action` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `action_url` varchar(1024) COLLATE utf8mb4_unicode_520_ci NOT NULL, `applicable_countries` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `source` varchar(10) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'mc', `type` varchar(10) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'product', `created_at` datetime NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
