/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_shipping_zones`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_shipping_zones`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_shipping_zones` ( `zone_id` bigint unsigned NOT NULL AUTO_INCREMENT, `zone_name` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `zone_order` bigint unsigned NOT NULL, PRIMARY KEY (`zone_id`), KEY `zone_order_id` (`zone_order`,`zone_id`)) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_woocommerce_shipping_zones` (`zone_id`, `zone_name`, `zone_order`) VALUES (1,'United States (US)',0);
