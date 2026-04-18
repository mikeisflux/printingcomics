/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_product_attributes_lookup`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_product_attributes_lookup`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_product_attributes_lookup` ( `product_id` bigint NOT NULL, `product_or_parent_id` bigint NOT NULL, `taxonomy` varchar(32) COLLATE utf8mb4_unicode_520_ci NOT NULL, `term_id` bigint NOT NULL, `is_variation_attribute` tinyint(1) NOT NULL, `in_stock` tinyint(1) NOT NULL, PRIMARY KEY (`product_or_parent_id`,`term_id`,`product_id`,`taxonomy`), KEY `is_variation_attribute_term_id` (`is_variation_attribute`,`term_id`), KEY `product_id` (`product_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
