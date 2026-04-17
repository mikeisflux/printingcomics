/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wc_tax_rate_classes`; */
/* PRE_TABLE_NAME: `1776400480_wp_wc_tax_rate_classes`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wc_tax_rate_classes` ( `tax_rate_class_id` bigint unsigned NOT NULL AUTO_INCREMENT, `name` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `slug` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', PRIMARY KEY (`tax_rate_class_id`), UNIQUE KEY `slug` (`slug`(191))) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_wc_tax_rate_classes` (`tax_rate_class_id`, `name`, `slug`) VALUES (1,'Reduced rate','reduced-rate'),(2,'Zero rate','zero-rate');
