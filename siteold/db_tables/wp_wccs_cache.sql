/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wccs_cache`; */
/* PRE_TABLE_NAME: `1776400480_wp_wccs_cache`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wccs_cache` ( `id` bigint NOT NULL AUTO_INCREMENT, `product_id` bigint NOT NULL, `cache_type` varchar(20) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `value` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
