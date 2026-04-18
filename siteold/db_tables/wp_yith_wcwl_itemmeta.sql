/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_yith_wcwl_itemmeta`; */
/* PRE_TABLE_NAME: `1776400480_wp_yith_wcwl_itemmeta`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_yith_wcwl_itemmeta` ( `meta_id` bigint NOT NULL AUTO_INCREMENT, `yith_wcwl_item_id` bigint NOT NULL, `meta_key` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `meta_value` longtext COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`meta_id`), KEY `item_id` (`yith_wcwl_item_id`), KEY `meta_key` (`meta_key`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
