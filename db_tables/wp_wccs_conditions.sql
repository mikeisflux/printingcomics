/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wccs_conditions`; */
/* PRE_TABLE_NAME: `1776400480_wp_wccs_conditions`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wccs_conditions` ( `id` bigint NOT NULL AUTO_INCREMENT, `type` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL, `name` mediumtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `ordering` mediumint NOT NULL DEFAULT '0', `status` tinyint NOT NULL DEFAULT '1', PRIMARY KEY (`id`)) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_wccs_conditions` (`id`, `type`, `name`, `ordering`, `status`) VALUES (4,'cart-discount','12% off',1,0),(5,'cart-discount','15% off',1,0),(6,'cart-discount','20% off',1,0),(7,'cart-discount','25% off',1,0),(8,'cart-discount','30% off',1,0),(9,'cart-discount','35% off',1,0),(10,'cart-discount','45% off',1,0),(11,'cart-discount','50% off',1,0),(12,'products-list','Products',1,1);
