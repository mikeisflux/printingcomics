/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_gla_attribute_mapping_rules`; */
/* PRE_TABLE_NAME: `1776400480_wp_gla_attribute_mapping_rules`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_gla_attribute_mapping_rules` ( `id` bigint NOT NULL AUTO_INCREMENT, `attribute` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL, `source` varchar(100) COLLATE utf8mb4_unicode_520_ci NOT NULL, `category_condition_type` varchar(10) COLLATE utf8mb4_unicode_520_ci NOT NULL, `categories` text COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
