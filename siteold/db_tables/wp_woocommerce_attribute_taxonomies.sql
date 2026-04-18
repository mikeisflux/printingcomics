/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_attribute_taxonomies`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_attribute_taxonomies`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_attribute_taxonomies` ( `attribute_id` bigint unsigned NOT NULL AUTO_INCREMENT, `attribute_name` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `attribute_label` varchar(200) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `attribute_type` varchar(20) COLLATE utf8mb4_unicode_520_ci NOT NULL, `attribute_orderby` varchar(20) COLLATE utf8mb4_unicode_520_ci NOT NULL, `attribute_public` int NOT NULL DEFAULT '1', PRIMARY KEY (`attribute_id`), KEY `attribute_name` (`attribute_name`(20))) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_woocommerce_attribute_taxonomies` (`attribute_id`, `attribute_name`, `attribute_label`, `attribute_type`, `attribute_orderby`, `attribute_public`) VALUES (2,'interior-paper','Interior Paper','select','menu_order',0),(6,'interiors','Interiors','select','menu_order',0),(7,'interior-page-count','Interior Page Count','select','menu_order',0);
