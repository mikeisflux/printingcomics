/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_order_tax_lookup`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_order_tax_lookup`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_order_tax_lookup` ( `order_id` bigint unsigned NOT NULL, `tax_rate_id` bigint unsigned NOT NULL, `date_created` datetime NOT NULL DEFAULT '0000-00-00 00:00:00', `shipping_tax` double NOT NULL DEFAULT '0', `order_tax` double NOT NULL DEFAULT '0', `total_tax` double NOT NULL DEFAULT '0', PRIMARY KEY (`order_id`,`tax_rate_id`), KEY `tax_rate_id` (`tax_rate_id`), KEY `date_created` (`date_created`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_wc_order_tax_lookup` (`order_id`, `tax_rate_id`, `date_created`, `shipping_tax`, `order_tax`, `total_tax`) VALUES (19700,1,'2024-09-16 11:00:26',8.83,36.63,45.46),(19702,1,'2024-09-19 16:28:53',2.94,9.969192,12.909192);
