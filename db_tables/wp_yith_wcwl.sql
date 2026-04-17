/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_yith_wcwl`; */
/* PRE_TABLE_NAME: `1776400480_wp_yith_wcwl`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_yith_wcwl` ( `ID` bigint NOT NULL AUTO_INCREMENT, `prod_id` bigint NOT NULL, `quantity` int NOT NULL, `user_id` bigint DEFAULT NULL, `wishlist_id` bigint DEFAULT NULL, `position` int DEFAULT '0', `original_price` decimal(9,3) DEFAULT NULL, `original_currency` char(3) DEFAULT NULL, `dateadded` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `on_sale` tinyint NOT NULL DEFAULT '0', PRIMARY KEY (`ID`), KEY `prod_id` (`prod_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
