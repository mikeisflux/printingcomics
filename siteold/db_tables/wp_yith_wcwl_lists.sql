/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_yith_wcwl_lists`; */
/* PRE_TABLE_NAME: `1776400480_wp_yith_wcwl_lists`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_yith_wcwl_lists` ( `ID` bigint NOT NULL AUTO_INCREMENT, `user_id` bigint DEFAULT NULL, `session_id` varchar(255) DEFAULT NULL, `wishlist_slug` varchar(200) NOT NULL, `wishlist_name` text, `wishlist_token` varchar(64) NOT NULL, `wishlist_privacy` tinyint(1) NOT NULL DEFAULT '0', `is_default` tinyint(1) NOT NULL DEFAULT '0', `dateadded` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `expiration` timestamp NULL DEFAULT NULL, PRIMARY KEY (`ID`), UNIQUE KEY `wishlist_token` (`wishlist_token`), UNIQUE KEY `wishlist_token_2` (`wishlist_token`), KEY `wishlist_slug` (`wishlist_slug`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
