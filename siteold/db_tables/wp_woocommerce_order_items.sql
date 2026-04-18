/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_woocommerce_order_items`; */
/* PRE_TABLE_NAME: `1776400480_wp_woocommerce_order_items`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_woocommerce_order_items` ( `order_item_id` bigint unsigned NOT NULL AUTO_INCREMENT, `order_item_name` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `order_item_type` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `order_id` bigint unsigned NOT NULL, PRIMARY KEY (`order_item_id`), KEY `order_id` (`order_id`)) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_woocommerce_order_items` (`order_item_id`, `order_item_name`, `order_item_type`, `order_id`) VALUES (11,'Comics - Saddle stitch (staple binding)','line_item',19700),(12,'Comics - Saddle stitch (staple binding)','line_item',19700),(13,'Comics - Saddle stitch (staple binding)','line_item',19700),(14,'Comics - Saddle stitch (staple binding)','line_item',19700),(15,'Comic 27% off','fee',19700),(16,'UPS','shipping',19700),(17,'TAX-1','tax',19700),(18,'Comics - Saddle stitch (staple binding)','line_item',19702),(19,'Comic 22% off','fee',19702),(20,'UPS','shipping',19702),(21,'TAX-1','tax',19702);
