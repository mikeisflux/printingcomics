/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_shipping_zone_locations`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_shipping_zone_locations`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_shipping_zone_locations` ( `location_id` bigint unsigned NOT NULL AUTO_INCREMENT, `zone_id` bigint unsigned NOT NULL, `location_code` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `location_type` varchar(40) COLLATE utf8mb4_unicode_520_ci NOT NULL, PRIMARY KEY (`location_id`), KEY `zone_id` (`zone_id`), KEY `location_type_code` (`location_type`(10),`location_code`(20))) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_woocommerce_shipping_zone_locations` (`location_id`, `zone_id`, `location_code`, `location_type`) VALUES (1,1,'US','country');
