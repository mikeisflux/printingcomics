/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_orders_meta`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_orders_meta`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_orders_meta` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `order_id` bigint unsigned DEFAULT NULL, `meta_key` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `meta_value` text COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`id`), KEY `meta_key_value` (`meta_key`(100),`meta_value`(82)), KEY `order_id_meta_key_meta_value` (`order_id`,`meta_key`(100),`meta_value`(82))) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_wc_orders_meta` (`id`, `order_id`, `meta_key`, `meta_value`) VALUES (8,19699,'wt_pklist_order_language','en_US'),(9,19700,'wt_pklist_order_language','en_US'),(10,19700,'wf_invoice_number',19700),(11,19700,'_wf_invoice_date',1726484426),(12,19702,'wt_pklist_order_language','en_US'),(13,19702,'wf_invoice_number',19702),(14,19702,'_wf_invoice_date',1726763333);
